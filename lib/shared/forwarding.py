"""Enable, disable and query IP forwarding on Linux and Windows
Windows uses two independent mechanisms so forwarding works even if one is blocked by group policy: Registry, netsh
"""

import subprocess

from .constants import IS_LINUX, IS_WINDOWS, WIN_REG_PATH, WIN_REG_VALUE


def clear_arp_entry(ip):
    """
    Delete any ARP entry for ip
    """
    if IS_WINDOWS:
        subprocess.run(["arp", "-d", ip], check=False, capture_output=True)


def pin_gateway_arp(gateway_ip, gateway_mac):
    """Create a static ARP entry for the gateway
    On Windows Ethernet the NDIS stack processes our own outgoing forged
    ARP replies as incoming and overwrites our cache for the gateway
    A static entry is immune to that, so forwarding keeps working
    """
    if IS_WINDOWS:
        subprocess.run(["arp", "-s", gateway_ip, gateway_mac.replace(":", "-")], check=False, capture_output=True)


def enable_ip_forwarding():
    """Enable IP forwarding on the current platform"""
    if IS_LINUX:
        _enable_linux()
    elif IS_WINDOWS:
        _enable_windows()
    else:
        raise NotImplementedError("IP forwarding is not supported on this OS.")


def disable_ip_forwarding():
    """Disable IP forwarding and revert any changes we made"""
    if IS_LINUX:
        _disable_linux()
    elif IS_WINDOWS:
        _disable_windows()
    else:
        raise NotImplementedError("IP forwarding is not supported on this OS.")


def is_ip_forwarding_enabled():
    """Return True if IP forwarding is currently enabled"""
    if IS_LINUX:
        return _linux_forwarding_enabled()
    if IS_WINDOWS:
        return _windows_forwarding_enabled()
    return False


def get_forwarding_state():
    """Return a small dictionary describing the current state"""
    if IS_LINUX:
        strategy = "LinuxForwarder"
    elif IS_WINDOWS:
        strategy = "WindowsForwarder"
    else:
        strategy = "UnknownForwarder"

    return {"strategy": strategy, "enabled": is_ip_forwarding_enabled(),}





# ------------------------- Linux -------------------------

def _enable_linux():
    subprocess.run(["sysctl", "-w", "net.ipv4.ip_forward=1"], check=False, capture_output=True)

def _disable_linux():
    subprocess.run(["sysctl", "-w", "net.ipv4.ip_forward=0"], check=False, capture_output=True,)


def _linux_forwarding_enabled():
    try:
        result = subprocess.run(
            ["sysctl", "-n", "net.ipv4.ip_forward"],
            check=False, capture_output=True, text=True,
        )
    except Exception:
        return False
    return result.stdout.strip() == "1"





# ------------------------- Windows -------------------------

def _enable_windows():
    subprocess.run(
        ["reg", "add", WIN_REG_PATH,
         "/v", WIN_REG_VALUE,
         "/t", "REG_DWORD",
         "/d", "1", "/f"],
        check=False, capture_output=True,
    )
    subprocess.run(
        ["netsh", "interface", "ipv4", "set", "global",
         "forwarding=enabled"],
        check=False, capture_output=True,
    )


def _disable_windows():
    # Delete rather than zero so no leftover policy remains
    subprocess.run(
        ["reg", "delete", WIN_REG_PATH,
         "/v", WIN_REG_VALUE, "/f"],
        check=False, capture_output=True,
    )
    subprocess.run(
        ["netsh", "interface", "ipv4", "set", "global",
         "forwarding=disabled"],
        check=False, capture_output=True,
    )


def _windows_forwarding_enabled():
    try:
        result = subprocess.run(
            ["netsh", "interface", "ipv4", "show", "global"],
            check=False, capture_output=True, text=True,
        )
    except Exception:
        return False

    for line in result.stdout.splitlines():
        if "forwarding" in line.lower():
            return "enabled" in line.lower()
    return False