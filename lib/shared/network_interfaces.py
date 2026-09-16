""" Network interface discovery and local address lookups """

import ipaddress
import socket

import psutil
from scapy.all import conf

from .constants import IS_WINDOWS, WIN_NPF_PREFIX


_VIRTUAL_HINTS = (
    "virtual", "hyper-v", "vmware", "virtualbox",
    "loopback", "bluetooth", "wan miniport", "tap-",
    "npcap loopback",
)


class InterfaceInfo:
    """Describes a single network interface"""

    def __init__(self, name, display_name="", ipv4="", netmask="", mac="", is_default=False, is_usable=True):
        self.name = name
        self.display_name = display_name or name
        self.ipv4 = ipv4
        self.netmask = netmask
        self.mac = mac
        self.is_default = is_default
        self.is_usable = is_usable

    def contains(self, ip):
        """True if ip is inside this interface's subnet"""
        if not self.ipv4 or not self.netmask:
            return False
        try:
            network = ipaddress.ip_network(self.ipv4 + "/" + self.netmask, strict=False)
            return ipaddress.ip_address(ip) in network
        except ValueError:
            return False

    def __repr__(self):
        return (
            f"InterfaceInfo(name={self.name}, display_name={self.display_name},"
            f"ipv4={self.ipv4}, netmask={self.netmask}, mac={self.mac},"
            f"is_default={self.is_default!r}, is_usable={self.is_usable!r})"
        )


def detect_default_interface():
    """ Return Scapy's default iface name """
    return str(conf.iface)


def list_interfaces():
    """Return a list of InterfaceInfo, best candidates first """
    default_name = detect_default_interface()
    npf_names = _windows_friendly_to_npf() if IS_WINDOWS else {}

    interfaces = []
    for friendly_name, addrs in psutil.net_if_addrs().items():
        ipv4, netmask, mac = _read_addresses(addrs)

        if IS_WINDOWS:
            name = npf_names.get(friendly_name.lower(), WIN_NPF_PREFIX + friendly_name)
        else:
            name = friendly_name

        interfaces.append(InterfaceInfo(
            name=name,
            display_name=friendly_name,
            ipv4=ipv4,
            netmask=netmask,
            mac=mac,
            is_default=(name == default_name),
            is_usable=_is_usable(mac, ipv4),
        ))

    interfaces.sort(key=_sort_key)
    return interfaces


def pick_interface(target_ip, gateway_ip):
    """Return the Scapy name of the best interface for this target/gateway

    Preference order:
        1. Interface whose subnet contains target_ip
        2. Interface whose subnet contains gateway_ip
        3. Scapy default interface, if usable
        4. First usable interface
        5. Scapy default, whatever it is
    """
    usable = [iface for iface in list_interfaces() if iface.is_usable]

    for iface in usable:
        if iface.contains(target_ip):
            return iface.name

    for iface in usable:
        if iface.contains(gateway_ip):
            return iface.name

    for iface in usable:
        if iface.is_default:
            return iface.name

    if usable:
        return usable[0].name

    return detect_default_interface()


def get_local_ips():
    """Return a set of every IPv4 address on this machine"""
    result = set()
    for addrs in psutil.net_if_addrs().values():
        for addr in addrs:
            if addr.family == socket.AF_INET:
                result.add(addr.address)
    return result


def get_local_macs():
    """ Return a set of every MAC address on this machine """
    result = set()
    for addrs in psutil.net_if_addrs().values():
        for addr in addrs:
            if addr.family == psutil.AF_LINK:
                result.add(addr.address.lower())
    return result


def get_interface_ipv4(interface_name):
    """ Return the IPv4 address bound to interface_name """
    for iface in list_interfaces():
        if iface.name == interface_name and iface.ipv4:
            return iface.ipv4

    for iface in list_interfaces():
        if iface.ipv4 and not iface.ipv4.startswith("127."):
            return iface.ipv4

    return ""


# -------------------- helpers --------------------

def _read_addresses(addrs):
    """ Return (ipv4, netmask, mac) from a psutil address list """
    ipv4 = ""
    netmask = ""
    mac = ""
    for addr in addrs:
        if addr.family == socket.AF_INET and not ipv4:
            ipv4 = addr.address
            netmask = addr.netmask or ""
        elif addr.family == psutil.AF_LINK and not mac:
            mac = addr.address.lower()
    return ipv4, netmask, mac


def _windows_friendly_to_npf():
    """Map friendly adapter names ('Wi-Fi') to Scapy NPF names """
    mapping = {}
    try:
        from scapy.arch.windows import get_windows_if_list
        for entry in get_windows_if_list():
            friendly = entry.get("name", "") or ""
            guid = entry.get("guid", "") or ""
            if not friendly or not guid:
                continue
            if not guid.startswith("{"):
                guid = "{" + guid + "}"
            mapping[friendly.lower()] = WIN_NPF_PREFIX + guid
    except Exception:
        pass
    return mapping


def _is_usable(mac, ipv4):
    if not mac or mac == "00:00:00:00:00:00":
        return False
    if not ipv4:
        return False
    if ipv4.startswith("127."):
        return False
    if ipv4.startswith("169.254."):
        return False
    return True


def _sort_key(iface):
    virtual = any(hint in iface.display_name.lower() for hint in _VIRTUAL_HINTS)
    return (
        0 if iface.is_usable else 1,
        1 if virtual else 0,
        0 if iface.is_default else 1,
        iface.display_name.lower(),
    )