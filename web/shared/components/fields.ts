import type { CSSProperties } from "react";

// Shared style for raw text/number inputs so SessionControls and others stay consistent
export const inputStyle: CSSProperties = {
  background: "var(--surface-2)",
  border: "1px solid var(--line-strong)",
  borderRadius: "var(--radius)",
  color: "var(--ink)",
  fontSize: "var(--fs-body)",
  padding: "7px 10px",
  width: "100%",
};
