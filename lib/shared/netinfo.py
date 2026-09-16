"""Local address lookups for the host machine """

import socket
import psutil
from .constants import IS_WINDOWS, WIN_NPF_PREFIX


def get_local_ips():
    """Return a set of every IPv4 address on this machine"""
    result = set()
    all_addresses = psutil.net_if_addrs()
    for iface_name in all_addresses:
        for address in all_addresses[iface_name]:
            if address.family == socket.AF_INET:
                result.add(address.address)
    return result


def get_local_macs():
    """Return a set of every MAC address on this machine (lower-case)"""
    result = set()
    all_addresses = psutil.net_if_addrs()
    for iface_name in all_addresses:
        for address in all_addresses[iface_name]:
            if address.family == psutil.AF_LINK:
                result.add(address.address.lower())
    return result


def get_interface_ipv4(interface_name):
    """Return the IPv4 address bound to interface_name or '' if none found """
    all_addresses = psutil.net_if_addrs()

    for iface_name in all_addresses:
        candidate = iface_name
        if IS_WINDOWS:
            candidate = WIN_NPF_PREFIX + iface_name

        if candidate != interface_name and iface_name != interface_name:
            continue

        for address in all_addresses[iface_name]:
            if address.family == socket.AF_INET:
                return address.address

    # Fallback: first non-loopback IPv4 on the machine.
    for iface_name in all_addresses:
        for address in all_addresses[iface_name]:
            if address.family != socket.AF_INET:
                continue
            if address.address.startswith("127."):
                continue
            return address.address

    return ""