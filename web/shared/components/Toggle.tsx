"use client";

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
