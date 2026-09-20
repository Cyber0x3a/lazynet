# LazyNet Agent <-> Web Console IPC Contract

Transport: **TCP loopback, newline-delimited JSON (NDJSON)**. One JSON object per line, UTF-8.
No third-party IPC library. Cross-platform by construction (Windows + Linux).

- Command socket: `127.0.0.1:7737` (env override `LAZYNET_CMD_PORT`)
- Stream socket: `127.0.0.1:7738` (env override `LAZYNET_STREAM_PORT`)
- Auth token: env `LAZYNET_TOKEN`, default `lazynet-dev`. Every command request and the
  first line of every stream connection must carry the token.

## Command socket (request / response)

Request:  `{"id": "uuid", "token": "...", "cmd": "...", "params": {...}}`
Response: `{"id": "same-uuid", "ok": true, "data": {...}}` or `{"id": "...", "ok": false, "error": "message"}`

Commands:

| cmd | params | data |
|---|---|---|
| `agent.ping` | - | `{version, platform, python, scapy, pid, uptime_s}` |
| `agent.shutdown` | - | `{stopping: true}` (agent exits cleanly right after replying) |
| `agent.elevate` | - | `{elevating: true}` (agent relaunches elevated via UAC/sudo, then this instance exits so the elevated copy takes the same ports; console adopts it on reconnect) |
| `agent.status` | - | `{session: SessionState, forwarding: {strategy, enabled}, settings_version}` |
| `interfaces.list` | - | `{interfaces: [{name, display_name, ipv4, netmask, mac, is_default, is_usable}]}` |
| `session.start` | `{target_ip, gateway_ip, direction?, interface?, poison_interval?, verify_timeout?}` | `{session: SessionState}` |
| `session.stop` | - | `{stopped: true}` |
| `session.verify` | `{method?: "auto"\|"passive"\|"active", timeout?}` | `{success, method, packets_seen, detail, elapsed_ms}` |
| `forwarding.set` | `{enabled: bool}` | `{strategy, enabled}` |
| `metrics.snapshot` | `{seconds?: int}` | `{series: [MetricTick], latest: MetricTick\|null}` |
| `packets.list` | `{limit?, proto?, search?}` | `{packets: [PacketRow], total, dropped}` |
| `events.list` | `{limit?}` | `{events: [EventRow]}` |
| `config.get` | - | `{settings: Settings, version}` |
| `config.set` | `{patch: {...}}` (deep-merge) | `{settings: Settings, version}` |

### Types

```
SessionState = {
  state: "idle" | "running" | "stopping",
  config: {target_ip, gateway_ip, direction, interface, poison_interval, verify_timeout} | null,
  target: {ip, mac} | null,
  gateway: {ip, mac} | null,
  attacker: {ip, mac, interface} | null,
  started_at: number | null,        // unix seconds
  poison_bursts: number,
  last_verify: {success, method, detail, ts} | null
}

MetricTick = {                       // one entry per second, deltas within that second
  ts: number,
  iface_rx_bytes: number,            // whole-machine NIC throughput (always collected)
  iface_tx_bytes: number,
  cap_packets: number,               // sniffed packets matching the session (0 when idle)
  cap_bytes: number,
  proto: {tcp, udp, dns, icmp, arp, other},   // packet counts within this second
  poison_bursts: number,             // forged ARP replies observed on the wire
  session_active: bool
}

PacketRow = {ts, src, dst, proto: "TCP"|"UDP"|"DNS"|"ICMP"|"ARP"|"OTHER", len, info}
EventRow  = {ts, level: "info"|"success"|"warn"|"error", kind, message}

Settings = {
  attack:    {direction: "two-way"|"one-way", poison_interval: 1.5, verify_timeout: 5.0, auto_verify_s: 0},
  safety:    {skip_self_check: false, auto_forwarding: true, restore_on_stop: true},
  interface: {preferred: ""},
  telemetry: {retention_s: 3600, packet_log_max: 500, event_log_max: 300},
  ui:        {density: "comfortable"|"compact", refresh_ms: 1000, reduce_motion: false, time_format: "24h"}
}
```

## Stream socket (server -> client push)

Client connects, sends one line `{"token": "..."}`. Server replies
`{"type": "hello", "data": {status: <agent.status data>}}`, then pushes:

- `{"type": "metrics", "data": MetricTick}` every 1 second
- `{"type": "event", "data": EventRow}` on each event
- `{"type": "session", "data": SessionState}` on every session state change
- `{"type": "forwarding", "data": {strategy, enabled}}` on every IP forwarding state change

The agent enables IP forwarding at startup when `settings.safety.auto_forwarding`
is true (the default), and re-enables it after a session stops (the engine's own
stop() disables it). It never disables forwarding on shutdown if it did not enable
it itself. `forwarding.set` broadcasts the new state to all stream subscribers.

Poison bursts are counted by the sniffer: ARP replies (op=2) whose `hwsrc` is our own
interface MAC. While a session runs, the agent sniffs traffic related to the target and
gateway IPs plus ARP, classifies protocols (DNS = UDP/TCP port 53), and keeps:

- a per-second metric ring buffer (`telemetry.retention_s` entries)
- a bounded packet log (`telemetry.packet_log_max`)
- a bounded event log (`telemetry.event_log_max`)

Settings persist to `~/.lazynet/settings.json` (created on first write).
Only one `session.verify` may run at a time; concurrent calls get `ok:false`.
