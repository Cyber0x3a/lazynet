"use client";

import type { ReactNode } from "react";

const COLORS: Record<string, string> = {
  idle: "var(--ink-3)",
  active: "var(--accent)",
  ok: "var(--ok)",
  danger: "var(--danger)",
  warn: "var(--warn)",
};

export function StateTag({
  tone,
  children,
}: {
  tone: "idle" | "active" | "ok" | "danger" | "warn";
  children: ReactNode;
}) {
  return (
    <span
      className="micro"
      style={{
        color: COLORS[tone],
        letterSpacing: "0.16em",
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}
