"use client";

import { useEffect, useMemo, useRef } from "react";
import uPlot from "uplot";
import { useSessionStore } from "@/lib/session-store";
import { useElementSize } from "@/hooks/useElementSize";
import { formatBytes, formatClock } from "@/lib/format";

const WINDOW_S = 120; // rolling 2 minutes

function fmtRateTick(v: number): string {
  if (v === 0) return "0";
  // compact: 980K / 1.9M to keep the axis narrow
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1024) return `${Math.round(v / 1024)}K`;
  return `${Math.round(v)}`;
}

export default function TelemetryChart() {
  const { ticks } = useSessionStore();
  const { ref, width, height } = useElementSize<HTMLDivElement>();
  const chartRef = useRef<uPlot | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);

  const options = useMemo<uPlot.Options>(
    () => ({
      width: Math.max(width, 100),
      height: Math.max(height - 26, 80),
      legend: { show: false },
      cursor: { show: false },
      scales: {
        x: { time: true, min: undefined, max: undefined },
        y: { range: (_u, _min, max) => [0, Math.max(1024, (max ?? 0) * 1.15)] },
      },
      axes: [
        {
          stroke: "#63636a",
          font: "10px 'IBM Plex Mono', monospace",
          grid: { stroke: "#1e1e22", width: 1 },
          ticks: { stroke: "#26262b", width: 1 },
          values: (_u, splits) => splits.map((s) => formatClock(s)),
          gap: 6,
          size: 22,
        },
        {
          stroke: "#63636a",
          font: "10px 'IBM Plex Mono', monospace",
          grid: { stroke: "#1e1e22", width: 1 },
          ticks: { stroke: "#26262b", width: 1 },
          values: (_u, splits) => splits.map((s) => fmtRateTick(s)),
          gap: 4,
          size: 40,
        },
      ],
      series: [
        {},
        {
          label: "machine rx",
          stroke: "#63636a",
          width: 1,
          points: { show: false },
        },
        {
          label: "intercepted",
          stroke: "#f0a92e",
          width: 1.5,
          fill: "rgba(240, 169, 46, 0.07)",
          points: { show: false },
        },
      ],
    }),
    [width, height]
  );

  useEffect(() => {
    if (!hostRef.current) return;
    const u = new uPlot(options, [[], [], []] as uPlot.AlignedData, hostRef.current);
    chartRef.current = u;
    return () => {
      u.destroy();
      chartRef.current = null;
    };
  }, [options]);

  // push data on every tick batch change
  useEffect(() => {
    const u = chartRef.current;
    if (!u) return;
    const now = Date.now() / 1000;
    const minTs = now - WINDOW_S;
    const windowed = ticks.filter((t) => t.ts >= minTs);
    if (windowed.length === 0) return;

    const x: number[] = [];
    const machine: number[] = [];
    const cap: number[] = [];
    for (const t of windowed) {
      x.push(t.ts);
      machine.push(t.iface_rx_bytes + t.iface_tx_bytes);
      cap.push(t.cap_bytes);
    }
    u.setData([x, machine, cap] as uPlot.AlignedData, false);
    u.setScale("x", { min: minTs, max: now });
    u.redraw(false, true);
  }, [ticks]);

  // burst tick marks rendered as a DOM lane under the plot
  const bursts = useMemo(() => {
    const now = Date.now() / 1000;
    return ticks.filter((t) => t.poison_bursts > 0 && t.ts >= now - WINDOW_S);
  }, [ticks]);

  const now = Date.now() / 1000;

  return (
    <div
      ref={ref}
      style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          height: 26,
          padding: "0 2px",
        }}
      >
        <span className="micro">bytes / second, rolling 2 min</span>
        <span className="micro" style={{ letterSpacing: "0.06em", textTransform: "none" }}>
          <span style={{ color: "var(--accent)" }}>&#9644;</span> intercepted&nbsp;&nbsp;
          <span style={{ color: "var(--ink-3)" }}>&#9644;</span> machine total
        </span>
      </div>
      <div ref={hostRef} style={{ flex: 1, minHeight: 0, overflow: "hidden" }} />
      {/* poison burst lane */}
      <div
        aria-hidden
        title="Poison burst activity"
        style={{
          position: "relative",
          height: 12,
          marginTop: 2,
          borderTop: "1px solid var(--line-faint)",
        }}
      >
        {bursts.map((t) => {
          const x = 1 - (now - t.ts) / WINDOW_S;
          if (x < 0 || x > 1) return null;
          return (
            <span
              key={t.ts}
              style={{
                position: "absolute",
                left: `${x * 100}%`,
                top: 2,
                width: 2,
                height: 8,
                background: "var(--accent)",
                opacity: Math.min(1, 0.35 + t.poison_bursts * 0.2),
                animation: "tick-pop 300ms ease-out",
              }}
            />
          );
        })}
        <span
          className="micro"
          style={{
            position: "absolute",
            right: 0,
            top: 1,
            color: "var(--ink-4)",
            letterSpacing: "0.1em",
          }}
        >
          bursts
        </span>
      </div>
    </div>
  );
}
