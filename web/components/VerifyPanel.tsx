"use client";

import { useEffect, useMemo, useState } from "react";
import { agentRpc } from "@/lib/agent-client";
import { useSessionStore } from "@/lib/session-store";
import { useSettings } from "@/lib/settings-context";
import { formatClock, timeAgo } from "@/lib/format";
import { Button, useNow } from "@/components/ui";
import type { EventRow } from "@/lib/types";

interface VerifyRecord {
  ts: number;
  success: boolean;
  method: string;
  detail: string;
}

export default function VerifyPanel() {
  const { session, agentOnline, events } = useSessionStore();
  const { settings } = useSettings();
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const now = useNow(1000);

  const sessionRunning = session.state === "running";

  const history = useMemo<VerifyRecord[]>(() => {
    return events
      .filter((e) => e.kind === "session.verify")
      .slice(0, 60)
      .map((e) => ({
        ts: e.ts,
        success: e.level === "success",
        method: e.message.startsWith("passive")
          ? "passive"
          : e.message.startsWith("active")
            ? "active"
            : "auto",
        detail: e.message,
      }));
  }, [events]);

  // auto verify cadence
  useEffect(() => {
    const cadence = settings.attack.auto_verify_s;
    if (!sessionRunning || !agentOnline || cadence <= 0) return;
    const t = setInterval(() => {
      runVerify("auto", true);
    }, cadence * 1000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionRunning, agentOnline, settings.attack.auto_verify_s]);

  const runVerify = async (method: string, silent = false) => {
    if (!sessionRunning || running) return;
    setRunning(true);
    if (!silent) setResult(null);
    const res = await agentRpc<{ success: boolean; method: string; detail: string }>(
      "session.verify",
      { method }
    );
    setRunning(false);
    if (!res.ok) {
      if (!silent) setResult(res.error ?? "verify failed");
    } else if (!silent) {
      setResult(res.data!.detail);
    }
  };

  const hour12 = settings.ui.time_format === "12h";
  const last = history[0] ?? (session.last_verify
    ? {
        ts: session.last_verify.ts,
        success: session.last_verify.success,
        method: session.last_verify.method,
        detail: session.last_verify.detail,
      }
    : null);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, flex: 1, minHeight: 0 }}>
      {/* controls */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Button
          variant="primary"
          disabled={!sessionRunning || running}
          onClick={() => runVerify("auto")}
          title={sessionRunning ? "Run passive check, fall back to active probe" : "Start a session first"}
        >
          {running ? "Verifying..." : "Run verification"}
        </Button>
        <Button variant="ghost" disabled={!sessionRunning || running} onClick={() => runVerify("passive")}>
          passive
        </Button>
        <Button variant="ghost" disabled={!sessionRunning || running} onClick={() => runVerify("active")}>
          active
        </Button>
      </div>

      {/* latest result */}
      <div
        style={{
          border: "1px solid var(--line)",
          borderRadius: "var(--radius)",
          background: "var(--surface-2)",
          padding: "10px 12px",
          display: "flex",
          flexDirection: "column",
          gap: 4,
        }}
      >
        {last ? (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <span
                className="mono"
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  letterSpacing: "0.06em",
                  color: last.success ? "var(--ok)" : "var(--danger)",
                }}
              >
                {last.success ? "INTERCEPTION CONFIRMED" : "NOT INTERCEPTING"}
              </span>
              <span className="micro" style={{ color: "var(--ink-4)" }}>
                {timeAgo(last.ts, now)}
              </span>
            </div>
            <span className="mono" style={{ fontSize: "var(--fs-label)", color: "var(--ink-2)" }}>
              {last.detail}
            </span>
            <span className="micro" style={{ color: "var(--ink-4)" }}>
              method: {last.method}
            </span>
          </>
        ) : (
          <span className="micro" style={{ color: "var(--ink-4)", padding: "4px 0" }}>
            {sessionRunning ? "NO VERIFICATION RUN YET" : "START A SESSION TO VERIFY"}
          </span>
        )}
        {result && !last && (
          <span className="mono" style={{ fontSize: "var(--fs-label)", color: "var(--ink-3)" }}>
            {result}
          </span>
        )}
      </div>

      {/* history ticks */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6, minHeight: 0 }}>
        <span className="micro">history</span>
        <div
          role="img"
          aria-label={`${history.filter((h) => h.success).length} of ${history.length} checks passed`}
          style={{
            display: "flex",
            gap: 3,
            alignItems: "flex-end",
            height: 34,
            padding: "4px 0",
            borderTop: "1px solid var(--line-faint)",
            borderBottom: "1px solid var(--line-faint)",
          }}
        >
          {history.length === 0 ? (
            <span className="micro" style={{ color: "var(--ink-4)", padding: "0 2px" }}>
              empty
            </span>
          ) : (
            history
              .slice()
              .reverse()
              .map((h, i) => (
                <span
                  key={`${h.ts}-${i}`}
                  title={`${formatClock(h.ts, hour12)} ${h.method}: ${h.detail}`}
                  style={{
                    width: 7,
                    height: h.success ? 26 : 12,
                    background: h.success ? "var(--ok)" : "var(--danger)",
                    borderRadius: 1,
                    opacity: 0.9,
                    flexShrink: 0,
                  }}
                />
              ))
          )}
        </div>
        {settings.attack.auto_verify_s > 0 && sessionRunning && (
          <span className="micro" style={{ color: "var(--ink-3)" }}>
            auto every {settings.attack.auto_verify_s}s
          </span>
        )}
      </div>
    </div>
  );
}