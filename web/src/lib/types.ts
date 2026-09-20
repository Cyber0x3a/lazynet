export type Direction = "two-way" | "one-way";

export interface HostInfo {
  ip: string;
  mac: string;
}

export interface SessionConfig {
  target_ip: string;
  gateway_ip: string;
  direction: Direction;
  interface: string | null;
  poison_interval: number;
  verify_timeout: number;
}

export interface SessionState {
  state: "idle" | "running" | "stopping";
  config: SessionConfig | null;
  target: HostInfo | null;
  gateway: HostInfo | null;
  attacker: { ip: string; mac: string; interface: string } | null;
  started_at: number | null;
  poison_bursts: number;
  last_verify: {
    success: boolean;
    method: string;
    detail: string;
    ts: number;
  } | null;
}

export interface ProtoCounts {
  tcp: number;
  udp: number;
  dns: number;
  icmp: number;
  arp: number;
  other: number;
}

export interface MetricTick {
  ts: number;
  iface_rx_bytes: number;
  iface_tx_bytes: number;
  cap_packets: number;
  cap_bytes: number;
  proto: ProtoCounts;
  poison_bursts: number;
  session_active: boolean;
}

export interface PacketRow {
  ts: number;
  src: string;
  dst: string;
  proto: "TCP" | "UDP" | "DNS" | "ICMP" | "ARP" | "OTHER";
  len: number;
  info: string;
}

export interface EventRow {
  ts: number;
  level: "info" | "success" | "warn" | "error";
  kind: string;
  message: string;
}

export interface InterfaceInfo {
  name: string;
  display_name: string;
  ipv4: string;
  netmask: string;
  mac: string;
  is_default: boolean;
  is_usable: boolean;
}

export interface Settings {
  attack: {
    direction: Direction;
    poison_interval: number;
    verify_timeout: number;
    auto_verify_s: number;
  };
  safety: {
    skip_self_check: boolean;
    auto_forwarding: boolean;
    restore_on_stop: boolean;
  };
  interface: { preferred: string };
  telemetry: {
    retention_s: number;
    packet_log_max: number;
    event_log_max: number;
  };
  ui: {
    density: "comfortable" | "compact";
    refresh_ms: number;
    reduce_motion: boolean;
    time_format: "24h" | "12h";
  };
}

export interface ForwardingState {
  strategy: string;
  enabled: boolean;
  privileged?: boolean;
}

export interface AgentStatus {
  session: SessionState;
  forwarding: ForwardingState;
  settings_version: number;
}

export interface AgentPing {
  version: string;
  platform: string;
  python: string;
  scapy: string;
  pid: number;
  uptime_s: number;
}

export type StreamMessage =
  | { type: "hello"; data: AgentStatus }
  | { type: "metrics"; data: MetricTick }
  | { type: "event"; data: EventRow }
  | { type: "session"; data: SessionState };
