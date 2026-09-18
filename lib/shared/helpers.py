import ctypes
import os
import sys
from .constants import IS_WINDOWS

def check_root():
    if IS_WINDOWS:
        if ctypes.windll.shell32.IsUserAnAdmin():
            return
        params = " ".join(f'"{arg}"' for arg in sys.argv)
        result = ctypes.windll.shell32.ShellExecuteW(None, "runas", sys.executable, params, None, 1,)
        if result <= 32:
            raise SystemExit("UAC prompt declined.")
        sys.exit(0)

    # Linux
    if os.geteuid() == 0:
        return
    if not sys.stdin.isatty():
        raise SystemExit("Not root and no terminal for sudo prompt")
    os.execvp("sudo", ["sudo", sys.executable] + sys.argv)