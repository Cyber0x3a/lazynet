"use client";

import { useSessionStore } from "@/lib/session-store";
import { useSettings } from "@/lib/settings-context";
import { agentRpc } from "@/lib/agent-client";
import { Panel, StateTag } from "@/components/ui";
import PacketTable from "@/components/PacketTable";
import ProtocolBars from "@/components/ProtocolBars";
import ReadoutRail from "@/components/ReadoutRail";
import SessionControls from "@/components/SessionControls";
import TelemetryChart from "@/components/TelemetryChart";
import TopologyDiagram from "@/components/TopologyDiagram";
import VerifyPanel from "@/components/VerifyPanel";
import EventLog from "@/components/EventLog";

function ForwardingToggle() {
  const { status, agentOnline } = useSessionStore();
  const enabled = status?.forwarding.enabled ?? false;
  const strategy = status?.forwarding.strategy ?? "";

  const toggle = async () => {
    if (!agentOnline) return;
    await agentRpc("forwarding.set", { enabled: !enabled });
  };

  return (
    <button
      onClick={toggle}
      disabled={!agentOnline}
      role="switch"
      aria-checked={enabled}
      title={strategy || "IP forwarding"}
      className="micro"
      style={{
        background: "transparent",
        border: "1px solid var(--line)",
        borderRadius: "var(--radius)",
        padding: "4px 10px",
        color: enabled ? "var(--ok)" : "var(--ink-3)",
        letterSpacing: "0.12em",
        cursor: agentOnline ? "pointer" : "not-allowed",
        opacity: agentOnline ? 1 : 0.5,
      }}
    >
      forwarding {enabled ? "on" : "off"}
    </button>
  );
}

export default function ConsolePage() {
  const { agentOnline } = useSessionStore();

  return (
    <div className="console-root">
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
                start the worker: python -m agent
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

      {/* inspector column */}
      <aside className="console-aside">
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
          width: 340px;
          flex-shrink: 0;
          display: flex;
          flex-direction: column;
          gap: 12px;
          min-height: 0;
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
          .console-aside { width: 100%; flex: 0 0 auto; }
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