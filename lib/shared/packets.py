""" Generic frame helpers low level """

from scapy.all import Ether, sendp, sniff


def send_frame(frame, interface, count=1, verbose=False):
    """Send one frame or repeat it x times"""
    sendp(frame, iface=interface, count=count, verbose=verbose)


def send_frames(frames, interface, verbose=False):
    """Send a list of frames in order"""
    for frame in frames:
        send_frame(frame, interface, verbose=verbose)


def sniff_packets(interface, timeout, filter_expression=None, on_packet=None, store=False):
    """Sniff packets and call *on_packet* for each one
    Returns whatever Scapy's sniff() returns when store=True
    """
    return sniff(
        iface=interface,
        timeout=timeout,
        prn=on_packet,
        store=store,
        filter=filter_expression,
    )


def rewrite_ethernet(packet, new_dst=None, new_src=None):
    """ Return packet with its Ethernet addresses replaced """
    if Ether not in packet:
        return packet
    if new_dst is not None:
        packet[Ether].dst = new_dst
    if new_src is not None:
        packet[Ether].src = new_src
    return packet


def forward_frame(packet, interface, new_dst=None, new_src=None,
                  verbose=False):
    """Rewrite a captured frame's Ethernet addresses and resend it"""
    packet = rewrite_ethernet(packet, new_dst=new_dst, new_src=new_src)
    send_frame(packet, interface, verbose=verbose)