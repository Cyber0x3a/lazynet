"use client";

import { useEffect, useState } from "react";
import { agentRpc } from "@/lib/agent-client";
import { useSessionStore } from "@/lib/session-store";
import { useSettings } from "@/lib/settings-context";
import { formatClock } from "@/lib/format";
import { Button } from "@/components/ui";
import type { InterfaceInfo, SessionState } from "@/lib/types";

export default function SessionControls() {
  const { session, agentOnline } = useSessionStore();
  const { settings } = useSettings();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [interfaces, setInterfaces] = useState<InterfaceInfo[]>([]);
  const [targetIp, setTargetIp] = useState("");
  const [gatewayIp, setGatewayIp] = useState("");
  const [iface, setIface] = useState("");
  const [direction, setDirection] = useState<string>(settings.attack.direction);
  const [interval, setInterval_] = useState(settings.attack.poison_interval);

  const running = session.state === "running";
  const stopping = session.state === "stopping";

  useEffect(() => {
    if (!open || !agentOnline) return;
    agentRpc<{ interfaces: InterfaceInfo[] }>("interfaces.list").then((res) => {
      if (res.ok && res.data) setInterfaces(res.data.interfaces);
    });
    setDirection(settings.attack.direction);
    setInterval_(settings.attack.poison_interval);
  }, [open, agentOnline, settings.attack.direction, settings.attack.poison_interval]);

  const usable = interfaces.filter((i) => i.is_usable);

  const start = async () => {
    setBusy(true);
    setError(null);
    const params: Record<string, unknown> = {
      target_ip: targetIp.trim(),
      gateway_ip: gatewayIp.trim(),
      direction,
      poison_interval: interval,
    };
    if (iface) params.interface = iface;
    const res = await agentRpc<{ session: SessionState }>("session.start", params);
    setBusy(false);
    if (!res.ok) {
      setError(res.error ?? "failed to start");
      return;
    }
    setOpen(false);
  };

  const stop = async () => {
    setBusy(true);
    setError(null);
    await agentRpc("session.stop");
    setBusy(false);
  };

  const inputStyle: React.CSSProperties = {
    background: "var(--surface-2)",
    border: "1px solid var(--line-strong)",
    borderRadius: "var(--radius)",
    color: "var(--ink)",
    fontSize: "var(--fs-body)",
    padding: "7px 10px",
    width: "100%",
  };

  return (
    <>
      {running ? (
        <Button variant="danger" onClick={stop} disabled={busy || stopping} title="Stop poisoning and restore ARP tables">
          {stopping ? "Stopping..." : "Stop session"}
        </Button>
      ) : (
        <Button variant="primary" onClick={() => setOpen(true)} disabled={!agentOnline || busy} title="Configure and start a poisoning session">
          Start session
        </Button>
      )}

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Start poisoning session"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(10,10,11,0.72)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 100,
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div
            style={{
              width: 420,
              background: "var(--surface-1)",
              border: "1px solid var(--line-strong)",
              borderRadius: "var(--radius)",
              padding: 20,
              display: "flex",
              flexDirection: "column",
              gap: 14,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <span style={{ fontWeight: 600, fontSize: 15 }}>Start poisoning session</span>
              <span className="micro">arp mitm</span>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <label className="micro" htmlFor="sc-target">target ip</label>
              <input id="sc-target" className="mono" style={inputStyle} value={targetIp}
                onChange={(e) => setTargetIp(e.target.value)} placeholder="192.168.1.28" spellCheck={false} autoFocus />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <label className="micro" htmlFor="sc-gateway">gateway ip</label>
              <input id="sc-gateway" className="mono" style={inputStyle} value={gatewayIp}
                onChange={(e) => setGatewayIp(e.target.value)} placeholder="192.168.1.1" spellCheck={false} />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <label className="micro" htmlFor="sc-iface">interface</label>
                <select id="sc-iface" value={iface} onChange={(e) => setIface(e.target.value)}
                  style={{ ...inputStyle, appearance: "auto" }}>
                  <option value="">auto-detect</option>
                  {usable.map((i) => (
                    <option key={i.name} value={i.name}>
                      {i.display_name} ({i.ipv4})
                    </option>
                  ))}
                </select>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <label className="micro" htmlFor="sc-dir">direction</label>
                <select id="sc-dir" value={direction} onChange={(e) => setDirection(e.target.value)}
                  style={{ ...inputStyle, appearance: "auto" }}>
                  <option value="two-way">two-way</option>
                  <option value="one-way">one-way</option>
                </select>
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <label className="micro" htmlFor="sc-interval">poison interval (s)</label>
              <input id="sc-interval" type="number" min={0.1} step={0.1} className="mono"
                style={inputStyle} value={interval}
                onChange={(e) => setInterval_(Number(e.target.value))} />
            </div>

            {error && (
              <div
                role="alert"
                className="mono"
                style={{
                  fontSize: "var(--fs-label)",
                  color: "var(--danger)",
                  border: "1px solid var(--danger-dim)",
                  borderRadius: "var(--radius)",
                  padding: "8px 10px",
                  background: "var(--surface-2)",
                }}
              >
                {error}
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 4 }}>
              <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={start}
                disabled={busy || !targetIp.trim() || !gatewayIp.trim()}
              >
                {busy ? "Starting..." : "Start"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}