"use client";

import * as React from "react";
import * as Popover from "@radix-ui/react-popover";

export interface ComboOption {
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

// A shadcn-style combobox: a trigger button that opens a small popover list
// of options. Compact variant sized for toolbar use (packet filter scope).
export function Combobox({
  value,
  onChange,
  options,
  placeholder = "select...",
  ariaLabel,
  disabled = false,
}: {
  value: string;
  onChange: (v: string) => void;
  options: ComboOption[];
  placeholder?: string;
  ariaLabel?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const current = options.find((o) => o.value === value);

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-label={ariaLabel}
          disabled={disabled}
          className="micro"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
            background: "var(--surface-2)",
            border: "1px solid var(--line-strong)",
            borderRadius: "var(--radius)",
            color: "var(--ink-2)",
            padding: "3px 8px",
            letterSpacing: "0.1em",
            cursor: disabled ? "not-allowed" : "pointer",
            opacity: disabled ? 0.5 : 1,
            whiteSpace: "nowrap",
          }}
        >
          <span>{current ? current.label : placeholder}</span>
          <span style={{ color: "var(--ink-3)", flexShrink: 0 }}>
            <ChevronDown />
          </span>
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={4}
          style={{
            background: "var(--surface-2)",
            border: "1px solid var(--line-strong)",
            borderRadius: "var(--radius)",
            boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
            zIndex: 200,
            minWidth: 140,
            padding: 3,
          }}
        >
          {options.map((o) => {
            const active = o.value === value;
            return (
              <button
                key={o.value}
                type="button"
                onClick={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
                className="micro combo-item"
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  width: "100%",
                  textAlign: "left",
                  background: "transparent",
                  border: "none",
                  borderRadius: 2,
                  padding: "6px 8px",
                  color: active ? "var(--ink)" : "var(--ink-2)",
                  cursor: "pointer",
                  letterSpacing: "0.1em",
                }}
              >
                <span>{o.label}</span>
                {active && <Check />}
              </button>
            );
          })}
          <style>{`
            .combo-item:hover, .combo-item:focus-visible {
              background: var(--surface-3);
              outline: none;
            }
          `}</style>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
