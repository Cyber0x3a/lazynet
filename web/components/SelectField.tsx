"use client";

import { useId } from "react";
import * as RadixSelect from "@radix-ui/react-select";

export interface SelectOption {
  value: string;
  label: string;
}

function ChevronDown() {
  return (
    <svg width="9" height="6" viewBox="0 0 9 6" fill="none" aria-hidden>
      <path d="M0.5 0.5L4.5 5L8.5 0.5" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

function Check() {
  return (
    <svg width="10" height="8" viewBox="0 0 10 8" fill="none" aria-hidden>
      <path d="M1 4L3.8 6.8L9 1" stroke="var(--accent)" strokeWidth="1.4" />
    </svg>
  );
}

export function SelectField({
  value,
  onChange,
  options,
  label,
  hint,
  disabled = false,
  placeholder = "select...",
}: {
  value: string;
  onChange: (v: string) => void;
  options: SelectOption[];
  label?: string;
  hint?: string;
  disabled?: boolean;
  placeholder?: string;
}) {
  const id = useId();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {label && (
        <label htmlFor={id} className="micro">
          {label}
        </label>
      )}
      <RadixSelect.Root value={value} onValueChange={onChange} disabled={disabled}>
        <RadixSelect.Trigger
          id={id}
          aria-label={label}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
            width: "100%",
            background: "var(--surface-2)",
            border: "1px solid var(--line-strong)",
            borderRadius: "var(--radius)",
            color: "var(--ink)",
            fontFamily: "var(--font-sans)",
            fontSize: "var(--fs-body)",
            padding: "7px 10px",
            cursor: disabled ? "not-allowed" : "pointer",
            opacity: disabled ? 0.5 : 1,
            outline: "none",
            transition: "border-color 120ms",
          }}
          onMouseEnter={(e) => {
            if (!disabled) e.currentTarget.style.borderColor = "var(--ink-3)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = "var(--line-strong)";
          }}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = "var(--accent)";
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = "var(--line-strong)";
          }}
        >
          <RadixSelect.Value placeholder={placeholder} />
          <RadixSelect.Icon style={{ color: "var(--ink-3)", flexShrink: 0 }}>
            <ChevronDown />
          </RadixSelect.Icon>
        </RadixSelect.Trigger>
        <RadixSelect.Portal>
          <RadixSelect.Content
            position="popper"
            sideOffset={4}
            style={{
              background: "var(--surface-2)",
              border: "1px solid var(--line-strong)",
              borderRadius: "var(--radius)",
              boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
              zIndex: 200,
              minWidth: "var(--radix-select-trigger-width)",
              maxHeight: 280,
              overflow: "hidden",
            }}
          >
            <RadixSelect.Viewport style={{ padding: 3 }}>
              {options.map((o) => (
                <RadixSelect.Item
                  key={o.value}
                  value={o.value}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                    padding: "7px 10px",
                    fontSize: "var(--fs-body)",
                    fontFamily: "var(--font-sans)",
                    color: "var(--ink-2)",
                    borderRadius: 2,
                    cursor: "pointer",
                    outline: "none",
                    userSelect: "none",
                  }}
                  className="select-item"
                >
                  <RadixSelect.ItemText>{o.label}</RadixSelect.ItemText>
                  <RadixSelect.ItemIndicator>
                    <Check />
                  </RadixSelect.ItemIndicator>
                </RadixSelect.Item>
              ))}
            </RadixSelect.Viewport>
          </RadixSelect.Content>
        </RadixSelect.Portal>
      </RadixSelect.Root>
      {hint && (
        <span style={{ fontSize: "var(--fs-label)", color: "var(--ink-3)" }}>
          {hint}
        </span>
      )}
      <style>{`
        .select-item[data-highlighted] {
          background: var(--surface-3);
          color: var(--ink);
        }
        .select-item[data-state="checked"] {
          color: var(--ink);
        }
      `}</style>
    </div>
  );
}