"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type {
  AgentStatus,
  EventRow,
  ForwardingState,
  MetricTick,
  SessionState,
  StreamMessage,
} from "./types";

const IDLE_SESSION: SessionState = {
  state: "idle",
  config: null,
  target: null,
  gateway: null,
  attacker: null,
  started_at: null,
  poison_bursts: 0,
  last_verify: null,
};

const TICK_CAP = 3600;
const EVENT_CAP = 120;

export interface SessionStoreValue {
  status: AgentStatus | null;
  session: SessionState;
  forwarding: ForwardingState | null;
  ticks: MetricTick[];
  latest: MetricTick | null;
  events: EventRow[];
  connected: boolean; // stream socket alive
  agentOnline: boolean;
  reconnecting: boolean; // stream down for >1.5s (debounced, avoids flicker)
}

const StoreContext = createContext<SessionStoreValue>({
  status: null,
  session: IDLE_SESSION,
  forwarding: null,
  ticks: [],
  latest: null,
  events: [],
  connected: false,
  agentOnline: false,
  reconnecting: false,
});

export function SessionStoreProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AgentStatus | null>(null);
  const [session, setSession] = useState<SessionState>(IDLE_SESSION);
  const [forwarding, setForwarding] = useState<ForwardingState | null>(null);
  const [ticks, setTicks] = useState<MetricTick[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [connected, setConnected] = useState(false);
  const [agentOnline, setAgentOnline] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const sourceRef = useRef<EventSource | null>(null);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attemptRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let disposed = false;

    // Only surface "reconnecting" if the link stays down past a short grace
    // window, so a transient blip does not flash the indicator
    const scheduleReconnectFlag = () => {
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = setTimeout(() => {
        if (!disposed) setReconnecting(true);
      }, 1500);
    };
    const clearReconnectFlag = () => {
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
      setReconnecting(false);
    };

    const connect = () => {
      if (disposed) return;
      const es = new EventSource("/api/stream");
      sourceRef.current = es;

      es.onopen = () => {
        attemptRef.current = 0;
        setConnected(true);
        clearReconnectFlag();
      };

      es.onmessage = (raw) => {
        let msg: StreamMessage | { type: "agent-offline" };
        try {
          msg = JSON.parse(raw.data);
        } catch {
          return;
        }

        if (msg.type === "agent-offline") {
          setAgentOnline(false);
          return;
        }

        setAgentOnline(true);

        if (msg.type === "hello") {
          const data = (msg as { type: "hello"; data: AgentStatus }).data;
          setStatus(data);
          setSession(data.session);
          setForwarding(data.forwarding);
        } else if (msg.type === "metrics") {
          const tick = (msg as { type: "metrics"; data: MetricTick }).data;
          setTicks((prev) => {
            const next =
              prev.length >= TICK_CAP ? prev.slice(prev.length - TICK_CAP + 1) : prev.slice();
            next.push(tick);
            return next;
          });
        } else if (msg.type === "event") {
          const event = (msg as { type: "event"; data: EventRow }).data;
          setEvents((prev) => [event, ...prev].slice(0, EVENT_CAP));
        } else if (msg.type === "session") {
          const s = (msg as { type: "session"; data: SessionState }).data;
          setSession(s);
          setStatus((prev) =>
            prev ? { ...prev, session: s } : prev
          );
        } else if ((msg as { type: string }).type === "forwarding") {
          const f = (msg as unknown as { type: "forwarding"; data: ForwardingState }).data;
          setForwarding(f);
          setStatus((prev) => (prev ? { ...prev, forwarding: f } : prev));
        }
      };

      es.onerror = () => {
        setConnected(false);
        scheduleReconnectFlag();
        es.close();
        if (disposed) return;
        const delay = Math.min(8000, 500 * 2 ** attemptRef.current);
        attemptRef.current += 1;
        retryRef.current = setTimeout(connect, delay);
      };
    };

    connect();

    return () => {
      disposed = true;
      sourceRef.current?.close();
      if (retryRef.current) clearTimeout(retryRef.current);
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    };
  }, []);

  const latest = useMemo(
    () => (ticks.length > 0 ? ticks[ticks.length - 1] : null),
    [ticks]
  );

  const value = useMemo<SessionStoreValue>(
    () => ({
      status,
      session,
      forwarding,
      ticks,
      latest,
      events,
      connected,
      agentOnline,
      reconnecting,
    }),
    [status, session, forwarding, ticks, latest, events, connected, agentOnline, reconnecting]
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useSessionStore() {
  return useContext(StoreContext);
}
