import { NextRequest, NextResponse } from "next/server";
import { rpc, AgentOfflineError, AgentCommandError } from "@/lib/ipc";
import { ensureAgent } from "@/lib/agent-process";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let body: { cmd?: string; params?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid JSON body" },
      { status: 400 }
    );
  }

  if (!body.cmd || typeof body.cmd !== "string") {
    return NextResponse.json(
      { ok: false, error: "missing cmd" },
      { status: 400 }
    );
  }

  try {
    const data = await rpc(body.cmd, body.params ?? {});
    return NextResponse.json({ ok: true, data });
  } catch (err) {
    if (err instanceof AgentOfflineError) {
      // try to boot the agent, then retry the command once
      const handle = await ensureAgent();
      if (handle.status === "running" || handle.status === "external") {
        await new Promise((r) => setTimeout(r, 1600)); // let sockets bind
        try {
          const data = await rpc(body.cmd, body.params ?? {});
          return NextResponse.json({ ok: true, data });
        } catch {
          return NextResponse.json(
            { ok: false, error: "agent-offline" },
            { status: 503 }
          );
        }
      }
      return NextResponse.json(
        { ok: false, error: "agent-offline" },
        { status: 503 }
      );
    }
    const message =
      err instanceof AgentCommandError ? err.message : "rpc failure";
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}
