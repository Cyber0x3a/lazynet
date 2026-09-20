import { spawn, type ChildProcess } from "child_process";
import path from "path";
import fs from "fs";
import net from "net";

const CMD_PORT = Number(process.env.LAZYNET_CMD_PORT ?? 7737);
const HOST = "127.0.0.1";

interface AgentHandle {
  child: ChildProcess | null;
  owned: boolean;
  status: "external" | "running" | "stopped" | "failed";
  error: string | null;
}

const g = globalThis as unknown as { __lazynetAgent?: AgentHandle };

function probe(): Promise<boolean> {
  return new Promise((resolve) => {
    const sock = new net.Socket();
    const done = (v: boolean) => {
      sock.destroy();
      resolve(v);
    };
    sock.setTimeout(1200);
    sock.once("connect", () => done(true));
    sock.once("timeout", () => done(false));
    sock.once("error", () => done(false));
    sock.connect(CMD_PORT, HOST);
  });
}

function findPython(repoRoot: string): string {
  const candidates = [
    path.join(repoRoot, ".venv", "Scripts", "python.exe"), // windows venv
    path.join(repoRoot, ".venv", "bin", "python"), // linux/mac venv
    "python",
  ];
  for (const c of candidates) {
    if (c === "python" || fs.existsSync(c)) return c;
  }
  return "python";
}

export async function ensureAgent(): Promise<AgentHandle> {
  if (g.__lazynetAgent && (g.__lazynetAgent.status === "running" || g.__lazynetAgent.status === "external")) {
    return g.__lazynetAgent;
  }

  // something already listening? adopt it, do not spawn a duplicate
  if (await probe()) {
    g.__lazynetAgent = { child: null, owned: false, status: "external", error: null };
    console.log("[lazynet] agent already running on " + HOST + ":" + CMD_PORT + " (adopted)");
    return g.__lazynetAgent;
  }

  const repoRoot = path.resolve(process.cwd(), "..");
  const python = findPython(repoRoot);

  const child = spawn(python, ["-m", "agent"], {
    cwd: repoRoot,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });

  const handle: AgentHandle = { child, owned: true, status: "running", error: null };
  g.__lazynetAgent = handle;

  child.stdout?.on("data", (d: Buffer) => {
    const line = d.toString().trim();
    if (line) console.log("[agent]", line.slice(0, 300));
  });
  child.stderr?.on("data", (d: Buffer) => {
    const line = d.toString().trim();
    if (line) console.log("[agent]", line.slice(0, 300));
  });
  child.on("exit", (code) => {
    handle.status = code === 0 ? "stopped" : "failed";
    handle.error = code === 0 ? null : `agent exited with code ${code}`;
    console.log(`[lazynet] agent process exited (code ${code})`);
  });
  child.on("error", (err) => {
    handle.status = "failed";
    handle.error = err.message;
    console.error("[lazynet] failed to spawn agent:", err.message);
  });

  // The Next.js process owns the agent. On shutdown: ask for a clean exit over
  // IPC first (restores ARP tables / forwarding), then tree-kill as a fallback.
  // The venv python.exe is a shim that spawns the real interpreter as a child,
  // so a plain child.kill() would orphan it: use taskkill /T on Windows.
  let stopping = false;
  const stop = () => {
    if (stopping) return;
    stopping = true;
    try {
      const sock = net.connect(CMD_PORT, HOST);
      sock.setTimeout(1200);
      sock.on("connect", () => {
        sock.write(
          JSON.stringify({
            id: "shutdown",
            token: process.env.LAZYNET_TOKEN ?? "lazynet-dev",
            cmd: "agent.shutdown",
            params: {},
          }) + "\n"
        );
        sock.end();
      });
      sock.on("error", () => {});
    } catch {
      /* agent already gone */
    }
    setTimeout(() => {
      if (child.killed) return;
      try {
        if (process.platform === "win32") {
          spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"]);
        } else {
          child.kill("SIGKILL");
        }
      } catch {
        /* already gone */
      }
    }, 2500).unref();
  };
  process.once("exit", stop);
  for (const sig of ["SIGINT", "SIGTERM"] as const) {
    process.once(sig, () => {
      stop();
      setTimeout(() => process.exit(0), 300).unref();
    });
  }

  console.log("[lazynet] spawned agent (pid " + child.pid + ", python: " + python + ")");
  return handle;
}

export async function agentInfo() {
  const handle = g.__lazynetAgent;
  const alive = await probe();
  return {
    managed: handle?.owned ?? false,
    status: alive ? (handle?.owned ? "running" : "external") : (handle?.status ?? "stopped"),
    pid: handle?.child?.pid ?? null,
    error: handle?.error ?? null,
    alive,
  };
}