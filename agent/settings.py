"""Agent settings: schema, persistence, deep-merge, versioning

Persisted to ~/.lazynet/settings.json (created on first write)
A missing or unreadable file falls back to defaults Thread-safe
"""

import copy
import json
import logging
import os
import threading

logger = logging.getLogger("lazynet.agent.settings")

SETTINGS_DIR = os.path.join(os.path.expanduser("~"), ".lazynet")
SETTINGS_PATH = os.path.join(SETTINGS_DIR, "settings.json")


DEFAULT_SETTINGS = {
    "attack": {
        "direction": "two-way",
        "poison_interval": 1.5,
        "verify_timeout": 5.0,
        "auto_verify_s": 0,
    },
    "safety": {
        "skip_self_check": False,
        "auto_forwarding": True,
        "restore_on_stop": True,
    },
    "interface": {
        "preferred": "",
    },
    "telemetry": {
        "retention_s": 3600,
        "packet_log_max": 500,
        "event_log_max": 300,
    },
    "ui": {
        "density": "comfortable",
        "refresh_ms": 1000,
        "reduce_motion": False,
        "time_format": "24h",
    },
}


def deep_merge(base, patch):
    """Recursively merge patch into base, returning a new dict

    Dict values are merged key by key; anything else replaces the base value
    Neither argument is mutated
    """
    result = copy.deepcopy(base)
    for key, value in patch.items():
        if (
            key in result
            and isinstance(result[key], dict)
            and isinstance(value, dict)
        ):
            result[key] = deep_merge(result[key], value)
        else:
            result[key] = copy.deepcopy(value)
    return result


class SettingsStore:
    """Thread-safe settings container with persistence and a version counter"""

    def __init__(self, path=SETTINGS_PATH):
        self._path = path
        self._lock = threading.RLock()
        self._settings = copy.deepcopy(DEFAULT_SETTINGS)
        self._version = 0
        self.load()

    # persistence

    def load(self):
        """Load settings from disk, missing/unreadable file means defaults """
        with self._lock:
            if not os.path.exists(self._path):
                logger.debug(f"No settings file at {self._path}, using defaults")
                return
            try:
                with open(self._path, "r", encoding="utf-8") as handle:
                    stored = json.load(handle)
                if isinstance(stored, dict):
                    self._settings = deep_merge(DEFAULT_SETTINGS, stored)
                    logger.info(f"Loaded settings from {self._path}")
            except (OSError, ValueError) as error:
                logger.warning(f"Could not read settings from {self._path} ({error}), using defaults")

    def save(self):
        """Persist current settings to disk, Returns True on success"""
        with self._lock:
            try:
                os.makedirs(os.path.dirname(self._path), exist_ok=True)
                tmp_path = self._path + ".tmp"
                with open(tmp_path, "w", encoding="utf-8") as handle:
                    json.dump(self._settings, handle, indent=2, sort_keys=True)
                    handle.write("\n")
                os.replace(tmp_path, self._path)
                return True
            except OSError as error:
                logger.error(f"Could not save settings to {self._path}: {error}")
                return False

    # access

    def get(self):
        """Return a deep copy of the current settings"""
        with self._lock:
            return copy.deepcopy(self._settings)

    @property
    def version(self):
        with self._lock:
            return self._version

    def get_with_version(self):
        """Return (settings copy, version) atomically"""
        with self._lock:
            return copy.deepcopy(self._settings), self._version

    def apply_patch(self, patch):
        """Deep-merge patch into settings, bump the version and persist

        Returns (settings copy, new version)
        Raises TypeError if patch is not a dict
        """
        if not isinstance(patch, dict):
            raise TypeError("settings patch must be a JSON object")
        with self._lock:
            self._settings = deep_merge(self._settings, patch)
            self._version += 1
            snapshot = copy.deepcopy(self._settings)
            version = self._version
        self.save()
        return snapshot, version

    def section(self, name):
        """Return a copy of one top level section ({} if unknown)"""
        with self._lock:
            value = self._settings.get(name, {})
            return copy.deepcopy(value) if isinstance(value, dict) else value
