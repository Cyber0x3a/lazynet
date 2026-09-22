"""IP forwarding lifecycle: own the OS state, broadcast changes, log events

OS calls may fail without admin/root; failures become warn events, never raised
"""

import logging

from lib.shared.forwarding import (
    disable_ip_forwarding,
    enable_ip_forwarding,
    get_forwarding_state,
)

from . import elevate

logger = logging.getLogger("lazynet.agent.forwarding")


class ForwardingManager:
    def __init__(self, settings, telemetry):
        self.settings = settings
        self.telemetry = telemetry
        self.broadcaster = None
        self.enabled_by_agent = False

    def set_broadcaster(self, callback):
        self.broadcaster = callback

    def state(self):
        try:
            return get_forwarding_state()
        except Exception:
            return {"strategy": "unknown", "enabled": False}

    def auto_forwarding(self):
        return bool(self.settings.section("safety").get("auto_forwarding", True))

    def apply(self, enabled, reason):
        """Force the OS state, broadcast + log the result. Returns the state dict"""
        try:
            enable_ip_forwarding() if enabled else disable_ip_forwarding()
        except Exception as error:
            action = "enable" if enabled else "disable"
            self.telemetry.log_event("warn", "forwarding", f"Could not {action} IP forwarding: {error}")
            return self.state()

        self.enabled_by_agent = enabled
        state = self.state()

        if state["enabled"] != enabled:
            # the OS call returned ok but nothing changed: missing admin/root
            state = dict(state)
            state["needs_elevation"] = not elevate.is_privileged()
            self.telemetry.log_event("warn", "forwarding", "IP forwarding unchanged (admin/root required?)")
            return state

        if self.broadcaster is not None:
            try:
                self.broadcaster(dict(state))
            except Exception:
                logger.exception("forwarding broadcaster failed")
        label = "enabled" if enabled else "disabled"
        self.telemetry.log_event("info", "forwarding", f"IP forwarding {label} ({reason})")
        return state

    def set(self, enabled):
        return self.apply(bool(enabled), "forwarding.set command")

    def on_startup(self):
        if not self.auto_forwarding():
            return
        if elevate.is_privileged():
            self.apply(True, "startup auto_forwarding")
        elif elevate.already_elevated_child():
            # elevated once already and still no rights: user declined
            self.telemetry.log_event("warn", "forwarding", "IP forwarding is off: elevation was declined")
        else:
            self.telemetry.log_event("info", "forwarding", "Requesting admin/root rights to enable IP forwarding...")

    def reconcile(self, reason):
        # re-apply the auto_forwarding policy after a session stop / config change
        if self.auto_forwarding() and not self.state()["enabled"]:
            self.apply(True, reason)

    def shutdown(self):
        # only undo what the agent itself turned on
        if self.enabled_by_agent:
            self.apply(False, "agent shutdown")
