"use client";

import { useSessionStore } from "@/lib/session-store";
import { useSettings } from "@/lib/settings-context";
import { formatDuration } from "@/lib/format";

function NodeBox({
  label,
  ip,
  mac,
  sub,
  active,
  accent = false,
  danger = false,
}: {
  label: string;
  ip: string;
  mac: string;
  sub?: string;
  active: boolean;
  accent?: boolean;
  danger?: boolean;
}) {
  const border = !active
    ? "var(--line-strong)"
    : danger
      ? "var(--danger)"
      : accent
        ? "var(--accent)"
        : "var(--ok)";
  const empty = !ip;
  return (
    <div
      className="topo-node"
      style={{
        border: `1px solid ${border}`,
        borderRadius: "var(--radius)",
        background: empty ? "transparent" : "var(--surface-2)",
        borderStyle: empty ? "dashed" : "solid",
        padding: "10px 12px",
        width: 168,
        display: "flex",
        flexDirection: "column",
        gap: 3,
        transition: "border-color 300ms",
      }}
    >
      <span className="micro">{label}</span>
      <span
        className="mono topo-ip"
        style={{
          fontSize: 15,
          fontWeight: 600,
          color: active ? "var(--ink)" : "var(--ink-2)",
          letterSpacing: "0.01em",
        }}
      >
        {empty ? "not set" : ip}
      </span>
      <span className="mono topo-mac" style={{ fontSize: 11, color: "var(--ink-3)" }}>
        {mac || ""}
      </span>
      {sub && (
        <span className="micro" style={{ color: "var(--ink-4)", marginTop: 2 }}>
          {sub}
        </span>
      )}
    </div>
  );
}

function FlowLane({
  running,
  reverse = false,
  reduceMotion,
}: {
  running: boolean;
  reverse?: boolean;
  reduceMotion: boolean;
}) {
  const lineColor = running ? "var(--accent)" : "var(--line-strong)";
  return (
    <div
      style={{
        position: "relative",
        height: 2,
        background: running ? lineColor : "var(--line-strong)",
        opacity: running ? 0.55 : 0.6,
        transform: reverse ? "scaleX(-1)" : undefined,
      }}
    >
      {running && !reduceMotion && (
        <span
          aria-hidden
          className="flow-packet"
          style={{
            position: "absolute",
            top: "50%",
            left: 0,
            width: 18,
            height: 2,
            background: "var(--accent-hi)",
            transform: "translateY(-50%)",
            animation: `flowslide 1.6s linear infinite ${reverse ? "0.8s" : "0s"}`,
          }}
        />
      )}
      <span
        aria-hidden
        style={{
          position: "absolute",
          right: -1,
          top: -3,
          borderLeft: `5px solid ${lineColor}`,
          borderTop: "4px solid transparent",
          borderBottom: "4px solid transparent",
        }}
      />
    </div>
  );
}

function LinkChannel({
  running,
  direction,
  reduceMotion,
}: {
  running: boolean;
  direction: "two-way" | "one-way";
  reduceMotion: boolean;
}) {
  return (
    <div
      className="topo-channel"
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        gap: 10,
        padding: "0 6px",
        minWidth: 60,
      }}
    >
      <FlowLane running={running} reduceMotion={reduceMotion} />
      <FlowLane
        running={running && direction === "two-way"}
        reverse
        reduceMotion={reduceMotion}
      />
    </div>
  );
}

export default function TopologyDiagram() {
  const { session } = useSessionStore();
  const { settings } = useSettings();

  const running = session.state === "running";
  const direction = session.config?.direction ?? settings.attack.direction;
  const reduce = settings.ui.reduce_motion;

  const targetIp = session.target?.ip ?? session.config?.target_ip ?? "";
  const targetMac = session.target?.mac ?? "";
  const gatewayIp = session.gateway?.ip ?? session.config?.gateway_ip ?? "";
  const gatewayMac = session.gateway?.mac ?? "";
  const attackerIp = session.attacker?.ip ?? "";
  const attackerMac = session.attacker?.mac ?? "";

  return (
    <div
      role="img"
      aria-label={
        running
          ? `Traffic path: target ${targetIp} through this machine to gateway ${gatewayIp}`
          : "No active session"
      }
      style={{
        display: "flex",
        alignItems: "center",
        flex: 1,
        minHeight: 108,
      }}
    >
      <NodeBox label="Target" ip={targetIp} mac={targetMac} active={running} danger />
      <LinkChannel running={running} direction={direction} reduceMotion={reduce} />
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <NodeBox
          label="This machine"
          ip={attackerIp}
          mac={attackerMac}
          sub={session.attacker?.interface ?? undefined}
          active={running}
          accent
        />
        {running && (
          <div
            className="micro"
            style={{ textAlign: "center", color: "var(--accent)", letterSpacing: "0.2em" }}
          >
            {direction === "two-way" ? "TWO-WAY POISON" : "ONE-WAY POISON"}
          </div>
        )}
      </div>
      <LinkChannel running={running} direction={direction} reduceMotion={reduce} />
      <NodeBox label="Gateway" ip={gatewayIp} mac={gatewayMac} active={running} />
      <style>{`
        @keyframes flowslide {
          0% { left: 0; opacity: 0; }
          8% { opacity: 1; }
          92% { opacity: 1; }
          100% { left: calc(100% - 18px); opacity: 0; }
        }
        @media (max-width: 1100px) {
          .topo-node { width: 132px !important; padding: 8px 10px !important; }
          .topo-node .topo-ip { font-size: 13px !important; }
          .topo-node .topo-mac { display: none !important; }
          .topo-channel { min-width: 34px !important; padding: 0 3px !important; }
        }
      `}</style>
    </div>
  );
}

export function SessionSummaryStrip() {
  const { session } = useSessionStore();
  const running = session.state === "running";
  if (!running || !session.started_at || !session.config) return null;
  return (
    <div
      className="micro"
      style={{ display: "flex", gap: 18, color: "var(--ink-3)", flexWrap: "wrap" }}
    >
      <span>
        interval{" "}
        <span className="mono" style={{ color: "var(--ink-2)" }}>
          {session.config.poison_interval}s
        </span>
      </span>
      <span>
        bursts{" "}
        <span className="mono" style={{ color: "var(--ink-2)" }}>
          {session.poison_bursts}
        </span>
      </span>
      <span>
        uptime{" "}
        <span className="mono" style={{ color: "var(--ink-2)" }}>
          {formatDuration(Date.now() / 1000 - session.started_at)}
        </span>
      </span>
    </div>
  );
}