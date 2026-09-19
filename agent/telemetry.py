"""
Telemetry collection for the LazyNet agent

Two sources of data:

1. Whole-machine NIC throughput, sampled once per second via
   psutil.net_io_counters() (always on, even with no session).
2. A scapy sniff thread that runs only while a session is active. It uses a
   BPF filter matching the target/gateway IPs (or any ARP frame), classifies
   each packet into protocol buckets, counts forged-ARP "poison bursts"
   (ARP replies whose hwsrc is our own interface MAC) and keeps a bounded
   packet log

listeners get metrics ticks and event rows
"""

import logging
import threading
import time
from collections import deque

import psutil
from scapy.all import ARP, DNS, ICMP, IP, TCP, UDP

from lib.shared.packets import sniff_packets

logger = logging.getLogger("lazynet.agent.telemetry")

PROTO_KEYS = ("tcp", "udp", "dns", "icmp", "arp", "other")

EVENT_LEVELS = ("info", "success", "warn", "error")

# Give up on the capture thread after this many consecutive sniff errors.
_MAX_CAPTURE_ERRORS = 5


def _zero_proto_counts():
    return {key: 0 for key in PROTO_KEYS}


class TelemetryCollector:
    def __init__(self, retention_s=3600, packet_log_max=500, event_log_max=300):
        self._lock = threading.RLock()
        self._ticks = deque(maxlen=max(1, int(retention_s)))
        self._packets = deque(maxlen=max(1, int(packet_log_max)))
        self._packets_dropped = 0
        self._events = deque(maxlen=max(1, int(event_log_max)))
        self._events_dropped = 0
        self._poison_bursts_total = 0

        # Per second accumulators, folded into a MetricTick by the sampler
        self._pending = self._fresh_pending()

        self._listeners = {"metrics": [], "event": []}

        self._stop = threading.Event()
        self._sampler_thread = None
        self._last_counters = None

        self._capture_stop = threading.Event()
        self._capture_thread = None
        # dict(target_ip, gateway_ip, interface, attacker_mac) while running
        self._capture = None

    @staticmethod
    def _fresh_pending():
        pending = _zero_proto_counts()
        pending.update({"packets": 0, "bytes": 0, "poison_bursts": 0})
        return pending

    # ------------------------- listener wiring -------------------------

    def add_listener(self, channel, callback):
        """Register a callback for 'metrics' (MetricTick) or 'event' (EventRow)."""
        with self._lock:
            if channel not in self._listeners:
                raise ValueError(f"unknown telemetry channel: {channel}")
            self._listeners[channel].append(callback)

    def _emit(self, channel, payload):
        with self._lock:
            callbacks = list(self._listeners[channel])
        for callback in callbacks:
            try:
                callback(payload)
            except Exception:
                logger.exception("telemetry %s listener failed", channel)

    # --------------------------- lifecycle ---------------------------

    def start(self):
        """Start the 1s sampler thread"""
        with self._lock:
            if self._sampler_thread is not None:
                return
            self._stop.clear()
            try:
                counters = psutil.net_io_counters()
                if counters is not None:
                    self._last_counters = (counters.bytes_recv, counters.bytes_sent)
            except Exception as error:
                logger.warning("net_io_counters unavailable: %s", error)
            self._sampler_thread = threading.Thread(
                target=self._sampler_loop,
                name="telemetry-sampler",
                daemon=True,
            )
            self._sampler_thread.start()

    def stop(self):
        """Stop sampler and capture threads"""
        self._stop.set()
        self.stop_capture()
        thread = self._sampler_thread
        if thread is not None and thread.is_alive() and thread is not threading.current_thread():
            thread.join(timeout=3)
        with self._lock:
            self._sampler_thread = None
    # ------------------------- 1s metric sampler -------------------------

    def _sampler_loop(self):
        next_tick = time.monotonic()
        while not self._stop.is_set():
            tick = self._build_tick()
            self._emit("metrics", tick)
            next_tick += 1.0
            delay = next_tick - time.monotonic()
            if delay < 0:
                # Fell behind (slow listener); realign instead of bursting
                next_tick = time.monotonic()
                delay = 1.0
            self._stop.wait(delay)

    def _build_tick(self):
        rx = tx = 0
        try:
            counters = psutil.net_io_counters()
            if counters is not None:
                rx, tx = counters.bytes_recv, counters.bytes_sent
        except Exception as error:
            logger.debug("net_io_counters failed: %s", error)

        with self._lock:
            if self._last_counters is None:
                delta_rx = delta_tx = 0
            else:
                delta_rx = max(0, rx - self._last_counters[0])
                delta_tx = max(0, tx - self._last_counters[1])
            self._last_counters = (rx, tx)

            pending = self._pending
            self._pending = self._fresh_pending()
            self._poison_bursts_total += pending["poison_bursts"]

            tick = {
                "ts": time.time(),
                "iface_rx_bytes": delta_rx,
                "iface_tx_bytes": delta_tx,
                "cap_packets": pending["packets"],
                "cap_bytes": pending["bytes"],
                "proto": {key: pending[key] for key in PROTO_KEYS},
                "poison_bursts": pending["poison_bursts"],
                "session_active": self._capture is not None,
            }
            self._ticks.append(tick)
            return tick

    # --------------------------- packet capture ---------------------------

    def start_capture(self, target_ip, gateway_ip, interface, attacker_mac):
        """Start the scapy sniff thread for a running session."""
        self.stop_capture()
        with self._lock:
            self._capture = {
                "target_ip": target_ip,
                "gateway_ip": gateway_ip,
                "interface": interface,
                "attacker_mac": (attacker_mac or "").lower(),
            }
            self._poison_bursts_total = 0
            self._pending = self._fresh_pending()

        # Match traffic to/from target or gateway, plus all ARP (needed to
        # observe our own forged replies, whose L3 addresses are spoofed)
        bpf = f"host {target_ip} or host {gateway_ip} or arp"
        self._capture_stop.clear()
        self._capture_thread = threading.Thread(
            target=self._capture_loop,
            args=(interface, bpf),
            name="telemetry-capture",
            daemon=True,
        )
        self._capture_thread.start()
        logger.info("capture started on %s (filter: %s)", interface, bpf)

    def stop_capture(self):
        """Stop the sniff thread (idempotent, safe from any thread)"""
        self._capture_stop.set()
        thread = self._capture_thread
        if (
            thread is not None
            and thread.is_alive()
            and thread is not threading.current_thread()
        ):
            thread.join(timeout=3)
        with self._lock:
            self._capture_thread = None
            self._capture = None

    def _capture_loop(self, interface, bpf):
        consecutive_errors = 0
        while not self._capture_stop.is_set():
            try:
                # 1s timeout so the stop flag is checked at least that often
                sniff_packets(
                    interface=interface,
                    timeout=1,
                    filter_expression=bpf,
                    on_packet=self._handle_packet,
                )
                consecutive_errors = 0
            except Exception as error:
                consecutive_errors += 1
                logger.error("capture error: %s", error)
                self.log_event("error", "telemetry.capture", f"Packet capture error: {error}")
                if consecutive_errors >= _MAX_CAPTURE_ERRORS:
                    self.log_event(
                        "error",
                        "telemetry.capture",
                        "Packet capture disabled after repeated errors",
                    )
                    break
                if self._capture_stop.wait(2.0):
                    break
        with self._lock:
            if self._capture_thread is threading.current_thread():
                self._capture = None
    def _handle_packet(self, packet):
        """Sniff callback: classify, count and log one packet."""
        try:
            proto, src, dst, info = self._classify(packet)
        except Exception:
            proto, src, dst, info = "OTHER", "", "", ""

        try:
            length = int(len(packet))
        except Exception:
            length = 0

        is_poison = False
        with self._lock:
            capture = self._capture
        if capture and ARP in packet:
            arp = packet[ARP]
            if arp.op == 2 and arp.hwsrc and arp.hwsrc.lower() == capture["attacker_mac"]:
                is_poison = True

        row = {
            "ts": time.time(),
            "src": src,
            "dst": dst,
            "proto": proto,
            "len": length,
            "info": info,
        }

        with self._lock:
            if len(self._packets) == self._packets.maxlen:
                self._packets_dropped += 1
            self._packets.append(row)
            self._pending["packets"] += 1
            self._pending["bytes"] += length
            key = proto.lower()
            self._pending[key if key in PROTO_KEYS else "other"] += 1
            if is_poison:
                self._pending["poison_bursts"] += 1

    # ------------------------- packet classification -------------------------

    def _classify(self, packet):
        """Return (proto, src, dst, info) for a scapy packet"""
        if ARP in packet:
            arp = packet[ARP]
            if arp.op == 1:
                info = f"ARP who-has {arp.pdst} tell {arp.psrc}"
            elif arp.op == 2:
                info = f"ARP reply {arp.psrc} is-at {arp.hwsrc}"
            else:
                info = f"ARP op {arp.op}"
            return "ARP", str(arp.psrc), str(arp.pdst), info

        if IP in packet:
            ip = packet[IP]
            src, dst = str(ip.src), str(ip.dst)
            if TCP in ip:
                tcp = ip[TCP]
                if int(tcp.sport) == 53 or int(tcp.dport) == 53:
                    return "DNS", src, dst, self._dns_info(packet, tcp.sport, tcp.dport)
                return "TCP", src, dst, f"{tcp.sport} -> {tcp.dport}"
            if UDP in ip:
                udp = ip[UDP]
                if int(udp.sport) == 53 or int(udp.dport) == 53:
                    return "DNS", src, dst, self._dns_info(packet, udp.sport, udp.dport)
                return "UDP", src, dst, f"{udp.sport} -> {udp.dport}"
            if ICMP in ip:
                return "ICMP", src, dst, f"ICMP type {ip[ICMP].type}"
            return "OTHER", src, dst, f"IP proto {ip.proto}"

        return "OTHER", "", "", packet.summary()[:64]

    @staticmethod
    def _dns_info(packet, sport, dport):
        fallback = f"{sport} -> {dport}"
        try:
            dns = packet[DNS]
            name = ""
            if dns.qdcount and dns.qd is not None:
                qname = dns.qd.qname
                name = qname.decode("utf-8", "replace") if isinstance(qname, bytes) else str(qname)
                name = name.rstrip(".")
            kind = "response" if dns.qr else "query"
            return f"DNS {kind} {name}".strip()
        except Exception:
            return fallback
    # ------------------------------ queries ------------------------------

    def snapshot(self, seconds=None):
        """MetricTick series (optionally only the last seconds) + latest tick"""
        with self._lock:
            ticks = list(self._ticks)
            latest = ticks[-1] if ticks else None
        if seconds is not None:
            cutoff = time.time() - float(seconds)
            ticks = [tick for tick in ticks if tick["ts"] >= cutoff]
        return {"series": ticks, "latest": latest}

    def packets_list(self, limit=None, proto=None, search=None):
        """Bounded packet log with optional protocol/search filters"""
        with self._lock:
            rows = list(self._packets)
            dropped = self._packets_dropped

        if proto:
            wanted = str(proto).upper()
            rows = [row for row in rows if row["proto"] == wanted]
        if search:
            needle = str(search).lower()
            rows = [
                row
                for row in rows
                if needle in row["src"].lower()
                or needle in row["dst"].lower()
                or needle in row["info"].lower()
                or needle in row["proto"].lower()
            ]

        total = len(rows)
        if limit is not None:
            limit = max(0, int(limit))
            rows = rows[-limit:] if limit else []
        return {"packets": rows, "total": total, "dropped": dropped}

    def events_list(self, limit=None):
        """Most recent event rows (chronological order)"""
        with self._lock:
            rows = list(self._events)
        if limit is not None:
            limit = max(0, int(limit))
            rows = rows[-limit:] if limit else []
        return {"events": rows}

    def get_poison_bursts(self):
        """Total forged ARP replies observed since the session started"""
        with self._lock:
            return self._poison_bursts_total

    # ------------------------------ events ------------------------------

    def log_event(self, level, kind, message):
        """Append an EventRow and push it to stream subscribers"""
        if level not in EVENT_LEVELS:
            level = "info"
        row = {"ts": time.time(), "level": level, "kind": str(kind), "message": str(message)}
        with self._lock:
            if len(self._events) == self._events.maxlen:
                self._events_dropped += 1
            self._events.append(row)
        self._emit("event", row)
        return row

    # --------------------------- reconfiguration ---------------------------

    def apply_limits(self, retention_s=None, packet_log_max=None, event_log_max=None):
        """Resize the ring buffers, keeping the most recent entries"""
        with self._lock:
            if retention_s is not None:
                retention_s = max(1, int(retention_s))
                if retention_s != self._ticks.maxlen:
                    self._ticks = deque(self._ticks, maxlen=retention_s)
            if packet_log_max is not None:
                packet_log_max = max(1, int(packet_log_max))
                if packet_log_max != self._packets.maxlen:
                    self._packets = deque(self._packets, maxlen=packet_log_max)
            if event_log_max is not None:
                event_log_max = max(1, int(event_log_max))
                if event_log_max != self._events.maxlen:
                    self._events = deque(self._events, maxlen=event_log_max)