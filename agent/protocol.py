"""Shared wire protocol helpers for the LazyNet agent

Transport (per CONTRACT.md): TCP loopback, newline delimited JSON (NDJSON),
one JSON object per line, UTF-8
"""

import json
import os
import socket

DEFAULT_TOKEN = "lazynet-dev"
DEFAULT_CMD_PORT = 7737
DEFAULT_STREAM_PORT = 7738
HOST = "127.0.0.1"

# 1 MiB is far beyond any legitimate message; protects against memory abuse
MAX_LINE_BYTES = 1024 * 1024


def resolve_token(cli_token=None):
    """Token load order: CLI argument > LAZYNET_TOKEN env > builtin default """
    if cli_token:
        return cli_token
    env_token = os.environ.get("LAZYNET_TOKEN")
    if env_token:
        return env_token
    return DEFAULT_TOKEN


def resolve_port(cli_port, env_name, default):
    """Port load order: CLI argument > env var > default"""
    if cli_port is not None:
        return int(cli_port)
    env_value = os.environ.get(env_name)
    if env_value:
        try:
            return int(env_value)
        except ValueError:
            pass
    return default


def encode_message(obj):
    """Serialize one message to a single NDJSON line (bytes, newline-terminated)"""
    return (json.dumps(obj, separators=(",", ":")) + "\n").encode("utf-8")


def read_json_line(sock_file):
    """Read one NDJSON line from a socket file object

    Returns the parsed dict, or None on clean EOF / disconnect
    Raises ValueError on invalid JSON or non-object payloads
    """
    line = sock_file.readline(MAX_LINE_BYTES + 1)
    if not line:
        return None
    if len(line) > MAX_LINE_BYTES:
        raise ValueError("line too long")
    data = json.loads(line.decode("utf-8", errors="replace").strip())
    if not isinstance(data, dict):
        raise ValueError("message must be a JSON object")
    return data


def write_json_line(sock, obj):
    """Write one NDJSON line to a socket Returns False if the peer is gone"""
    try:
        sock.sendall(encode_message(obj))
        return True
    except (OSError, BrokenPipeError, ConnectionResetError):
        return False


def ok_response(request_id, data):
    return {"id": request_id, "ok": True, "data": data}


def error_response(request_id, message):
    return {"id": request_id, "ok": False, "error": str(message)}


def push_message(msg_type, data):
    return {"type": msg_type, "data": data}


def make_server_socket(port, backlog=8):
    """Create a bound+listening loopback TCP socket with SO_REUSEADDR"""
    srv = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    srv.bind((HOST, port))
    srv.listen(backlog)
    return srv
