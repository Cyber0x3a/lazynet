"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

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

export function Toggle({
  checked,
  onChange,
  label,
  hint,
  disabled = false,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
  disabled?: boolean;
}) {
  return (
    <label
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 12,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.45 : 1,
        padding: "8px 0",
      }}
    >
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={(e) => {
          e.preventDefault();
          onChange(!checked);
        }}
        style={{
          flexShrink: 0,
          width: 34,
          height: 18,
          marginTop: 1,
          borderRadius: 2,
          border: "1px solid var(--line-strong)",
          background: checked ? "var(--accent)" : "var(--surface-3)",
          position: "relative",
          padding: 0,
          transition: "background 140ms",
        }}
      >
        <span
          style={{
            position: "absolute",
            top: 2,
            left: checked ? 18 : 2,
            width: 12,
            height: 12,
            borderRadius: 1,
            background: checked ? "var(--accent-ink)" : "var(--ink-3)",
            transition: "left 140ms",
          }}
        />
      </button>
      <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <span style={{ fontSize: "var(--fs-body)", color: "var(--ink)" }}>
          {label}
        </span>
        {hint && (
          <span style={{ fontSize: "var(--fs-label)", color: "var(--ink-3)" }}>
            {hint}
          </span>
        )}
      </span>
    </label>
  );
}

export function NumberField({
  value,
  onChange,
  label,
  hint,
  min,
  max,
  step = 1,
  unit,
  disabled = false,
}: {
  value: number;
  onChange: (v: number) => void;
  label: string;
  hint?: string;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <label htmlFor={id} className="micro">
        {label}
      </label>
      <div style={{ display: "flex", alignItems: "stretch" }}>
        <input
          id={id}
          type="number"
          value={value}
          min={min}
          max={max}
          step={step}
          disabled={disabled}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (Number.isFinite(v)) onChange(v);
          }}
          className="mono"
          style={{
            flex: 1,
            minWidth: 0,
            background: "var(--surface-2)",
            border: "1px solid var(--line-strong)",
            borderRight: unit ? "none" : undefined,
            borderRadius: unit ? "var(--radius) 0 0 var(--radius)" : "var(--radius)",
            color: "var(--ink)",
            fontSize: "var(--fs-body)",
            padding: "7px 10px",
            opacity: disabled ? 0.5 : 1,
          }}
        />
        {unit && (
          <span
            className="micro"
            style={{
              display: "flex",
              alignItems: "center",
              padding: "0 10px",
              background: "var(--surface-2)",
              border: "1px solid var(--line-strong)",
              borderRadius: "0 var(--radius) var(--radius) 0",
            }}
          >
            {unit}
          </span>
        )}
      </div>
      {hint && (
        <span style={{ fontSize: "var(--fs-label)", color: "var(--ink-3)" }}>
          {hint}
        </span>
      )}
    </div>
  );
}

export function TextField({
  value,
  onChange,
  label,
  placeholder,
  disabled = false,
  mono = true,
}: {
  value: string;
  onChange: (v: string) => void;
  label?: string;
  placeholder?: string;
  disabled?: boolean;
  mono?: boolean;
}) {
  const id = useId();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {label && (
        <label htmlFor={id} className="micro">
          {label}
        </label>
      )}
      <input
        id={id}
        type="text"
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className={mono ? "mono" : undefined}
        spellCheck={false}
        style={{
          background: "var(--surface-2)",
          border: "1px solid var(--line-strong)",
          borderRadius: "var(--radius)",
          color: "var(--ink)",
          fontSize: "var(--fs-body)",
          padding: "7px 10px",
          opacity: disabled ? 0.5 : 1,
          width: "100%",
        }}
      />
    </div>
  );
}

export function StateTag({
  tone,
  children,
}: {
  tone: "idle" | "active" | "ok" | "danger" | "warn";
  children: ReactNode;
}) {
  const colors: Record<string, string> = {
    idle: "var(--ink-3)",
    active: "var(--accent)",
    ok: "var(--ok)",
    danger: "var(--danger)",
    warn: "var(--warn)",
  };
  return (
    <span
      className="micro"
      style={{
        color: colors[tone],
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

export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now() / 1000);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now() / 1000), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

export function useElementSize<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setSize({
          width: Math.floor(entry.contentRect.width),
          height: Math.floor(entry.contentRect.height),
        });
      }
    });
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return { ref, ...size };
}
export function Segmented({
  value,
  onChange,
  options,
  disabled = false,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  disabled?: boolean;
  label?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      style={{
        display: "inline-flex",
        border: "1px solid var(--line-strong)",
        borderRadius: "var(--radius)",
        background: "var(--surface-2)",
        padding: 2,
        gap: 2,
        opacity: disabled ? 0.45 : 1,
      }}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            onClick={() => onChange(o.value)}
            className="micro"
            style={{
              background: active ? "var(--surface-3)" : "transparent",
              color: active ? "var(--accent)" : "var(--ink-3)",
              border: "none",
              borderRadius: 2,
              padding: "5px 12px",
              letterSpacing: "0.12em",
              cursor: disabled ? "not-allowed" : "pointer",
              transition: "background 120ms, color 120ms",
              fontWeight: active ? 600 : 500,
            }}
            onMouseEnter={(e) => {
              if (!active && !disabled) e.currentTarget.style.color = "var(--ink-2)";
            }}
            onMouseLeave={(e) => {
              if (!active) e.currentTarget.style.color = "var(--ink-3)";
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}