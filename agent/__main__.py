"""LazyNet agent entry point: python -m agent

Starts the command server (RPC) and the stream server (push), the telemetry
collector and the session manager, then idles until SIGINT/SIGTERM
"""

import argparse
import logging
import signal
import sys
import threading

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


def main(argv=None):
    args = parse_args(argv)
    configure_logging(args.log_level)

    cmd_port = protocol.resolve_port(args.cmd_port, "LAZYNET_CMD_PORT", protocol.DEFAULT_CMD_PORT)
    stream_port = protocol.resolve_port(
        args.stream_port, "LAZYNET_STREAM_PORT", protocol.DEFAULT_STREAM_PORT
    )
    token = protocol.resolve_token(args.token)

    # ------------------------- build services -------------------------
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
        stream_port, token, status_provider=lambda: command_server._cmd_status({})
    )

    # ------------------------- wiring -------------------------
    telemetry.add_listener("metrics", stream_server.broadcast_metrics)
    telemetry.add_listener("event", stream_server.broadcast_event)
    session.add_listener(stream_server.broadcast_session)
    forwarding.set_broadcaster(stream_server.broadcast_forwarding)

    # ------------------------- run -------------------------
    shutdown_event = threading.Event()

    def request_shutdown(signum=None, frame=None):
        if not shutdown_event.is_set():
            logger.info("shutdown requested%s", f" (signal {signum})" if signum else "")
            shutdown_event.set()

    signal.signal(signal.SIGINT, request_shutdown)
    signal.signal(signal.SIGTERM, request_shutdown)

    try:
        telemetry.start()
        command_server.start()
        stream_server.start()
        # Enable IP forwarding up front when safety.auto_forwarding is on
        # (failures are logged as warn events inside the manager)
        forwarding.on_startup()
        # Let RPC "agent.shutdown" trigger the same clean path as SIGINT
        context.request_shutdown = request_shutdown
    except Exception as error:
        logger.error("failed to start agent: %s", error)
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
    logger.info(
        "agent ready: cmd=%s:%s stream=%s:%s pid=%s",
        protocol.HOST, cmd_port, protocol.HOST, stream_port,
        __import__("os").getpid(),
    )

    # Idle until a signal arrives
    shutdown_event.wait()

    # ------------------------- shutdown -------------------------
    logger.info("shutting down...")
    try:
        if session.is_running():
            session.stop()
        else:
            session.stop()  # no-op when idle, keeps logic simple
    except Exception:
        logger.exception("error stopping session during shutdown")
    telemetry.log_event("info", "agent.stop", "LazyNet agent shutting down")
    # Undo IP forwarding only if the agent itself enabled it
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