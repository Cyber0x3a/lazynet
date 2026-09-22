"""Self-elevation: relaunch the agent with admin/root rights"""

import logging
import os
import subprocess
import sys

from lib.shared.constants import IS_WINDOWS

logger = logging.getLogger("lazynet.agent.elevate")

# set on the elevated child so it never tries to elevate again
ELEVATED_ENV = "LAZYNET_ELEVATED"


def is_privileged():
    try:
        if IS_WINDOWS:
            import ctypes

            return bool(ctypes.windll.shell32.IsUserAnAdmin())
        return os.geteuid() == 0
    except Exception:
        return False


def already_elevated_child():
    return os.environ.get(ELEVATED_ENV) == "1"


def real_python():
    # a venv python.exe is just a launcher: elevating it via ShellExecute
    # orphans the real interpreter, so launch the base executable directly
    base = getattr(sys, "_base_executable", None)
    return base if base and os.path.exists(base) else sys.executable


def relaunch_elevated(cmd_port, stream_port):
    """Spawn an elevated agent on the same ports. True if the handoff started"""
    repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    # set on this process so the child inherits it; this instance exits after
    os.environ[ELEVATED_ENV] = "1"
    python = real_python()
    args = [python, "-m", "agent",
            "--cmd-port", str(cmd_port), "--stream-port", str(stream_port)]
    try:
        if IS_WINDOWS:
            import ctypes

            params = subprocess.list2cmdline(args[1:])
            # runas pops the UAC prompt; return code <= 32 means declined/failed
            rc = ctypes.windll.shell32.ShellExecuteW(None, "runas", python, params, repo_root, 0)
            return rc > 32
        subprocess.Popen(["sudo", "-E"] + args, cwd=repo_root, env=dict(os.environ))
        return True
    except Exception as error:
        logger.warning(f"elevation relaunch failed: {error}")
        return False
