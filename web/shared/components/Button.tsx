"use client";

import type { CSSProperties, ReactNode } from "react";

const BTN: Record<string, CSSProperties> = {
  default: {
    background: "var(--surface-3)",
    color: "var(--ink)",
    border: "1px solid var(--line-strong)",
  },
  primary: {
    background: "var(--accent)",
    color: "var(--accent-ink)",
    border: "1px solid var(--accent)",
    fontWeight: 600,
  },
  danger: {
    background: "transparent",
    color: "var(--danger)",
    border: "1px solid var(--danger-dim)",
  },
  ghost: {
    background: "transparent",
    color: "var(--ink-2)",
    border: "1px solid transparent",
  },
};

export function Button({
  children,
  onClick,
  variant = "default",
  disabled = false,
  title,
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "default" | "primary" | "danger" | "ghost";
  disabled?: boolean;
  title?: string;
  type?: "button" | "submit";
}) {
  return (
    <button
      type={type}
      title={title}
      disabled={disabled}
      onClick={onClick}
      style={{
        ...BTN[variant],
        borderRadius: "var(--radius)",
        padding: "6px 14px",
        fontSize: "var(--fs-body)",
        fontFamily: "var(--font-sans)",
        letterSpacing: "0.01em",
        opacity: disabled ? 0.4 : 1,
        cursor: disabled ? "not-allowed" : "pointer",
        transition: "background 120ms, border-color 120ms, color 120ms",
        whiteSpace: "nowrap",
      }}
      onMouseEnter={(e) => {
        if (disabled) return;
        const el = e.currentTarget;
        if (variant === "primary") el.style.background = "var(--accent-hi)";
        if (variant === "default") el.style.borderColor = "var(--ink-3)";
        if (variant === "danger") {
          el.style.background = "var(--danger)";
          el.style.color = "#170d0b";
        }
        if (variant === "ghost") el.style.color = "var(--ink)";
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget;
        el.style.background = String(BTN[variant].background);
        el.style.color = String(BTN[variant].color);
        el.style.borderColor = String(BTN[variant].borderColor);
      }}
    >
      {children}
    </button>
  );
}
