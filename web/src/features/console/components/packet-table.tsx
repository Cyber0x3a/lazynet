"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { agentRpc } from "@/lib/agent-client";
import { useSessionStore } from "@/lib/session-store";
import { useSettings } from "@/lib/settings-context";
import { formatClock } from "@/lib/format";
import { Combobox } from "@/components/ui/combobox";
import type { PacketRow } from "@/lib/types";

const PROTO_COLOR: Record<string, string> = {
  TCP: "var(--p-tcp)",
  UDP: "var(--p-udp)",
  DNS: "var(--p-dns)",
  ICMP: "var(--p-icmp)",
  ARP: "var(--p-arp)",
  OTHER: "var(--p-other)",
};

const FILTERS = ["ALL", "TCP", "UDP", "DNS", "ICMP", "ARP", "OTHER"] as const;
const GRID = "76px 48px minmax(0,1.6fr) minmax(0,1.6fr) 48px minmax(0,2.4fr)";

export default function PacketTable() {
  const { session, agentOnline } = useSessionStore();
  const { settings } = useSettings();
  const [packets, setPackets] = useState<PacketRow[]>([]);
  const [total, setTotal] = useState(0);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("ALL");
  const [search, setSearch] = useState("");
  const [searchField, setSearchField] = useState("any");
  const [paused, setPaused] = useState(false);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const stickToBottom = useRef(true);

  const refreshMs = Math.max(500, settings.ui.refresh_ms);
  const running = session.state === "running";
  const hour12 = settings.ui.time_format === "12h";

  const load = useCallback(async () => {
    if (paused || !agentOnline) return;
    const res = await agentRpc<{ packets: PacketRow[]; total: number; dropped: number }>(
      "packets.list",
      {
        limit: 250,
        proto: filter === "ALL" ? undefined : filter,
        search: search.trim() || undefined,
        field: searchField,
      }
    );
    if (res.ok && res.data) {
      setPackets(res.data.packets);
      setTotal(res.data.total);
    }
  }, [paused, agentOnline, filter, search, searchField]);

  useEffect(() => {
    load();
    const t = setInterval(load, refreshMs);
    return () => clearInterval(t);
  }, [load, refreshMs]);

  useEffect(() => {
    const el = bodyRef.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [packets]);

  const onScroll = () => {
    const el = bodyRef.current;
    if (!el) return;
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 30;
  };

  const emptyText = running
    ? "LISTENING ON THE PATH"
    : agentOnline
      ? "NO CAPTURE. START A SESSION TO SEE TRAFFIC."
      : "AGENT OFFLINE";

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 2,
          padding: "8px calc(var(--unit) * 0.75)",
          borderBottom: "1px solid var(--line-faint)",
          flexWrap: "wrap",
        }}
      >
        {FILTERS.map((f) => {
          const active = filter === f;
          return (
            <button
              key={f}
              onClick={() => setFilter(f)}
              aria-pressed={active}
              className="micro"
              style={{
                background: active ? "var(--surface-3)" : "transparent",
                color: active ? (f === "ALL" ? "var(--ink)" : PROTO_COLOR[f]) : "var(--ink-3)",
                border: "none",
                borderRadius: "var(--radius)",
                padding: "3px 8px",
                letterSpacing: "0.12em",
              }}
            >
              {f}
            </button>
          );
        })}
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: 8 }}>
          <Combobox
            ariaLabel="Search field"
            value={searchField}
            onChange={setSearchField}
            options={[
              { value: "any", label: "anywhere" },
              { value: "src", label: "source" },
              { value: "dst", label: "destination" },
              { value: "info", label: "info" },
            ]}
          />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={
              searchField === "any" ? "filter packets..." : `filter by ${searchField}...`
            }
            aria-label="Filter packets"
            spellCheck={false}
            className="mono"
            style={{
              background: "var(--surface-2)",
              border: "1px solid var(--line-strong)",
              borderRadius: "var(--radius)",
              color: "var(--ink)",
              fontSize: "var(--fs-label)",
              padding: "3px 8px",
              width: 180,
              outline: "none",
            }}
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              aria-label="Clear filter"
              className="micro"
              style={{
                background: "transparent",
                border: "none",
                color: "var(--ink-4)",
                cursor: "pointer",
                padding: "0 2px",
                fontSize: 13,
                lineHeight: 1,
              }}
            >
              x
            </button>
          )}
        </div>
        <div style={{ flex: 1 }} />
        <span className="micro" style={{ color: "var(--ink-4)" }}>
          {total} captured
        </span>
        <button
          onClick={() => setPaused((p) => !p)}
          className="micro"
          aria-pressed={paused}
          style={{
            background: "transparent",
            color: paused ? "var(--warn)" : "var(--ink-3)",
            border: "1px solid var(--line)",
            borderRadius: "var(--radius)",
            padding: "3px 10px",
            letterSpacing: "0.12em",
          }}
        >
          {paused ? "PAUSED" : "LIVE TAIL"}
        </button>
      </div>

      <div
        className="micro mono"
        style={{
          display: "grid",
          gridTemplateColumns: GRID,
          gap: 10,
          padding: "6px calc(var(--unit) * 0.75)",
          borderBottom: "1px solid var(--line-faint)",
          color: "var(--ink-4)",
        }}
      >
        <span>time</span>
        <span>proto</span>
        <span>source</span>
        <span>destination</span>
        <span style={{ textAlign: "right" }}>len</span>
        <span>info</span>
      </div>

      <div
        ref={bodyRef}
        onScroll={onScroll}
        role="log"
        aria-label="Captured packets"
        style={{ flex: 1, overflowY: "auto", minHeight: 0 }}
      >
        {packets.length === 0 ? (
          <div
            className="micro"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              color: "var(--ink-4)",
              letterSpacing: "0.14em",
            }}
          >
            {emptyText}
          </div>
        ) : (
          packets.map((p, i) => (
            <div
              key={`${p.ts}-${i}`}
              className="mono"
              style={{
                display: "grid",
                gridTemplateColumns: GRID,
                gap: 10,
                padding: "3px calc(var(--unit) * 0.75)",
                fontSize: "var(--fs-label)",
                color: "var(--ink-2)",
                borderBottom: "1px solid var(--line-faint)",
                animation: i === packets.length - 1 ? "flash-in 600ms ease-out" : undefined,
              }}
            >
              <span style={{ color: "var(--ink-3)" }}>{formatClock(p.ts, hour12)}</span>
              <span style={{ color: PROTO_COLOR[p.proto] ?? "var(--ink-3)", fontWeight: 600 }}>
                {p.proto}
              </span>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {p.src}
              </span>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {p.dst}
              </span>
              <span className="num" style={{ textAlign: "right", color: "var(--ink-3)" }}>
                {p.len}
              </span>
              <span
                style={{
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  color: "var(--ink-3)",
                }}
              >
                {p.info}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}