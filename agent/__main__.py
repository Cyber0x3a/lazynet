"""LazyNet agent entry point: python -m agent

Starts the command server (RPC) and the stream server (push), the telemetry
collector and the session manager, then idles until SIGINT/SIGTERM
"""

import argparse
import logging
import os
import signal
import sys
import threading
import time

from . import protocol
from .forwarding import ForwardingManager
from .rpc import AgentContext, CommandServer
from .session import SessionManager
from .settings import SettingsStore
from .stream import StreamServer
from .telemetry import TelemetryCollector

logger = logging.getLogger("lazynet.agent")


def parse_args(argv=None):
    parser = argparse.ArgumentParser(
        prog="agent",
        description="LazyNet agent worker (loopback IPC for the web console)",
    )
    parser.add_argument(
        "--cmd-port",
        type=int,
        default=None,
        help="command socket port (env LAZYNET_CMD_PORT, default 7737)",
    )
    parser.add_argument(
        "--stream-port",
        type=int,
        default=None,
        help="stream socket port (env LAZYNET_STREAM_PORT, default 7738)",
    )
    parser.add_argument(
        "--token",
        default=None,
        help="auth token (env LAZYNET_TOKEN, default lazynet-dev)",
    )
    parser.add_argument(
        "--log-level",
        default="INFO",
        choices=("DEBUG", "INFO", "WARNING", "ERROR"),
        help="logging verbosity (default INFO)",
    )
    return parser.parse_args(argv)


def configure_logging(level):
    logging.basicConfig(
        level=getattr(logging, level, logging.INFO),
        format="%(asctime)s %(levelname)-7s %(name)s: %(message)s",
        stream=sys.stderr,
    )


def start_with_retry(server, name, attempts=20, delay=0.4):
    """Start a server, retrying when the port is still busy.

    With allow_reuse_address=False a bind fails while the previous instance's
    sockets linger in TIME_WAIT (e.g. right after an elevation handover). The
    port frees within a second or two, so retry briefly before giving up.
    """
    for attempt in range(attempts):
        try:
            server.start()
            return
        except OSError as error:
            # 10048 / EADDRINUSE = port busy; anything else is a real failure
            if getattr(error, "winerror", None) not in (10048,) and "in use" not in str(error).lower():
                raise
            if attempt == attempts - 1:
                raise
            time.sleep(delay)
    raise RuntimeError(f"could not bind {name} server")


def main(argv=None):
    args = parse_args(argv)
    configure_logging(args.log_level)

    cmd_port = protocol.resolve_port(args.cmd_port, "LAZYNET_CMD_PORT", protocol.DEFAULT_CMD_PORT)
    stream_port = protocol.resolve_port(
        args.stream_port, "LAZYNET_STREAM_PORT", protocol.DEFAULT_STREAM_PORT
    )
    token = protocol.resolve_token(args.token)

    # build services
    settings = SettingsStore()
    telemetry_cfg = settings.section("telemetry")
    telemetry = TelemetryCollector(
        retention_s=telemetry_cfg.get("retention_s", 3600),
        packet_log_max=telemetry_cfg.get("packet_log_max", 500),
        event_log_max=telemetry_cfg.get("event_log_max", 300),
    )
    session = SessionManager(settings, telemetry)
    forwarding = ForwardingManager(settings, telemetry)
    context = AgentContext(settings, session, telemetry, forwarding)
    context.stream_port = stream_port

    command_server = CommandServer(cmd_port, token, context)
    stream_server = StreamServer(
        stream_port, token, status_provider=lambda: command_server.cmd_status({})
    )

    # wiring
    telemetry.add_listener("metrics", stream_server.broadcast_metrics)
    telemetry.add_listener("event", stream_server.broadcast_event)
    session.add_listener(stream_server.broadcast_session)
    forwarding.set_broadcaster(stream_server.broadcast_forwarding)

    # run
    shutdown_event = threading.Event()

    def request_shutdown(signum=None, frame=None):
        if shutdown_event.is_set():
            return
        suffix = f" signal {signum}" if signum else ""
        logger.info(f"shutdown requested{suffix}")
        shutdown_event.set()

    try:
        telemetry.start()
        start_with_retry(command_server, "command")
        start_with_retry(stream_server, "stream")
        # enable IP forwarding up front when auto_forwarding is on
        forwarding.on_startup()
        # let RPC agent.shutdown trigger the same clean path as SIGINT
        context.request_shutdown = request_shutdown
    except Exception as error:
        logger.error(f"failed to start agent: {error}")
        telemetry.stop()
        command_server.stop()
        stream_server.stop()
        return 1

    telemetry.log_event(
        "info",
        "agent.start",
        f"LazyNet agent started (cmd={protocol.HOST}:{cmd_port}, "
        f"stream={protocol.HOST}:{stream_port})",
    )
    logger.info(f"agent ready: cmd={protocol.HOST}:{cmd_port} stream={protocol.HOST}:{stream_port} pid={os.getpid()}")

    # Idle until a signal arrives
    shutdown_event.wait()

    # shutdown
    logger.info("shutting down...")
    try:
        session.stop()  # no-op when idle
    except Exception:
        logger.exception("error stopping session during shutdown")
    telemetry.log_event("info", "agent.stop", "LazyNet agent shutting down")
    # undo IP forwarding only if the agent itself enabled it
    try:
        forwarding.shutdown()
    except Exception:
        logger.exception("error restoring forwarding state during shutdown")
    stream_server.stop()
    command_server.stop()
    telemetry.stop()
    logger.info("agent stopped")
    return 0


if __name__ == "__main__":
    sys.exit(main())
