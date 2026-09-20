import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const { elevateAgent } = await import("@/lib/agent-process");
  const result = await elevateAgent();
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
