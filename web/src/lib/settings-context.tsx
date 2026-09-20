"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { Settings } from "./types";

const DEFAULT_SETTINGS: Settings = {
  attack: {
    direction: "two-way",
    poison_interval: 1.5,
    verify_timeout: 5.0,
    auto_verify_s: 0,
  },
  safety: {
    skip_self_check: false,
    auto_forwarding: true,
    restore_on_stop: true,
  },
  interface: { preferred: "" },
  telemetry: { retention_s: 3600, packet_log_max: 500, event_log_max: 300 },
  ui: {
    density: "comfortable",
    refresh_ms: 1000,
    reduce_motion: false,
    time_format: "24h",
  },
};

interface SettingsContextValue {
  settings: Settings;
  loaded: boolean;
  apply: (patch: unknown) => Promise<void>;
  setLocal: (s: Settings) => void;
}

const SettingsContext = createContext<SettingsContextValue>({
  settings: DEFAULT_SETTINGS,
  loaded: false,
  apply: async () => {},
  setLocal: () => {},
});

async function rpcCall(cmd: string, params: Record<string, unknown> = {}) {
  const res = await fetch("/api/rpc", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cmd, params }),
  });
  if (!res.ok) throw new Error(`rpc ${cmd}: http ${res.status}`);
  const json = await res.json();
  if (!json.ok) throw new Error(json.error ?? "rpc failed");
  return json.data;
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    rpcCall("config.get")
      .then((data) => {
        if (!cancelled && data?.settings) {
          setSettings(data.settings as Settings);
        }
      })
      .catch(() => {
        /* agent offline: keep defaults */
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    document.documentElement.dataset.density = settings.ui.density;
  }, [settings.ui.density]);

  const apply = useCallback(async (patch: unknown) => {
    const data = await rpcCall("config.set", { patch });
    if (data?.settings) setSettings(data.settings as Settings);
  }, []);

  const setLocal = useCallback((s: Settings) => setSettings(s), []);

  return (
    <SettingsContext.Provider value={{ settings, loaded, apply, setLocal }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  return useContext(SettingsContext);
}
