"""Session management: wraps lib's ARPPoisoningEngine with a thread-safe,
RPC-friendly state machine (idle -> running -> stopping -> idle)

The engine is only constructed when a session starts, verify() runs in
a dedicated worker thread, only one verification may run at a time
"""

import logging
import signal
import threading
import time

from lib.arp.config import ARPConfig
from lib.arp.core import ARPPoisoningEngine

logger = logging.getLogger("lazynet.agent.session")

STATE_IDLE = "idle"
STATE_RUNNING = "running"
STATE_STOPPING = "stopping"


def friendly_interface(scapy_name):
    """Map a Scapy/NPF interface name to its friendly display name ('Wi-Fi')"""
    if not scapy_name:
        return ""
    try:
        from lib.shared.network_interfaces import list_interfaces

        for iface in list_interfaces():
            if iface.name == scapy_name:
                return iface.display_name
    except Exception:
        pass
    return scapy_name


def start_engine(engine):
    """Start the engine without letting it hijack process signal handlers

    ARPPoisoningEngine.start() calls register_cleanup() which installs
    its own SIGINT/SIGBREAK handler (calling sys.exit(0)) -- and
    signal.signal raises ValueError outside the main thread, which is
    exactly where RPC handlers run. The agent owns signal handling and always
    calls session.stop() on shutdown, so we no-op signal.signal for
    the duration of engine.start(). atexit.register(engine.stop) still
    happens, which is a desirable safety net
    """
    real_signal = signal.signal

    def _noop_signal(signum, handler):
        return None

    signal.signal = _noop_signal
    try:
        engine.start()
    finally:
        signal.signal = real_signal


