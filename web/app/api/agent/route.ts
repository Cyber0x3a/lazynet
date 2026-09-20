import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const { agentInfo } = await import("@/lib/agent-process");
  const info = await agentInfo();
  return NextResponse.json(info);
}
