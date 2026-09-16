""" IP to MAC resolution via the operating system ARP cache """

import ctypes
import socket
import struct
import time

from scapy.all import ARP, Ether, srp
from lib.shared.constants import IS_WINDOWS


def resolve_mac(ip, interface=None, timeout=5, retry_interval=1):
    """
    Return the MAC address of ip or None if it cannot be resolved
    """
    deadline = time.time() + timeout

    while True:
        mac = _read_os_cache(ip)
        if mac:
            return mac

        mac = _send_arp_request(ip, interface)
        if mac:
            return mac

        if time.time() >= deadline:
            return None

        time.sleep(retry_interval)


def _read_os_cache(ip):
    """Query the OS ARP cache for ip """
    if IS_WINDOWS:
        return _read_windows_cache(ip)
    return _read_linux_cache(ip)


def _read_windows_cache(ip):
    """Return the MAC from the Windows ARP cache, or None

    SendARP reads the kernel cache first and sends an ARP request itself
    if the entry is missing, so a single call covers both cases
    """
    try:
        dest_ip = struct.unpack("<I", socket.inet_aton(ip))[0]
    except OSError:
        return None

    buffer = ctypes.create_string_buffer(8)
    length = ctypes.c_ulong(8)

    result = ctypes.windll.iphlpapi.SendARP(ctypes.c_ulong(dest_ip), ctypes.c_ulong(0), buffer, ctypes.byref(length))
    if result != 0:
        return None

    return ":".join("%02x" % byte for byte in buffer.raw[:6])


def _read_linux_cache(ip):
    """
    Return the MAC from /proc/net/arp or None
    """
    try:
        with open("/proc/net/arp", "r") as handle:
            lines = handle.readlines()
    except OSError:
        return None

    for line in lines[1:]:
        parts = line.split()
        if len(parts) >= 4 and parts[0] == ip and parts[3] != "00:00:00:00:00:00":
            return parts[3]

    return None


def _send_arp_request(ip, interface):
    """
    Broadcast an ARP request for ip and return the MAC or None
    """
    request = Ether(dst="ff:ff:ff:ff:ff:ff") / ARP(pdst=ip)

    try:
        answered, _ = srp(request, timeout=1, verbose=False, iface=interface)
    except Exception:
        return None

    if not answered:
        return None

    _, reply = answered[0]
    return reply.hwsrc