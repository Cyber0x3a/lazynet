"use client";

import { useSessionStore } from "@/lib/session-store";
import { useSettings } from "@/lib/settings-context";
import { formatClock } from "@/lib/format";
import { Panel } from "@/components/ui";
import type { EventRow } from "@/lib/types";

const LEVEL_COLOR: Record<EventRow["level"], string> = {
  info: "var(--ink-3)",
  success: "var(--ok)",
  warn: "var(--warn)",
  error: "var(--danger)",
};

export default function EventLog() {
  const { events, agentOnline } = useSessionStore();
  const { settings } = useSettings();
  const hour12 = settings.ui.time_format === "12h";

  return (
    <Panel title="Events" pad={false} className="event-log-panel">
      <div
        role="log"
        aria-label="Agent events"
        style={{ flex: 1, overflowY: "auto", minHeight: 0, padding: "6px 0" }}
      >
        {events.length === 0 ? (
          <div
            className="micro"
            style={{
              padding: "18px 12px",
              textAlign: "center",
              color: "var(--ink-4)",
              letterSpacing: "0.14em",
            }}
          >
            {agentOnline ? "NO EVENTS YET" : "WAITING FOR AGENT"}
          </div>
        ) : (
          events.map((e, i) => (
            <div
              key={`${e.ts}-${i}`}
              className="mono"
              style={{
                display: "flex",
                gap: 10,
                padding: "3px 12px",
                fontSize: "var(--fs-label)",
                alignItems: "baseline",
                borderBottom: "1px solid var(--line-faint)",
              }}
            >
              <span style={{ color: "var(--ink-4)", flexShrink: 0 }}>
                {formatClock(e.ts, hour12)}
              </span>
              <span
                className="micro"
                style={{
                  color: LEVEL_COLOR[e.level],
                  width: 44,
                  flexShrink: 0,
                  letterSpacing: "0.1em",
                }}
              >
                {e.level.toUpperCase()}
              </span>
              <span style={{ color: "var(--ink-2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {e.message}
              </span>
            </div>
          ))
        )}
      </div>
    </Panel>
  );
}