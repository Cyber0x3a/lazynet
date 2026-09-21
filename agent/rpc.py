"""Command server: NDJSON request/response over loopback TCP

One thread per connection (socketserver.ThreadingTCPServer) Every request
must carry the auth token all handler exceptions become ok:false responses
"""

import logging
import os
import platform
import socketserver
import threading
import time

import scapy

from . import __version__
from . import protocol

logger = logging.getLogger("lazynet.agent.rpc")

_STARTED_AT = time.monotonic()


class CommandServer:
    """Owns the TCP listener and the command dispatch table"""

    def __init__(self, port, token, context):
        self.port = port
        self.token = token
        self.context = context
        self._server = None
        self._thread = None
        self._handlers = {
            "agent.ping": self._cmd_ping,
            "agent.status": self._cmd_status,
            "agent.shutdown": self._cmd_agent_shutdown,
            "agent.elevate": self._cmd_agent_elevate,
            "interfaces.list": self._cmd_interfaces_list,
            "session.start": self._cmd_session_start,
            "session.stop": self._cmd_session_stop,
            "session.verify": self._cmd_session_verify,
            "forwarding.set": self._cmd_forwarding_set,
            "metrics.snapshot": self._cmd_metrics_snapshot,
            "packets.list": self._cmd_packets_list,
            "events.list": self._cmd_events_list,
            "config.get": self._cmd_config_get,
            "config.set": self._cmd_config_set,
        }

    # --------------------------- lifecycle ---------------------------

    def start(self):
        """Bind and serve in a daemon thread."""
        outer = self

        class _Handler(CommandRequestHandler):
            server_context = outer

        class _TCPServer(socketserver.ThreadingTCPServer):
            daemon_threads = True
            # False on purpose: on Windows SO_REUSEADDR lets a second agent
            # bind the same port, splitting RPC across two processes
            allow_reuse_address = False

        self._server = _TCPServer((protocol.HOST, self.port), _Handler)
        self._thread = threading.Thread(
            target=self._server.serve_forever,
            kwargs={"poll_interval": 0.25},
            name="rpc-server",
            daemon=True,
        )
        self._thread.start()
        logger.info("command server listening on %s:%s", protocol.HOST, self.port)

    def stop(self):
        if self._server is None:
            return
        self._server.shutdown()
        self._server.server_close()
        thread = self._thread
        if thread is not None and thread.is_alive() and thread is not threading.current_thread():
            thread.join(timeout=3)
        self._server = None
        self._thread = None

    # --------------------------- dispatch ---------------------------

    def handle_request(self, request):
        """Auth + dispatch one decoded request, always returns a response dict"""
        request_id = request.get("id")

        if request.get("token") != self.token:
            return protocol.error_response(request_id, "unauthorized")

        cmd = request.get("cmd")
        if not isinstance(cmd, str) or not cmd:
            return protocol.error_response(request_id, "missing or invalid 'cmd'")

        handler = self._handlers.get(cmd)
        if handler is None:
            return protocol.error_response(request_id, f"unknown command: {cmd}")

        params = request.get("params") or {}
        if not isinstance(params, dict):
            return protocol.error_response(request_id, "'params' must be an object")

        try:
            data = handler(params)
            return protocol.ok_response(request_id, data)
        except Exception as error:
            logger.exception("command %s failed", cmd)
            return protocol.error_response(request_id, str(error))

    # --------------------------- handlers ---------------------------

    def _cmd_ping(self, params):
        return {
            "version": __version__,
            "platform": platform.system().lower(),
            "python": platform.python_version(),
            "scapy": scapy.__version__,
            "pid": os.getpid(),
            "uptime_s": round(time.monotonic() - _STARTED_AT, 3),
        }

    def _cmd_agent_shutdown(self, params):
        """Ask the agent to shut down cleanly (used by the web console, which
        owns the agent process). Runs in a thread so the response goes out
        before the process exits."""
        request_shutdown = getattr(self.context, "request_shutdown", None)
        if request_shutdown is None:
            raise RuntimeError("shutdown is not wired on this agent")
        threading.Thread(target=request_shutdown, name="agent-shutdown", daemon=True).start()
        return {"stopping": True}

    def _cmd_agent_elevate(self, params):
        """Relaunch the agent with admin/root rights, then exit this one.

        Returns {elevating: True} if a UAC/sudo relaunch was kicked off. The
        current instance shuts down right after replying so the elevated copy
        can take the same loopback ports; the console adopts it on reconnect.
        """
        from . import elevate

        if elevate.is_privileged():
            return {"elevating": False, "already_privileged": True}
        if elevate.already_elevated_child():
            raise RuntimeError("elevation was already attempted this boot")
        request_shutdown = getattr(self.context, "request_shutdown", None)
        if request_shutdown is None:
            raise RuntimeError("shutdown is not wired on this agent")

        cmd_port = self.port
        stream_port = getattr(self.context, "stream_port", None)
        if not elevate.relaunch_elevated(cmd_port, stream_port):
            raise RuntimeError("this platform cannot self-elevate")

        self.context.telemetry.log_event(
            "info", "agent.elevate", "Elevation requested; relaunching agent with admin/root rights"
        )
        # Reply first, then exit so the elevated instance can bind the ports
        def _deferred_shutdown():
            time.sleep(0.4)
            request_shutdown()

        threading.Thread(target=_deferred_shutdown, name="agent-elevate", daemon=True).start()
        return {"elevating": True}

    def _cmd_status(self, params):
        from lib.shared.forwarding import get_forwarding_state
        from .forwarding import _is_privileged

        try:
            forwarding = get_forwarding_state()
        except Exception as error:
            logger.debug("get_forwarding_state failed: %s", error)
            forwarding = {"strategy": "unknown", "enabled": False}
        forwarding["privileged"] = _is_privileged()
        return {
            "session": self.context.session.get_state(),
            "forwarding": forwarding,
            "settings_version": self.context.settings.version,
        }

    def _cmd_interfaces_list(self, params):
        from lib.shared.network_interfaces import list_interfaces

        return {
            "interfaces": [
                {
                    "name": iface.name,
                    "display_name": iface.display_name,
                    "ipv4": iface.ipv4,
                    "netmask": iface.netmask,
                    "mac": iface.mac,
                    "is_default": bool(iface.is_default),
                    "is_usable": bool(iface.is_usable),
                }
                for iface in list_interfaces()
            ]
        }
    def _cmd_session_start(self, params):
        return {"session": self.context.session.start(params)}

    def _cmd_session_stop(self, params):
        self.context.session.stop()
        # The engine's own stop() disables IP forwarding; put the agent's
        # auto_forwarding policy back in effect if needed
        self.context.forwarding.reconcile("post-session reconcile")
        return {"stopped": True}

    def _cmd_session_verify(self, params):
        method = params.get("method", "auto")
        timeout = params.get("timeout")
        return self.context.session.verify(method=method, timeout=timeout, wait=True)

    def _cmd_forwarding_set(self, params):
        enabled = params.get("enabled")
        if not isinstance(enabled, bool):
            raise ValueError("'enabled' must be a boolean")
        # ForwardingManager applies the change, logs a 'forwarding' event
        # and broadcasts the new state to stream subscribers
        return self.context.forwarding.set(enabled)

    def _cmd_metrics_snapshot(self, params):
        seconds = params.get("seconds")
        return self.context.telemetry.snapshot(seconds=seconds)

    def _cmd_packets_list(self, params):
        return self.context.telemetry.packets_list(
            limit=params.get("limit"),
            proto=params.get("proto"),
            search=params.get("search"),
            field=params.get("field"),
        )

    def _cmd_events_list(self, params):
        return self.context.telemetry.events_list(limit=params.get("limit"))

    def _cmd_config_get(self, params):
        settings, version = self.context.settings.get_with_version()
        return {"settings": settings, "version": version}

    def _cmd_config_set(self, params):
        patch = params.get("patch")
        if not isinstance(patch, dict):
            raise ValueError("config.set requires a 'patch' object")
        settings, version = self.context.settings.apply_patch(patch)
        # Telemetry buffers may have been resized
        telemetry_settings = settings.get("telemetry", {})
        self.context.telemetry.apply_limits(
            retention_s=telemetry_settings.get("retention_s"),
            packet_log_max=telemetry_settings.get("packet_log_max"),
            event_log_max=telemetry_settings.get("event_log_max"),
        )
        # safety.auto_forwarding may have been toggled on: re-enable
        # forwarding if the effective state is currently disabled
        # (turning it off leaves the current state untouched)
        self.context.forwarding.reconcile("config.set auto_forwarding")
        self.context.telemetry.log_event(
            "info", "config.set", f"Settings updated (version {version})"
        )
        return {"settings": settings, "version": version}


