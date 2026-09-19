"use client";

import { useEffect, useState } from "react";
import { useSettings } from "@/lib/settings-context";
import { agentRpc } from "@/lib/agent-client";
import {
  Button,
  NumberField,
  Panel,
  Select,
  Toggle,
} from "@/components/ui";
import type { InterfaceInfo, Settings } from "@/lib/types";

function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "baseline",
        gap: 12,
        marginBottom: 4,
      }}
    >
      <span style={{ fontSize: 15, fontWeight: 600 }}>{children}</span>
    </div>
  );
}

function SectionNote({ children }: { children: React.ReactNode }) {
  return (
    <p
      style={{
        margin: "0 0 8px",
        fontSize: "var(--fs-label)",
        color: "var(--ink-3)",
        maxWidth: 560,
      }}
    >
      {children}
    </p>
  );
}

export default function SettingsPage() {
  const { settings, loaded, apply } = useSettings();
  const [draft, setDraft] = useState<Settings | null>(null);
  const [interfaces, setInterfaces] = useState<InterfaceInfo[]>([]);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (loaded && draft === null) setDraft(settings);
  }, [loaded, settings, draft]);

  useEffect(() => {
    agentRpc<{ interfaces: InterfaceInfo[] }>("interfaces.list").then((res) => {
      if (res.ok && res.data) setInterfaces(res.data.interfaces.filter((i) => i.is_usable));
    });
  }, []);

  if (!draft) {
    return (
      <div
        className="micro"
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          letterSpacing: "0.18em",
        }}
      >
        LOADING SETTINGS
      </div>
    );
  }

  const dirty = !deepEqual(draft, settings);

  const patchDraft = (path: string[], value: unknown) => {
    setDraft((prev) => {
      if (!prev) return prev;
      const next = JSON.parse(JSON.stringify(prev)) as Record<string, unknown>;
      let cursor: Record<string, unknown> = next;
      for (let i = 0; i < path.length - 1; i++) {
        cursor = cursor[path[i]] as Record<string, unknown>;
      }
      cursor[path[path.length - 1]] = value;
      return next as unknown as Settings;
    });
    setSavedAt(null);
  };

  const buildPatch = (base: Settings, next: Settings): Record<string, unknown> => {
    const patch: Record<string, unknown> = {};
    for (const section of Object.keys(next) as (keyof Settings)[]) {
      const baseSection = base[section] as Record<string, unknown>;
      const nextSection = next[section] as Record<string, unknown>;
      const sectionPatch: Record<string, unknown> = {};
      for (const key of Object.keys(nextSection)) {
        if (!deepEqual(baseSection[key], nextSection[key])) {
          sectionPatch[key] = nextSection[key];
        }
      }
      if (Object.keys(sectionPatch).length > 0) patch[section] = sectionPatch;
    }
    return patch;
  };

  const save = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      await apply(buildPatch(settings, draft));
      setSavedAt(Date.now() / 1000);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "save failed");
    } finally {
      setSaving(false);
    }
  };

  const reset = () => {
    setDraft(settings);
    setSaveError(null);
  };

  const ifaceOptions = [
    { value: "", label: "auto-detect on session start" },
    ...interfaces.map((i) => ({
      value: i.name,
      label: `${i.display_name} (${i.ipv4 || "no ipv4"})`,
    })),
  ];

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px 80px" }}>
      <div style={{ maxWidth: 880, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Settings</h1>
            <span className="micro">persisted on the agent, applied to every new session</span>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {savedAt && !dirty && (
              <span className="micro" style={{ color: "var(--ok)" }}>saved</span>
            )}
            {saveError && (
              <span className="mono" style={{ fontSize: "var(--fs-label)", color: "var(--danger)" }}>
                {saveError}
              </span>
            )}
            <Button variant="ghost" onClick={reset} disabled={!dirty || saving}>
              Discard
            </Button>
            <Button variant="primary" onClick={save} disabled={!dirty || saving}>
              {saving ? "Saving..." : dirty ? "Apply changes" : "Saved"}
            </Button>
          </div>
        </div>

        <Panel title="Attack defaults">
          <SectionTitle>Session behavior</SectionTitle>
          <SectionNote>
            Used as defaults when a session is started. Per-session overrides are set at start time.
          </SectionNote>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <Select
              label="Direction"
              hint="two-way poisons both target and gateway caches"
              value={draft.attack.direction}
              onChange={(v) => patchDraft(["attack", "direction"], v)}
              options={[
                { value: "two-way", label: "two-way (full MITM)" },
                { value: "one-way", label: "one-way (target only)" },
              ]}
            />
            <NumberField
              label="Poison interval"
              hint="seconds between forged ARP bursts, with 20% jitter"
              value={draft.attack.poison_interval}
              min={0.1}
              max={30}
              step={0.1}
              unit="s"
              onChange={(v) => patchDraft(["attack", "poison_interval"], v)}
            />
            <NumberField
              label="Verify timeout"
              hint="how long each verification window listens"
              value={draft.attack.verify_timeout}
              min={1}
              max={60}
              step={0.5}
              unit="s"
              onChange={(v) => patchDraft(["attack", "verify_timeout"], v)}
            />
            <NumberField
              label="Auto verify"
              hint="run a verification every N seconds (0 = manual only)"
              value={draft.attack.auto_verify_s}
              min={0}
              max={600}
              unit="s"
              onChange={(v) => patchDraft(["attack", "auto_verify_s"], Math.round(v))}
            />
          </div>
        </Panel>

        <Panel title="Safety">
          <SectionTitle>Guard rails</SectionTitle>
          <SectionNote>
            These protect the host from self-poisoning and ensure the network is left clean.
          </SectionNote>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <Toggle
              label="Self-check"
              hint="refuse to start if target or gateway resolves to this machine"
              checked={!draft.safety.skip_self_check}
              onChange={(v) => patchDraft(["safety", "skip_self_check"], !v)}
            />
            <Toggle
              label="Auto IP forwarding"
              hint="enable IP forwarding on start and disable it on stop"
              checked={draft.safety.auto_forwarding}
              onChange={(v) => patchDraft(["safety", "auto_forwarding"], v)}
            />
            <Toggle
              label="Restore ARP on stop"
              hint="re-ARP both sides with correct MACs when the session ends"
              checked={draft.safety.restore_on_stop}
              onChange={(v) => patchDraft(["safety", "restore_on_stop"], v)}
            />
          </div>
        </Panel>

        <Panel title="Interface">
          <SectionTitle>Network binding</SectionTitle>
          <SectionNote>
            Leave on auto-detect unless the target is reachable through a specific adapter.
          </SectionNote>
          <div style={{ maxWidth: 420 }}>
            <Select
              label="Preferred interface"
              value={draft.interface.preferred}
              onChange={(v) => patchDraft(["interface", "preferred"], v)}
              options={ifaceOptions}
            />
          </div>
        </Panel>

        <Panel title="Telemetry">
          <SectionTitle>Retention and buffers</SectionTitle>
          <SectionNote>
            Bound the agent memory footprint. Older entries are discarded first.
          </SectionNote>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
            <NumberField
              label="Metric history"
              value={draft.telemetry.retention_s}
              min={60}
              max={86400}
              step={60}
              unit="s"
              onChange={(v) => patchDraft(["telemetry", "retention_s"], Math.round(v))}
            />
            <NumberField
              label="Packet log max"
              value={draft.telemetry.packet_log_max}
              min={50}
              max={20000}
              step={50}
              unit="rows"
              onChange={(v) => patchDraft(["telemetry", "packet_log_max"], Math.round(v))}
            />
            <NumberField
              label="Event log max"
              value={draft.telemetry.event_log_max}
              min={50}
              max={5000}
              step={50}
              unit="rows"
              onChange={(v) => patchDraft(["telemetry", "event_log_max"], Math.round(v))}
            />
          </div>
        </Panel>

        <Panel title="Interface preferences">
          <SectionTitle>Console</SectionTitle>
          <SectionNote>Applied immediately after save, local to this console.</SectionNote>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
            <Select
              label="Density"
              value={draft.ui.density}
              onChange={(v) => patchDraft(["ui", "density"], v)}
              options={[
                { value: "comfortable", label: "comfortable" },
                { value: "compact", label: "compact (field)" },
              ]}
            />
            <Select
              label="Time format"
              value={draft.ui.time_format}
              onChange={(v) => patchDraft(["ui", "time_format"], v)}
              options={[
                { value: "24h", label: "24-hour" },
                { value: "12h", label: "12-hour" },
              ]}
            />
            <NumberField
              label="Refresh"
              value={draft.ui.refresh_ms}
              min={500}
              max={5000}
              step={100}
              unit="ms"
              onChange={(v) => patchDraft(["ui", "refresh_ms"], Math.round(v))}
            />
          </div>
          <div style={{ marginTop: 8 }}>
            <Toggle
              label="Reduce motion"
              hint="disable flow animation on the signal path"
              checked={draft.ui.reduce_motion}
              onChange={(v) => patchDraft(["ui", "reduce_motion"], v)}
            />
          </div>
        </Panel>
      </div>
    </div>
  );
}