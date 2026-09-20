"use client";

import { useId } from "react";
import { inputStyle } from "./fields";

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
            ...inputStyle,
            flex: 1,
            minWidth: 0,
            borderRight: unit ? "none" : inputStyle.borderRight,
            borderRadius: unit ? "var(--radius) 0 0 var(--radius)" : "var(--radius)",
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
