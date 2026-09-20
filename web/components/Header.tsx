"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSessionStore } from "@/lib/session-store";
import { StateTag, useNow } from "@/components/ui";
import { formatDuration, timeAgo } from "@/lib/format";

const NAV = [
  { href: "/", label: "Console" },
  { href: "/settings", label: "Settings" },
];

export default function Header() {
  const pathname = usePathname();
  const { session, agentOnline, connected } = useSessionStore();
  const now = useNow(1000);

  const running = session.state === "running";
  const elapsed =
    running && session.started_at ? now - session.started_at : 0;

  return (
    <header
      style={{
        display: "flex",
        alignItems: "center",
        gap: 0,
        height: 52,
        flexShrink: 0,
        borderBottom: "1px solid var(--line)",
        background: "var(--surface-0)",
        padding: "0 16px",
      }}
    >
      {/* wordmark */}
      <Link
        href="/"
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 8,
          marginRight: 28,
        }}
      >
        <span
          style={{
            fontWeight: 700,
            fontSize: 16,
            letterSpacing: "0.02em",
            color: "var(--ink)",
          }}
        >
          Lazy<span style={{ color: "var(--accent)" }}>Net</span>
        </span>
        <span className="micro" style={{ letterSpacing: "0.18em" }}>
          Console
        </span>
      </Link>

      {/* nav tabs */}
      <nav
        aria-label="Primary"
        style={{ display: "flex", alignSelf: "stretch", gap: 2 }}
      >
        {NAV.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              style={{
                display: "flex",
                alignItems: "center",
                padding: "0 16px",
                fontSize: "var(--fs-body)",
                color: active ? "var(--ink)" : "var(--ink-3)",
                borderBottom: active
                  ? "2px solid var(--accent)"
                  : "2px solid transparent",
                fontWeight: active ? 600 : 400,
                transition: "color 120ms",
              }}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div style={{ flex: 1 }} />

      {/* session state, typographic */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 20,
          marginRight: 20,
        }}
      >
        {running ? (
          <>
            <StateTag tone="active">POISONING</StateTag>
            <span
              className="num"
              style={{ fontSize: "var(--fs-body)", color: "var(--ink-2)" }}
              title="Session elapsed"
            >
              {formatDuration(elapsed)}
            </span>
            {session.last_verify && (
              <StateTag tone={session.last_verify.success ? "ok" : "danger"}>
                {session.last_verify.success
                  ? `VERIFIED ${session.last_verify.method.toUpperCase()}`
                  : "UNVERIFIED"}
                <span
                  style={{
                    color: "var(--ink-3)",
                    letterSpacing: "0.06em",
                    textTransform: "none",
                  }}
                >
                  {timeAgo(session.last_verify.ts, now)}
                </span>
              </StateTag>
            )}
          </>
        ) : session.state === "stopping" ? (
          <StateTag tone="warn">STOPPING</StateTag>
        ) : (
          <StateTag tone="idle">IDLE</StateTag>
        )}
      </div>

      {/* agent link */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          paddingLeft: 20,
          borderLeft: "1px solid var(--line)",
          height: 28,
        }}
      >
        <span
          aria-hidden
          style={{
            width: 6,
            height: 6,
            borderRadius: 1,
            background: agentOnline ? "var(--ok)" : "var(--danger)",
          }}
        />
        <span
          className="micro"
          style={{ color: agentOnline ? "var(--ink-2)" : "var(--danger)" }}
        >
          {agentOnline ? "Agent" : "Agent offline"}
        </span>
        {!connected && (
          <span
            className="micro"
            style={{ color: "var(--warn)" }}
            title="Stream socket reconnecting with backoff"
          >
            reconnecting
          </span>
        )}
      </div>
    </header>
  );
}
