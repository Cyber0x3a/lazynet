"use client";

import { useSessionStore } from "@/lib/session-store";
import { agentRpc } from "@/lib/agent-client";
import { Panel } from "@/shared/components";
import {
  EventLog,
  PacketTable,
  ProtocolBars,
  ReadoutRail,
  SessionControls,
  TelemetryChart,
  TopologyDiagram,
  VerifyPanel,
} from "./index";
import { useEffect, useRef, useState, useCallback } from "react";

const ASIDE_MIN = 280;
const ASIDE_MAX = 640;
const ASIDE_DEFAULT = 340;
const LS_KEY = "lazynet.asideWidth";

function ForwardingToggle() {
  const { forwarding, agentOnline } = useSessionStore();
  const enabled = forwarding?.enabled ?? false;
  const strategy = forwarding?.strategy ?? "";
  const privileged = forwarding?.privileged ?? false;

  const toggle = async () => {
    if (!agentOnline) return;
    await agentRpc("forwarding.set", { enabled: !enabled });
    // the agent pushes a "forwarding" stream message with the new state
  };

  // Clear, honest tooltip: explain why a click may have no effect
  const title = !agentOnline
    ? "Agent offline"
    : !privileged
      ? "IP forwarding needs admin/root: restart the console elevated to change it"
      : strategy
        ? `${strategy}: click to ${enabled ? "disable" : "enable"} IP forwarding`
        : "IP forwarding";

  return (
    <button
      onClick={toggle}
      disabled={!agentOnline}
      role="switch"
      aria-checked={enabled}
      title={title}
      className="micro"
      style={{
        background: enabled ? "rgba(127,174,106,0.10)" : "transparent",
        border: `1px solid ${enabled ? "var(--ok-dim)" : "var(--line)"}`,
        borderRadius: "var(--radius)",
        padding: "4px 10px",
        color: enabled ? "var(--ok)" : "var(--ink-3)",
        letterSpacing: "0.12em",
        cursor: agentOnline ? "pointer" : "not-allowed",
        opacity: agentOnline ? 1 : 0.5,
        transition: "color 150ms, border-color 150ms, background 150ms",
      }}
    >
      forwarding {enabled ? "on" : "off"}
      {agentOnline && !privileged && (
        <span style={{ color: "var(--warn)", marginLeft: 6 }} title={title}>
          needs admin
        </span>
      )}
    </button>
  );
}

export function ConsolePage() {
  const { agentOnline } = useSessionStore();
  const [asideWidth, setAsideWidth] = useState(ASIDE_DEFAULT);
  const [dragging, setDragging] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const saved = Number(localStorage.getItem(LS_KEY));
    if (Number.isFinite(saved) && saved >= ASIDE_MIN && saved <= ASIDE_MAX) {
      setAsideWidth(saved);
    }
  }, []);

  const onDragStart = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    setDragging(true);
    const startX = e.clientX;
    const startWidth = asideWidth;

    const onMove = (ev: PointerEvent) => {
      const delta = startX - ev.clientX; // dragging left grows the aside
      const next = Math.min(ASIDE_MAX, Math.max(ASIDE_MIN, startWidth + delta));
      setAsideWidth(next);
    };
    const onUp = () => {
      setDragging(false);
      setAsideWidth((w) => {
        localStorage.setItem(LS_KEY, String(w));
        return w;
      });
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }, [asideWidth]);

  const resetWidth = useCallback(() => {
    setAsideWidth(ASIDE_DEFAULT);
    localStorage.setItem(LS_KEY, String(ASIDE_DEFAULT));
  }, []);

  return (
    <div
      ref={rootRef}
      className="console-root"
      style={dragging ? { cursor: "col-resize", userSelect: "none" } : undefined}
    >
      {/* main column */}
      <div className="console-main">
        <Panel
          title="Signal path"
          right={
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <ForwardingToggle />
              <SessionControls />
            </div>
          }
        >
          {agentOnline ? (
            <TopologyDiagram />
          ) : (
            <div className="agent-offline-box">
              <span className="micro agent-offline-label">agent offline</span>
              <span className="mono agent-offline-cmd">
                the console starts the agent automatically; check the server log
              </span>
            </div>
          )}
        </Panel>

        <ReadoutRail />

        <Panel title="Throughput" pad={false} className="telemetry-panel">
          <div className="telemetry-body">
            <TelemetryChart />
          </div>
        </Panel>

        <Panel title="Packet log" pad={false} className="packet-log-panel">
          <PacketTable />
        </Panel>
      </div>

      {/* drag handle */}
      <div
        className="aside-handle"
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize inspector panel"
        title="Drag to resize. Double-click to reset."
        onPointerDown={onDragStart}
        onDoubleClick={resetWidth}
      >
        <span className="aside-handle-grip" />
      </div>

      {/* inspector column */}
      <aside className="console-aside" style={{ width: asideWidth }}>
        <Panel title="Verification">
          <VerifyPanel />
        </Panel>
        <Panel title="Protocol mix" className="proto-panel">
          <ProtocolBars />
        </Panel>
        <EventLog />
      </aside>

      <style>{`
        .console-root {
          flex: 1;
          min-height: 0;
          display: flex;
          gap: 12px;
          padding: 12px;
          overflow: hidden;
        }
        .console-main {
          flex: 1;
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 12px;
          min-height: 0;
        }
        .console-aside {
          flex-shrink: 0;
          display: flex;
          flex-direction: column;
          gap: 12px;
          min-height: 0;
        }
        .aside-handle {
          flex-shrink: 0;
          width: 6px;
          margin: 0 -7px;
          z-index: 10;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: col-resize;
          touch-action: none;
        }
        .aside-handle-grip {
          width: 2px;
          height: 44px;
          border-radius: 1px;
          background: var(--line-strong);
          transition: background 150ms, height 150ms;
        }
        .aside-handle:hover .aside-handle-grip,
        .aside-handle:active .aside-handle-grip {
          background: var(--accent);
          height: 72px;
        }
        .agent-offline-box {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 10px;
          min-height: 96px;
        }
        .agent-offline-label { letter-spacing: 0.18em; color: var(--danger); }
        .agent-offline-cmd { font-size: var(--fs-label); color: var(--ink-3); }

        .telemetry-panel { flex: 0 0 auto; }
        .telemetry-body { height: 210px; display: flex; padding: 2px 12px 10px; }
        .packet-log-panel { flex: 1 1 200px; min-height: 160px; }
        .event-log-panel { flex: 1 1 140px; min-height: 100px; }
        .proto-panel { flex: 0 0 auto; }

        @media (max-width: 1100px) {
          .console-root { flex-direction: column; overflow-y: auto; overflow-x: hidden; }
          .console-main { flex: 0 0 auto; }
          .console-aside { width: 100% !important; flex: 0 0 auto; }
          .aside-handle { display: none; }
          .packet-log-panel { min-height: 260px; }
          .telemetry-body { height: 180px; }
        }
        @media (max-width: 760px) {
          .console-root { padding: 8px; gap: 8px; }
        }
      `}</style>
    </div>
  );
}