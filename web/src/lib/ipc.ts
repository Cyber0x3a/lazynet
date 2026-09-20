import net from "node:net";
import crypto from "node:crypto";

const CMD_HOST = "127.0.0.1";
const CMD_PORT = Number(process.env.LAZYNET_CMD_PORT ?? 7737);
const TOKEN = process.env.LAZYNET_TOKEN ?? "lazynet-dev";
const TIMEOUT_MS = 8000;

export class AgentOfflineError extends Error {
  constructor() {
    super("agent-offline");
    this.name = "AgentOfflineError";
  }
}

export class AgentCommandError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AgentCommandError";
  }
}

export async function rpc<T = unknown>(
  cmd: string,
  params: Record<string, unknown> = {}
): Promise<T> {
  const id = crypto.randomUUID();
  const payload = JSON.stringify({ id, token: TOKEN, cmd, params }) + "\n";

  return new Promise<T>((resolve, reject) => {
    const socket = new net.Socket();
    let buffer = "";
    let settled = false;

    const fail = (err: Error) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      reject(err);
    };

    const timer = setTimeout(() => {
      fail(new AgentCommandError(`timeout waiting for ${cmd}`));
    }, TIMEOUT_MS);

    socket.once("error", () => {
      clearTimeout(timer);
      fail(new AgentOfflineError());
    });

    socket.connect(CMD_PORT, CMD_HOST, () => {
      socket.write(payload);
    });

    socket.on("data", (chunk) => {
      buffer += chunk.toString("utf8");
      const newline = buffer.indexOf("\n");
      if (newline === -1) return;
      const line = buffer.slice(0, newline);
      clearTimeout(timer);
      settled = true;
      socket.destroy();
      try {
        const msg = JSON.parse(line) as {
          ok: boolean;
          data?: unknown;
          error?: string;
        };
        if (msg.ok) {
          resolve(msg.data as T);
        } else {
          reject(new AgentCommandError(msg.error ?? "unknown agent error"));
        }
      } catch {
        reject(new AgentCommandError("malformed agent response"));
      }
    });
  });
}

export async function agentReachable(): Promise<boolean> {
  try {
    await rpc("agent.ping");
    return true;
  } catch {
    return false;
  }
}
