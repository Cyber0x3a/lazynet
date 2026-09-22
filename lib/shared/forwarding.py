"""Enable, disable and query IP forwarding on Linux and Windows"""

import subprocess

from .constants import IS_LINUX, IS_WINDOWS, WIN_REG_PATH, WIN_REG_VALUE


def clear_arp_entry(ip):
    if IS_WINDOWS:
        subprocess.run(["arp", "-d", ip], check=False, capture_output=True)


def pin_gateway_arp(gateway_ip, gateway_mac):
    """Static ARP entry for the gateway so our own forged replies can't poison us"""
    if IS_WINDOWS:
        subprocess.run(["arp", "-s", gateway_ip, gateway_mac.replace(":", "-")], check=False, capture_output=True)


def enable_ip_forwarding():
    if IS_LINUX:
        linux_write("1")
    elif IS_WINDOWS:
        windows_enable()
    else:
        raise NotImplementedError("IP forwarding is not supported on this OS")


def disable_ip_forwarding():
    if IS_LINUX:
        linux_write("0")
    elif IS_WINDOWS:
        windows_disable()
    else:
        raise NotImplementedError("IP forwarding is not supported on this OS")


def is_ip_forwarding_enabled():
    if IS_LINUX:
        return linux_read() == "1"
    if IS_WINDOWS:
        return windows_enabled()
    return False


def get_forwarding_state():
    if IS_LINUX:
        strategy = "LinuxForwarder"
    elif IS_WINDOWS:
        strategy = "WindowsForwarder"
    else:
        strategy = "UnknownForwarder"
    return {"strategy": strategy, "enabled": is_ip_forwarding_enabled()}


# linux

def linux_write(value):
    subprocess.run(["sysctl", "-w", f"net.ipv4.ip_forward={value}"], check=False, capture_output=True)


def linux_read():
    try:
        r = subprocess.run(["sysctl", "-n", "net.ipv4.ip_forward"],
                           check=False, capture_output=True, text=True)
        return r.stdout.strip()
    except Exception:
        return "0"


# windows

# never toggle forwarding on virtual/host-only adapters (ICS hotspot, WSL,
# vpn, loopback): enabling it there breaks ICS NAT and kills client internet
_SKIP_IFACE = "loopback|vethernet|wsl|hyper-v|local area connection|bluetooth|tap-|vpn|wan miniport"


def ps(script):
    subprocess.run(["powershell", "-NoProfile", "-Command", script], check=False, capture_output=True)


def windows_enable():
    # registry persists across reboots, Set-NetIPInterface applies it now
    subprocess.run(["reg", "add", WIN_REG_PATH, "/v", WIN_REG_VALUE, "/t", "REG_DWORD", "/d", "1", "/f"],
                   check=False, capture_output=True)
    ps("Get-NetIPInterface -AddressFamily IPv4 | "
       f"Where-Object {{$_.ConnectionState -eq 'Connected' -and $_.InterfaceAlias -notmatch '{_SKIP_IFACE}'}} | "
       "Set-NetIPInterface -Forwarding Enabled")


def windows_disable():
    subprocess.run(["reg", "delete", WIN_REG_PATH, "/v", WIN_REG_VALUE, "/f"], check=False, capture_output=True)
    # revert every interface that has it on, so nothing we set is left behind
    ps("Get-NetIPInterface -AddressFamily IPv4 | Where-Object {$_.Forwarding -eq 'Enabled'} | "
       "Set-NetIPInterface -Forwarding Disabled")


def windows_enabled():
    # the registry value is the source of truth (netsh has no forwarding line anymore)
    try:
        r = subprocess.run(["reg", "query", WIN_REG_PATH, "/v", WIN_REG_VALUE],
                           check=False, capture_output=True, text=True)
        return r.returncode == 0 and "0x1" in r.stdout.lower()
    except Exception:
        return False
