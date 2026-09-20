"use client";

import { useId } from "react";
import { inputStyle } from "./fields";

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
        style={{ ...inputStyle, opacity: disabled ? 0.5 : 1 }}
      />
    </div>
  );
}
