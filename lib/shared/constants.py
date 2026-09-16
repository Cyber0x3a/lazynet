"""Platform flags and shared defaults for LazyNet"""

import platform


IS_WINDOWS = platform.system().lower() == "windows"
IS_LINUX = platform.system().lower() == "linux"

# Scapy needs this prefix on Windows interface names
WIN_NPF_PREFIX = r"\Device\NPF_"

# Windows registry entry used to control IP forwarding
WIN_REG_PATH = r"HKLM\SYSTEM\CurrentControlSet\Services\Tcpip\Parameters"
WIN_REG_VALUE = "IPEnableRouter"

# Timing defaults.
DEFAULT_POISON_INTERVAL = 1.5    # seconds between ARP bursts
JITTER_FRACTION = 0.2            # 20% random jitter
DEFAULT_VERIFY_TIMEOUT = 5.0     # seconds