class CommandRequestHandler(socketserver.StreamRequestHandler):
    """Reads NDJSON request lines and writes NDJSON responses until EOF"""

    timeout = 30

    def handle(self):
        # 1s socket timeout keeps the daemon handler thread responsive:
        # it can never park in rfile.readline indefinitely, which would
        # stall interpreter shutdown if a client stays connected but idle
        try:
            self.request.settimeout(1.0)
        except OSError:
            return
        while True:
            try:
                request = protocol.read_json_line(self.rfile)
            except TimeoutError:
                continue  # idle client: re-check the socket once a second
            except ValueError as error:
                if not self._send(protocol.error_response(None, f"bad request: {error}")):
                    return
                continue
            except (OSError, ConnectionError):
                return  # client went away mid line

            if request is None:
                return  # clean disconnect

            response = self.server_context.handle_request(request)
            if not self._send(response):
                return

    def _send(self, response):
        try:
            self.wfile.write(protocol.encode_message(response))
            self.wfile.flush()
            return True
        except (OSError, ConnectionError):
            return False

    def handle_timeout(self):
        logger.debug("command client %s timed out", self.client_address)


class AgentContext:
    """Bag of shared services handed to the command server"""

    def __init__(self, settings, session, telemetry, forwarding):
        self.settings = settings
        self.session = session
        self.telemetry = telemetry
        self.forwarding = forwarding