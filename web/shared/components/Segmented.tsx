"use client";

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
