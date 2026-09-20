"use client";

import { useSessionStore } from "@/lib/session-store";
import { useSettings } from "@/lib/settings-context";
import { formatCount } from "@/lib/format";

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

/* ruler graduation ticks along a channel */
function RulerTicks({ running }: { running: boolean }) {
  const ticks = 24;
  return (
    <div
      aria-hidden
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        top: "50%",
        transform: "translateY(-50%)",
        height: 12,
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        pointerEvents: "none",
        opacity: running ? 0.5 : 0.28,
      }}
    >
      {Array.from({ length: ticks }, (_, i) => (
        <span
          key={i}
          style={{
            width: 1,
            height: i % 6 === 0 ? 9 : 4,
            background: running ? "var(--ink-3)" : "var(--line-strong)",
          }}
        />
      ))}
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
        <>
          <span
            aria-hidden
            style={{
              position: "absolute",
              top: "50%",
              left: 0,
              width: 22,
              height: 2,
              background: "var(--accent-hi)",
              transform: "translateY(-50%)",
              animation: `flowslide 1.7s linear infinite ${reverse ? "0.9s" : "0s"}`,
            }}
          />
          <span
            aria-hidden
            style={{
              position: "absolute",
              top: "50%",
              left: 0,
              width: 10,
              height: 2,
              background: "var(--accent)",
              opacity: 0.6,
              transform: "translateY(-50%)",
              animation: `flowslide 1.7s linear infinite ${reverse ? "1.3s" : "0.45s"}`,
            }}
          />
        </>
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

function ChannelLabel({ left, right, running }: { left: string; right: string; running: boolean }) {
  return (
    <div
      className="micro topo-chanlabel"
      style={{
        position: "absolute",
        left: 2,
        right: 2,
        top: -13,
        display: "flex",
        justifyContent: "space-between",
        color: running ? "var(--ink-3)" : "var(--ink-4)",
        letterSpacing: "0.1em",
        pointerEvents: "none",
      }}
    >
      <span>{left}</span>
      <span>{right}</span>
    </div>
  );
}

function LinkChannel({
  running,
  direction,
  reduceMotion,
  leftIp,
  rightIp,
}: {
  running: boolean;
  direction: "two-way" | "one-way";
  reduceMotion: boolean;
  leftIp: string;
  rightIp: string;
}) {
  return (
    <div
      className="topo-channel"
      style={{
        position: "relative",
        flex: 1,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        gap: 10,
        padding: "0 6px",
        minWidth: 60,
      }}
    >
      <ChannelLabel left={leftIp} right={rightIp} running={running} />
      <RulerTicks running={running} />
      <FlowLane running={running} reduceMotion={reduceMotion} />
      <FlowLane
        running={running && direction === "two-way"}
        reverse
        reduceMotion={reduceMotion}
      />
    </div>
  );
}

function shortIp(ip: string): string {
  if (!ip) return "";
  const parts = ip.split(".");
  return parts.length === 4 ? `.${parts[3]}` : ip;
}

export default function TopologyDiagram() {
  const { session, latest } = useSessionStore();
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

  const interval = session.config?.poison_interval ?? settings.attack.poison_interval;
  const bursts = running ? session.poison_bursts : 0;
  const capPps = running && latest ? latest.cap_packets : 0;

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
        paddingTop: 10,
      }}
    >
      <NodeBox label="Target" ip={targetIp} mac={targetMac} active={running} danger />
      <LinkChannel
        running={running}
        direction={direction}
        reduceMotion={reduce}
        leftIp={shortIp(targetIp)}
        rightIp={shortIp(attackerIp)}
      />
      <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "center" }}>
        <NodeBox
          label="This machine"
          ip={attackerIp}
          mac={attackerMac}
          sub={session.attacker?.interface ?? undefined}
          active={running}
          accent
        />
        {running && (
          <div className="micro" style={{ display: "flex", gap: 14, color: "var(--accent)", letterSpacing: "0.14em", whiteSpace: "nowrap" }}>
            <span>{direction === "two-way" ? "TWO-WAY" : "ONE-WAY"}</span>
            <span style={{ color: "var(--ink-3)" }}>q {interval}s</span>
            <span style={{ color: "var(--ink-3)" }}>{formatCount(bursts)} bursts</span>
            <span style={{ color: "var(--ink-3)" }}>{capPps} pkt/s</span>
          </div>
        )}
      </div>
      <LinkChannel
        running={running}
        direction={direction}
        reduceMotion={reduce}
        leftIp={shortIp(attackerIp)}
        rightIp={shortIp(gatewayIp)}
      />
      <NodeBox label="Gateway" ip={gatewayIp} mac={gatewayMac} active={running} />
      <style>{`
        @keyframes flowslide {
          0% { left: 0; opacity: 0; }
          8% { opacity: 1; }
          92% { opacity: 1; }
          100% { left: calc(100% - 22px); opacity: 0; }
        }
        @media (max-width: 1100px) {
          .topo-node { width: 132px !important; padding: 8px 10px !important; }
          .topo-node .topo-ip { font-size: 13px !important; }
          .topo-node .topo-mac { display: none !important; }
          .topo-channel { min-width: 34px !important; padding: 0 3px !important; }
          .topo-chanlabel { display: none !important; }
        }
      `}</style>
    </div>
  );
}