"""Self-elevation: relaunch the agent with admin/root rights.

When the agent needs privileges it does not have (IP forwarding, raw
sockets for ARP poisoning), it can relaunch itself elevated. The elevated
instance takes over the same loopback ports; the console's agent-process
manager adopts it. The current (unprivileged) instance then exits.

Only the local loopback console can trigger this, and only once per boot
(an elevated instance will not try again, so a declined UAC prompt does
not loop).
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


def relaunch_elevated(cmd_port, stream_port):
    """Spawn an elevated copy of the agent on the same ports.

    Returns True if the spawn was kicked off, False if the platform does
    not support it. The caller is responsible for exiting afterwards.
    """
    repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    env = dict(os.environ)
    env[_ELEVATED_ENV] = "1"
    args = [
        sys.executable,
        "-m",
        "agent",
        "--cmd-port",
        str(cmd_port),
        "--stream-port",
        str(stream_port),
    ]
    try:
        if IS_WINDOWS:
            # ShellExecute "runas" triggers the UAC prompt
            import ctypes

            params = subprocess.list2cmdline(args[1:])
            rc = ctypes.windll.shell32.ShellExecuteW(
                None, "runas", sys.executable, params, repo_root, 0
            )
            # ShellExecuteW returns >32 on success
            if rc <= 32:
                logger.warning("ShellExecute runas failed (rc=%s)", rc)
                return False
            return True
        # Linux / macOS: re-exec via sudo
        subprocess.Popen(["sudo", "-E"] + args, cwd=repo_root, env=env)
        return True
    except Exception as error:
        logger.warning("elevation relaunch failed: %s", error)
        return False
