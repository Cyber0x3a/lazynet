"""IP forwarding lifecycle for the agent

Centralizes enable/disable/query behind a small manager that remembers
whether *the agent* enabled forwarding, reconciles the effective state
against settings.safety.auto_forwarding after session stops and config
changes, and notifies subscribers (stream broadcast) plus the event log
on every change. OS calls may fail without admin/root; failures are
logged as warn events and never raised to the caller
"""

import ctypes
import logging
import os
import threading

from lib.shared.forwarding import (
    disable_ip_forwarding,
    enable_ip_forwarding,
    get_forwarding_state,
)
from lib.shared.constants import IS_WINDOWS

logger = logging.getLogger("lazynet.agent.forwarding")


def _is_privileged():
    try:
        if IS_WINDOWS:
            return bool(ctypes.windll.shell32.IsUserAnAdmin())
        return os.geteuid() == 0
    except Exception:
        return False


def _safe_state():
    """Query the OS forwarding state, tolerating subprocess failures"""
    try:
        return get_forwarding_state()
    except Exception as error:
        logger.debug("get_forwarding_state failed: %s", error)
        return {"strategy": "unknown", "enabled": False}


class ForwardingManager:
    """Owns the agent's IP forwarding policy and change notifications"""

    def __init__(self, settings, telemetry):
        self._settings = settings
        self._telemetry = telemetry
        self._lock = threading.RLock()
        self._enabled_by_agent = False
        self._broadcaster = None

    # --------------------------- wiring ---------------------------

    def set_broadcaster(self, callback):
        """Register fn(state_dict) called on every effective state change"""
        with self._lock:
            self._broadcaster = callback

    # --------------------------- queries ---------------------------

    @property
    def enabled_by_agent(self):
        with self._lock:
            return self._enabled_by_agent

    def _auto_forwarding(self):
        return bool(self._settings.section("safety").get("auto_forwarding", True))

    # ------------------------- notifications -------------------------

    def _notify_change(self, reason, state):
        """Broadcast + log after the effective forwarding state changed"""
        with self._lock:
            broadcaster = self._broadcaster
        if broadcaster is not None:
            try:
                broadcaster(dict(state))
            except Exception:
                logger.exception("forwarding broadcaster failed")
        self._telemetry.log_event(
            "info",
            "forwarding",
            f"IP forwarding {'enabled' if state.get('enabled') else 'disabled'} "
            f"({reason}; strategy={state.get('strategy')})",
        )

    def _notify_failure(self, action, error):
        self._telemetry.log_event(
            "warn",
            "forwarding",
            f"Could not {action} IP forwarding (admin/root required?): {error}",
        )

    # ------------------------- state transitions -------------------------

    def _apply(self, enabled, reason):
        """Try to force the OS state; notify on success, warn on failure.

        Returns (state dict, changed: bool)
        """
        try:
            if enabled:
                enable_ip_forwarding()
            else:
                disable_ip_forwarding()
        except Exception as error:
            logger.warning("%s IP forwarding failed (%s): %s", reason, enabled, error)
            self._notify_failure("enable" if enabled else "disable", error)
            return _safe_state(), False
        with self._lock:
            self._enabled_by_agent = enabled
        state = _safe_state()
        if bool(state.get("enabled")) != bool(enabled):
            # The OS call returned success but the state did not change:
            # almost always missing admin/root rights.
            self._notify_failure(
                "enable" if enabled else "disable",
                "state unchanged after apply (insufficient privileges?)",
            )
            return state, False
        self._notify_change(reason, state)
        return state, True

    def set(self, enabled):
        """Handle the forwarding.set command. Returns the state dict.

        When enabling fails for lack of privileges, request elevation (the
        agent relaunches itself as admin/root) instead of just logging a
        warning. The caller surfaces 'needs_elevation' so the UI can react.
        """
        state, changed = self._apply(bool(enabled), "forwarding.set command")
        if enabled and not state.get("enabled") and not _is_privileged():
            state = dict(state)
            state["needs_elevation"] = True
        return state

    def on_startup(self):
        """Called once after servers start: honor auto_forwarding.

        If privileges are missing, the agent logs intent and relies on the
        console to issue agent.elevate (which relaunches elevated). Only an
        already-elevated child that still lacks rights (user declined) logs a
        plain warning, so the agent does not nag every boot.
        """
        if not self._auto_forwarding():
            return
        if _is_privileged():
            self._apply(True, "startup auto_forwarding")
            return

        from . import elevate

        if elevate.already_elevated_child():
            # Relaunched once already and still no rights: user declined
            self._telemetry.log_event(
                "warn",
                "forwarding",
                "IP forwarding is off: elevation was declined, so the agent "
                "is running without admin/root rights.",
            )
            return
        self._telemetry.log_event(
            "info",
            "forwarding",
            "Requesting administrator/root rights to enable IP forwarding...",
        )
        logger.info("auto_forwarding needs elevation; console will call agent.elevate")

    def reconcile(self, reason):
        """Re-apply auto_forwarding after session.stop()/config changes.

        If auto_forwarding is on and the effective state is disabled (the
        engine's own stop() disables it), re-enable. If auto_forwarding is
        off, the current state is left untouched.
        """
        if not self._auto_forwarding():
            return
        if _safe_state().get("enabled"):
            return
        self._apply(True, reason)

    def shutdown(self):
        """On agent shutdown, only undo what the agent itself enabled"""
        with self._lock:
            enabled_by_agent = self._enabled_by_agent
        if not enabled_by_agent:
            logger.debug("forwarding was not enabled by the agent; leaving it alone")
            return
        self._apply(False, "agent shutdown")
