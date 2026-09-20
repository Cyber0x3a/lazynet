"use client";

export interface RpcResult<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
  offline?: boolean;
}

export async function agentRpc<T = unknown>(
  cmd: string,
  params: Record<string, unknown> = {}
): Promise<RpcResult<T>> {
  try {
    const res = await fetch("/api/rpc", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cmd, params }),
    });
    const json = await res.json();
    if (!json.ok) {
      return {
        ok: false,
        error: json.error ?? "rpc failed",
        offline: json.error === "agent-offline",
      };
    }
    return { ok: true, data: json.data as T };
  } catch {
    return { ok: false, error: "network error", offline: true };
  }
}
