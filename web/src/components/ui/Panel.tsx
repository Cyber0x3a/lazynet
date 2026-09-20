"use client";

import type { ReactNode } from "react";

export function Panel({
  title,
  right,
  children,
  className = "",
  pad = true,
}: {
  title?: string;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
  pad?: boolean;
}) {
  return (
    <section
      className={className}
      style={{
        background: "var(--surface-1)",
        border: "1px solid var(--line)",
        borderRadius: "var(--radius)",
        display: "flex",
        flexDirection: "column",
        minWidth: 0,
        minHeight: 0,
      }}
    >
      {title !== undefined && (
        <header
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            padding: "10px calc(var(--unit) * 0.75)",
            borderBottom: "1px solid var(--line-faint)",
          }}
        >
          <span className="micro">{title}</span>
          {right}
        </header>
      )}
      <div
        style={{
          padding: pad ? "calc(var(--unit) * 0.75)" : 0,
          flex: 1,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
        }}
      >
        {children}
      </div>
    </section>
  );
}
