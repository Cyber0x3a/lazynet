"use client";

import { useMemo } from "react";
import { useSessionStore } from "@/lib/session-store";
import { formatCount } from "@/lib/format";

const LANES: { key: "tcp" | "udp" | "dns" | "icmp" | "arp" | "other"; label: string; color: string }[] = [
  { key: "tcp", label: "TCP", color: "var(--p-tcp)" },
  { key: "udp", label: "UDP", color: "var(--p-udp)" },
  { key: "dns", label: "DNS", color: "var(--p-dns)" },
  { key: "icmp", label: "ICMP", color: "var(--p-icmp)" },
  { key: "arp", label: "ARP", color: "var(--p-arp)" },
  { key: "other", label: "OTHER", color: "var(--p-other)" },
];

export default function ProtocolBars() {
  const { ticks, session } = useSessionStore();
  const running = session.state === "running";

  const totals = useMemo(() => {
    const acc: Record<string, number> = { tcp: 0, udp: 0, dns: 0, icmp: 0, arp: 0, other: 0 };
    const windowTicks =
      running && session.started_at
        ? ticks.filter((t) => t.ts >= session.started_at!)
        : [];
    for (const t of windowTicks) {
      for (const lane of LANES) acc[lane.key] += t.proto[lane.key];
    }
    return acc;
  }, [ticks, running, session.started_at]);

  const max = Math.max(1, ...LANES.map((l) => totals[l.key]));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: 1, justifyContent: "center" }}>
      {LANES.map((lane) => {
        const v = totals[lane.key];
        const pct = (v / max) * 100;
        return (
          <div key={lane.key} style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span
              className="micro"
              style={{ width: 42, flexShrink: 0, color: "var(--ink-2)" }}
            >
              {lane.label}
            </span>
            <div
              style={{
                flex: 1,
                height: 10,
                background: "var(--surface-2)",
                borderRadius: 1,
                overflow: "hidden",
              }}
              role="img"
              aria-label={`${lane.label}: ${v} packets`}
            >
              <div
                style={{
                  width: `${v === 0 ? 0 : Math.max(2, pct)}%`,
                  height: "100%",
                  background: lane.color,
                  opacity: 0.85,
                  transition: "width 400ms ease-out",
                }}
              />
            </div>
            <span
              className="num"
              style={{
                width: 56,
                textAlign: "right",
                fontSize: "var(--fs-label)",
                color: v > 0 ? "var(--ink)" : "var(--ink-4)",
              }}
            >
              {formatCount(v)}
            </span>
          </div>
        );
      })}
      {!running && (
        <span className="micro" style={{ textAlign: "center", marginTop: 6 }}>
          counters reset when a session starts
        </span>
      )}
    </div>
  );
}