class SessionManager:
    """Owns the current ARP poisoning session (at most one)"""

    def __init__(self, settings, telemetry):
        self._settings = settings
        self._telemetry = telemetry
        self._lock = threading.RLock()
        self._verify_lock = threading.Lock()

        self._state = STATE_IDLE
        self._engine = None
        self._config_echo = None  # dict that went into ARPConfig
        self._started_at = None
        self._last_verify = None
        self._verify_thread = None

        self._listeners = []

    # listener wiring

    def add_listener(self, callback):
        """Register a callback invoked with the SessionState dict on changes."""
        with self._lock:
            self._listeners.append(callback)

    def _publish(self):
        state = self.get_state()
        with self._lock:
            callbacks = list(self._listeners)
        for callback in callbacks:
            try:
                callback(state)
            except Exception:
                logger.exception("session listener failed")

    # queries

    @property
    def state(self):
        with self._lock:
            return self._state

    def is_running(self):
        return self.state == STATE_RUNNING

    def get_state(self):
        """Build the contract SessionState dict"""
        with self._lock:
            engine = self._engine
            if self._state == STATE_RUNNING and engine is not None:
                target = {"ip": engine.target.ip, "mac": engine.target.mac} if engine.target else None
                gateway = {"ip": engine.gateway.ip, "mac": engine.gateway.mac} if engine.gateway else None
                attacker = None
                if engine.attacker_ip or engine.attacker_mac:
                    attacker = {
                        "ip": engine.attacker_ip,
                        "mac": engine.attacker_mac,
                        "interface": friendly_interface(engine.config.interface),
                    }
                config_echo = dict(self._config_echo) if self._config_echo else None
                started_at = self._started_at
            else:
                target = gateway = attacker = None
                config_echo = None
                started_at = None

            last_verify = dict(self._last_verify) if self._last_verify else None
            state = self._state

        poison_bursts = self._telemetry.get_poison_bursts() if state == STATE_RUNNING else 0

        return {
            "state": state,
            "config": config_echo,
            "target": target,
            "gateway": gateway,
            "attacker": attacker,
            "started_at": started_at,
            "poison_bursts": poison_bursts,
            "last_verify": last_verify,
        }

    # start

    def start(self, params):
        """Start a poisoning session

        params is the RPC params dict, anything omitted falls back to the
        persisted attack/safety/interface settings
        Returns the SessionState dict Raises on failure (engine is fully
        torn down first, so the manager ends up back in idle)
        """
        params = params or {}
        with self._lock:
            if self._state != STATE_IDLE:
                raise RuntimeError(f"a session is already {self._state}")
            self._state = STATE_RUNNING  # claimed, reverted on failure

        try:
            attack = self._settings.section("attack")
            safety = self._settings.section("safety")
            interface_prefs = self._settings.section("interface")

            target_ip = params.get("target_ip")
            gateway_ip = params.get("gateway_ip")
            if not target_ip:
                raise ValueError("target_ip is required")
            if not gateway_ip:
                raise ValueError("gateway_ip is required")

            direction = params.get("direction") or attack.get("direction", "two-way")
            if direction not in ("one-way", "two-way"):
                raise ValueError(f"direction must be 'one-way' or 'two-way', got {direction}")

            poison_interval = float(params.get("poison_interval") or attack.get("poison_interval", 1.5))
            verify_timeout = float(params.get("verify_timeout") or attack.get("verify_timeout", 5.0))

            # Interface: explicit param > persisted preference > auto detect
            # (ARPConfig calls pick_interface when interface is None)
            interface = params.get("interface") or interface_prefs.get("preferred") or None

            config = ARPConfig(
                target_ip=target_ip,
                gateway_ip=gateway_ip,
                interface=interface,
                direction=direction,
                poison_interval=poison_interval,
                verify_timeout=verify_timeout,
                verbose=False,
                skip_self_check=bool(safety.get("skip_self_check", False)),
            )

            config_echo = {
                "target_ip": config.target_ip,
                "gateway_ip": config.gateway_ip,
                "direction": config.direction,
                "interface": config.interface,
                "poison_interval": config.poison_interval,
                "verify_timeout": config.verify_timeout,
            }

            engine = ARPPoisoningEngine(config)
            try:
                start_engine(engine)
            except Exception:
                # start() registers atexit cleanup before doing any work, so a
                # half started engine still restores anything it changed
                try:
                    engine.stop()
                except Exception:
                    logger.exception("engine cleanup after failed start also failed")
                raise

            with self._lock:
                self._engine = engine
                self._config_echo = config_echo
                self._started_at = time.time()
                self._last_verify = None
                self._state = STATE_RUNNING

            self._telemetry.start_capture(
                target_ip=config.target_ip,
                gateway_ip=config.gateway_ip,
                interface=config.interface,
                attacker_mac=engine.attacker_mac,
            )

            self._telemetry.log_event(
                "success",
                "session.start",
                (
                    f"Session started: target={config.target_ip} gateway={config.gateway_ip} "
                    f"direction={config.direction} interface={config.interface} "
                    f"poison_interval={config.poison_interval}s verify_timeout={config.verify_timeout}s"
                ),
            )
            self._publish()
            return self.get_state()

        except Exception:
            with self._lock:
                self._engine = None
                self._config_echo = None
                self._started_at = None
                self._state = STATE_IDLE
            self._telemetry.stop_capture()
            raise
    # stop

    def stop(self):
        """Stop the running session and restore ARP tables/forwarding

        Idempotent: returns False if there was nothing to stop
        """
        with self._lock:
            if self._state == STATE_IDLE:
                return False
            engine = self._engine
            config_echo = dict(self._config_echo) if self._config_echo else {}
            self._state = STATE_STOPPING

        # Stop the sniffer first so it does not count our restore frames
        self._telemetry.stop_capture()

        error = None
        if engine is not None:
            try:
                engine.stop()
            except Exception as exc:  # never leave the manager wedged
                error = exc
                logger.exception("engine.stop() failed")

        with self._lock:
            self._engine = None
            self._config_echo = None
            self._started_at = None
            self._state = STATE_IDLE

        if error is not None:
            self._telemetry.log_event(
                "error",
                "session.stop",
                f"Session stopped with cleanup errors: {error}",
            )
        else:
            target = config_echo.get("target_ip", "?")
            gateway = config_echo.get("gateway_ip", "?")
            self._telemetry.log_event(
                "info",
                "session.stop",
                f"Session stopped: target={target} gateway={gateway}",
            )
        self._publish()
        return True

    # verify

    def verify(self, method="auto", timeout=None, wait=True):
        """Run engine.verify in a worker thread and return the result dict

        Only one verification runs at a time concurrent calls get
        RuntimeError (the RPC layer turns that into ok:false)
        """
        with self._lock:
            if self._state != STATE_RUNNING or self._engine is None:
                raise RuntimeError("no session is running")
            engine = self._engine
            default_timeout = engine.config.verify_timeout

        if method not in ("auto", "passive", "active"):
            raise ValueError(f"method must be 'auto', 'passive' or 'active', got {method}")
        timeout = float(timeout) if timeout is not None else float(default_timeout)

        if not self._verify_lock.acquire(blocking=False):
            raise RuntimeError("a verification is already in progress")

        result_box = {}
        done = threading.Event()

        def worker():
            started = time.monotonic()
            try:
                result = engine.verify(method=method, timeout=timeout)
                if result is None:
                    # Engine swallowed an internal error, report as failure
                    result_box["result"] = {
                        "success": False,
                        "method": method,
                        "packets_seen": 0,
                        "detail": "verification failed (internal error)",
                        "elapsed_ms": int((time.monotonic() - started) * 1000),
                    }
                else:
                    result_box["result"] = {
                        "success": bool(result.success),
                        "method": result.method,
                        "packets_seen": int(result.packets_seen),
                        "detail": str(result.detail),
                        "elapsed_ms": int((time.monotonic() - started) * 1000),
                    }
            except Exception as exc:
                result_box["result"] = {
                    "success": False,
                    "method": method,
                    "packets_seen": 0,
                    "detail": f"verification error: {exc}",
                    "elapsed_ms": int((time.monotonic() - started) * 1000),
                }
            finally:
                self._verify_lock.release()
                done.set()
                self._after_verify(result_box["result"])

        self._verify_thread = threading.Thread(
            target=worker, name="session-verify", daemon=True
        )
        self._verify_thread.start()

        if wait:
            done.wait()
            return result_box["result"]
        return None

    def _after_verify(self, result):
        """Record last_verify, log an event, publish the session change."""
        entry = {
            "success": result["success"],
            "method": result["method"],
            "detail": result["detail"],
            "ts": time.time(),
        }
        with self._lock:
            self._last_verify = entry
        level = "success" if result["success"] else "warn"
        outcome = "success" if result["success"] else "failed"
        self._telemetry.log_event(
            level,
            "session.verify",
            f"Verify {result['method']}: {outcome} - {result['detail']}",
        )
        self._publish()