"use client";

import { useSessionStore } from "@/lib/session-store";
import { formatCount, formatRate } from "@/lib/format";

function Readout({
  label,
  value,
  sub,
  accent = false,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        gap: 2,
        padding: "10px 16px",
        minWidth: 0,
      }}
    >
      <span className="micro" style={{ whiteSpace: "nowrap" }}>
        {label}
      </span>
      <span
        className="num"
        style={{
          fontSize: 22,
          fontWeight: 500,
          lineHeight: 1.1,
          color: accent ? "var(--accent-hi)" : "var(--ink)",
          whiteSpace: "nowrap",
        }}
      >
        {value}
      </span>
      <span
        className="mono"
        style={{
          fontSize: "var(--fs-label)",
          color: "var(--ink-3)",
          whiteSpace: "nowrap",
          minHeight: 14,
        }}
      >
        {sub ?? ""}
      </span>
    </div>
  );
}

export default function ReadoutRail() {
  const { session, latest, ticks } = useSessionStore();
  const running = session.state === "running";

  // session-window aggregates from the tick buffer
  let sessionPackets = 0;
  let sessionBytes = 0;
  let avgCapRate = 0;
  let firstTs: number | null = null;
  if (running && session.started_at) {
    const window = ticks.filter((t) => t.ts >= session.started_at!);
    for (const t of window) {
      sessionPackets += t.cap_packets;
      sessionBytes += t.cap_bytes;
    }
    if (window.length > 0) {
      firstTs = window[0].ts;
      const span = Math.max(1, window[window.length - 1].ts - firstTs + 1);
      avgCapRate = sessionBytes / span;
    }
  }

  const rxNow = latest ? latest.iface_rx_bytes : 0;
  const txNow = latest ? latest.iface_tx_bytes : 0;
  const capNow = latest ? latest.cap_bytes : 0;
  const ppsNow = latest ? latest.cap_packets : 0;

  return (
    <div
      role="group"
      aria-label="Session readouts"
      className="readout-rail"
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
        background: "var(--surface-1)",
        border: "1px solid var(--line)",
        borderRadius: "var(--radius)",
        overflow: "hidden",
      }}
    >
      <style>{`
        @media (max-width: 1100px) {
          .readout-rail { grid-template-columns: repeat(3, minmax(0, 1fr)) !important; }
        }
        @media (max-width: 620px) {
          .readout-rail { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
        }
      `}</style>
      <Readout
        label="Intercept rate"
        value={running ? formatRate(capNow) : "0 B/s"}
        sub={running ? `${ppsNow} pkt/s through path` : "no session"}
        accent={running && capNow > 0}
      />
      <div style={{ borderLeft: "1px solid var(--line-faint)", display: "flex" }}>
        <Readout
          label="Session volume"
          value={running ? formatCount(sessionPackets) : "0"}
          sub={running ? `packets, ${avgCapRate > 0 ? formatRate(avgCapRate) : "0 B/s"} avg` : ""}
        />
      </div>
      <div style={{ borderLeft: "1px solid var(--line-faint)", display: "flex" }}>
        <Readout
          label="Session bytes"
          value={running ? (sessionBytes / 1024).toFixed(1) : "0.0"}
          sub="KB intercepted"
        />
      </div>
      <div style={{ borderLeft: "1px solid var(--line-faint)", display: "flex" }}>
        <Readout
          label="Poison bursts"
          value={formatCount(session.poison_bursts)}
          sub={running ? "forged replies sent" : "engine idle"}
          accent={running}
        />
      </div>
      <div style={{ borderLeft: "1px solid var(--line-faint)", display: "flex" }}>
        <Readout
          label="Machine NIC"
          value={`${formatRate(rxNow)}`}
          sub={`rx, tx ${formatRate(txNow)}`}
        />
      </div>
    </div>
  );
}
