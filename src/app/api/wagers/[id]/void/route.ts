import { NextRequest, NextResponse } from "next/server";
import { callRpc, requirePokerIdentity, rpcErrorMessage, unauthorized } from "@/lib/poker-server";

export const runtime = "nodejs";

// POST { reason? }: abandon a wager before it completes. Assets unlock,
// the weekly token is refunded, no winner is chosen.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const identity = await requirePokerIdentity();
  if (!identity) return unauthorized();
  const { id } = await params;
  let body: { reason?: string };
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  try {
    await callRpc<boolean>(identity.token, "hatchling_stakes_void", {
      p_wager_id: id,
      p_reason: String(body.reason ?? "abandoned by player").slice(0, 200),
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: rpcErrorMessage(err) }, { status: 400 });
  }
}
