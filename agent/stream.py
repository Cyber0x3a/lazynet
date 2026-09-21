"""Stream server: server -> client push over loopback TCP (NDJSON).

Handshake: the client sends one line {"token": "..."}; the server replies
{"type": "hello", "data": {"status": <agent.status data>}} and registers the
connection as a subscriber. A hub thread then fans out metrics ticks, event
rows and session state changes to every subscriber. Dead sockets are dropped
silently
"""

import logging
import queue
import socketserver
import threading
import time

from . import protocol

logger = logging.getLogger("lazynet.agent.stream")

# Per-client backlog; a slower client is dropped rather than blocking others
_CLIENT_QUEUE_MAX = 256


class StreamHub:
    """Fan-out of push messages to all connected subscribers"""

    def __init__(self):
        self._lock = threading.Lock()
        self._subscribers = set()

    def register(self, client):
        with self._lock:
            self._subscribers.add(client)

    def unregister(self, client):
        with self._lock:
            self._subscribers.discard(client)

    def broadcast(self, msg_type, data):
        message = protocol.push_message(msg_type, data)
        with self._lock:
            subscribers = list(self._subscribers)
        for client in subscribers:
            try:
                client.enqueue(message)
            except Exception:
                self.unregister(client)

    @property
    def subscriber_count(self):
        with self._lock:
            return len(self._subscribers)

    def close_all(self):
        with self._lock:
            subscribers = list(self._subscribers)
        for client in subscribers:
            client.close()


class StreamClient:
    """One subscribed stream connection with its own writer thread"""

    def __init__(self, sock, hub):
        self._sock = sock
        self._hub = hub
        self._queue = queue.Queue(maxsize=_CLIENT_QUEUE_MAX)
        self._closed = threading.Event()
        self._writer = threading.Thread(
            target=self._writer_loop, name="stream-writer", daemon=True
        )

    def start(self):
        self._writer.start()

    def enqueue(self, message):
        """Queue a message for this client; drop the client if it lags"""
        if self._closed.is_set():
            raise ConnectionError("client closed")
        try:
            self._queue.put_nowait(message)
        except queue.Full:
            logger.debug("stream client too slow, dropping")
            self.close()
            raise ConnectionError("client queue full")

    def _writer_loop(self):
        last_send = 0.0
        while not self._closed.is_set():
            try:
                message = self._queue.get(timeout=0.5)
            except queue.Empty:
                message = None
            if message is None:
                # heartbeat: keep the link alive through proxies and let the
                # peer detect a dead socket quickly, even when idle
                if time.monotonic() - last_send >= 10.0:
                    if not protocol.write_json_line(
                        self._sock, protocol.push_message("ping", {"ts": time.time()})
                    ):
                        break
                    last_send = time.monotonic()
                if self._closed.is_set():
                    break
                continue
            if not protocol.write_json_line(self._sock, message):
                break
            last_send = time.monotonic()
        self.close()

    def close(self):
        if self._closed.is_set():
            return
        self._closed.set()
        self._hub.unregister(self)
        try:
            self._sock.shutdown(2)  # SHUT_RDWR
        except OSError:
            pass
        try:
            self._sock.close()
        except OSError:
            pass

class StreamServer:
    """Accepts stream connections, runs the auth handshake, wires the hub"""

    def __init__(self, port, token, status_provider):
        self.port = port
        self.token = token
        self._status_provider = status_provider
        self.hub = StreamHub()
        self._server = None
        self._thread = None

    # --------------------------- lifecycle ---------------------------

    def start(self):
        outer = self

        class _Handler(StreamRequestHandler):
            server_context = outer

        class _TCPServer(socketserver.ThreadingTCPServer):
            daemon_threads = True
            # False on purpose: on Windows SO_REUSEADDR lets a second agent
            # bind the same port, splitting stream subscribers across processes
            allow_reuse_address = False

        self._server = _TCPServer((protocol.HOST, self.port), _Handler)
        self._thread = threading.Thread(
            target=self._server.serve_forever,
            kwargs={"poll_interval": 0.25},
            name="stream-server",
            daemon=True,
        )
        self._thread.start()
        logger.info("stream server listening on %s:%s", protocol.HOST, self.port)

    def stop(self):
        self.hub.close_all()
        if self._server is None:
            return
        self._server.shutdown()
        self._server.server_close()
        thread = self._thread
        if thread is not None and thread.is_alive() and thread is not threading.current_thread():
            thread.join(timeout=3)
        self._server = None
        self._thread = None

    # --------------------------- broadcast API ---------------------------

    def broadcast_metrics(self, tick):
        self.hub.broadcast("metrics", tick)

    def broadcast_event(self, event_row):
        self.hub.broadcast("event", event_row)

    def broadcast_session(self, session_state):
        self.hub.broadcast("session", session_state)

    def broadcast_forwarding(self, forwarding_state):
        self.hub.broadcast("forwarding", forwarding_state)


class StreamRequestHandler(socketserver.StreamRequestHandler):
    """Handles one stream connection: auth, hello, then push until EOF"""

    timeout = 15

    def handle(self):
        server = self.server_context
        # Wake from rfile.readline at least once per second so the handler
        # notices client.close() during server shutdown and never parks
        # forever (keeps agent shutdown fast even with idle subscribers)
        try:
            self.request.settimeout(1.0)
        except OSError:
            return
        greeting = None
        auth_deadline = time.monotonic() + self.timeout
        while greeting is None:
            try:
                greeting = protocol.read_json_line(self.rfile)
            except TimeoutError:
                # 1s socket timeout: keep waiting for the auth greeting
                if time.monotonic() >= auth_deadline:
                    return
            except (ValueError, OSError, ConnectionError):
                return
        if greeting is None:
            return

        if greeting.get("token") != server.token:
            self._send(protocol.push_message("error", {"error": "unauthorized"}))
            return

        try:
            status = server._status_provider()
        except Exception as error:
            logger.exception("status provider failed")
            status = {"error": str(error)}

        if not self._send(protocol.push_message("hello", {"status": status})):
            return

        client = StreamClient(self.request, server.hub)
        server.hub.register(client)
        client.start()
        logger.debug("stream client %s subscribed", self.client_address)

        try:
            # Park on the socket; when the peer goes away, clean up
            while not client._closed.is_set():
                try:
                    line = self.rfile.readline(1024)
                except TimeoutError:
                    continue  # socket timeout: re-check the closed flag
                if not line:
                    break
        except (OSError, ConnectionError):
            pass
        finally:
            client.close()

    def _send(self, message):
        try:
            self.wfile.write(protocol.encode_message(message))
            self.wfile.flush()
            return True
        except (OSError, ConnectionError):
            return False