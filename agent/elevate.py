"""Self-elevation: relaunch the agent with admin/root rights

When the agent needs privileges it does not have (IP forwarding, raw
sockets for ARP poisoning), it can relaunch itself elevated. The elevated
instance takes over the same loopback ports; the console's agent-process
manager adopts it. The current (unprivileged) instance then exits.

Only the local loopback console can trigger this, and only once per boot
(an elevated instance will not try again, so a declined UAC prompt does
not loop)
"""

import logging
import os
import subprocess
import sys

from lib.shared.constants import IS_WINDOWS

logger = logging.getLogger("lazynet.agent.elevate")

# Set on the spawned elevated child so it never tries to elevate again
_ELEVATED_ENV = "LAZYNET_ELEVATED"


def is_privileged():
    try:
        if IS_WINDOWS:
            import ctypes

            return bool(ctypes.windll.shell32.IsUserAnAdmin())
        return os.geteuid() == 0
    except Exception:
        return False


def already_elevated_child():
    """True if this process was itself spawned by the elevation relaunch"""
    return os.environ.get(_ELEVATED_ENV) == "1"


def _real_python():
    """Resolve the real interpreter, not a venv shim.

    A venv's python.exe is a launcher that spawns the real interpreter as a
    detached child; elevating the shim via ShellExecute orphans the real
    process and the elevated agent never binds its ports. Launch the base
    executable directly so the elevated process IS the agent.
    """
    base = getattr(sys, "_base_executable", None)
    if base and os.path.exists(base):
        return base
    return sys.executable


def relaunch_elevated(cmd_port, stream_port):
    """Spawn an elevated copy of the agent on the same ports.

    Returns True only when the elevation handoff was really started (the
    user did not decline the UAC prompt). The caller exits afterwards.
    """
    repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    # Set on THIS process so the elevated child inherits it (ShellExecute
    # inherits the caller's environment); the current instance exits right
    # after, so mutating our own env is safe
    os.environ[_ELEVATED_ENV] = "1"
    python = _real_python()
    args = [
        python,
        "-m",
        "agent",
        "--cmd-port",
        str(cmd_port),
        "--stream-port",
        str(stream_port),
    ]
    try:
        if IS_WINDOWS:
            return _relaunch_windows(repo_root, python, args)
        # Linux / macOS: re-exec via sudo
        subprocess.Popen(["sudo", "-E"] + args, cwd=repo_root, env=dict(os.environ))
        return True
    except Exception as error:
        logger.warning("elevation relaunch failed: %s", error)
        return False


def _relaunch_windows(repo_root, python, args):
    """ShellExecuteEx 'runas' -> real UAC prompt, reliable cancel detection"""
    import ctypes
    from ctypes import wintypes

    class SHELLEXECUTEINFO(ctypes.Structure):
        _fields_ = [
            ("cbSize", wintypes.DWORD),
            ("fMask", wintypes.ULONG),
            ("hwnd", wintypes.HWND),
            ("lpVerb", wintypes.LPCWSTR),
            ("lpFile", wintypes.LPCWSTR),
            ("lpParameters", wintypes.LPCWSTR),
            ("lpDirectory", wintypes.LPCWSTR),
            ("nShow", ctypes.c_int),
            ("hInstApp", wintypes.HINSTANCE),
            ("lpIDList", ctypes.c_void_p),
            ("lpClass", wintypes.LPCWSTR),
            ("hkeyClass", wintypes.HKEY),
            ("dwHotKey", wintypes.DWORD),
            ("hIcon", wintypes.HANDLE),
            ("hProcess", wintypes.HANDLE),
        ]

    info = SHELLEXECUTEINFO()
    info.cbSize = ctypes.sizeof(SHELLEXECUTEINFO)
    info.fMask = 0
    info.hwnd = None
    info.lpVerb = "runas"
    info.lpFile = python
    info.lpParameters = subprocess.list2cmdline(args[1:])
    info.lpDirectory = repo_root
    info.nShow = 0  # SW_HIDE the new console window

    ok = ctypes.windll.shell32.ShellExecuteExW(ctypes.byref(info))
    if not ok:
        # GetLastError 1223 = ERROR_CANCELLED (user declined the UAC prompt)
        code = ctypes.GetLastError()
        logger.warning("ShellExecuteEx runas failed (error %s)", code)
        return False
    return True
