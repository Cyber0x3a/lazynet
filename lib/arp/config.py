from ..shared.constants import (
    DEFAULT_POISON_INTERVAL,
    DEFAULT_VERIFY_TIMEOUT,
    IS_WINDOWS,
    WIN_NPF_PREFIX,
)
from ..shared.network_interfaces import detect_default_interface, pick_interface


class HostInfo:
    """A simple ip and mac pair"""

    def __init__(self, ip, mac):
        self.ip = ip
        self.mac = mac

    def __repr__(self):
        return f"HostInfo(ip={self.ip}, mac={self.mac})"


class ARPConfig:
    """Configuration object for an ARP poisoning attack
    Only target_ip and gateway_ip are required Everything else is optional or auto detected.
    """

    def __init__(
        self,
        target_ip,
        gateway_ip,
        target_mac=None,
        gateway_mac=None,
        interface=None,
        direction="two-way",
        poison_interval=DEFAULT_POISON_INTERVAL,
        verify_timeout=DEFAULT_VERIFY_TIMEOUT,
        verbose=True,
        skip_self_check=False,
    ):
        if not target_ip:
            raise ValueError("target_ip is required.")
        if not gateway_ip:
            raise ValueError("gateway_ip is required.")
        if direction not in ("one-way", "two-way"):
            raise ValueError(f"direction must be 'one-way' or 'two-way', got {direction}")

        self.target_ip = target_ip
        self.gateway_ip = gateway_ip
        self.target_mac = target_mac
        self.gateway_mac = gateway_mac
        self.direction = direction
        self.poison_interval = poison_interval
        self.verify_timeout = verify_timeout
        self.verbose = verbose
        self.skip_self_check = skip_self_check

        # auto detect interface if the caller did not pick one.
        if interface is None:
            chosen = pick_interface(target_ip, gateway_ip)
        else:
            chosen = interface

        # Scapy on Windows needs the NPF prefix on every interface name
        if IS_WINDOWS and not chosen.startswith(WIN_NPF_PREFIX):
            chosen = WIN_NPF_PREFIX + chosen
        self.interface = chosen