import { NextRequest, NextResponse } from "next/server";
import { callRpc, requirePokerIdentity, rpcErrorMessage, unauthorized, runtime as _rt } from "@/lib/poker-server";

export const runtime = "nodejs";
void _rt;

// POST { roundId, amount }: top up an open Hold'em round (server-debited).
export async function POST(request: NextRequest) {
  const identity = await requirePokerIdentity();
  if (!identity) return unauthorized();
  let body: { roundId?: string; amount?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
  const roundId = String(body.roundId ?? "");
  const amount = Math.floor(Number(body.amount));
  if (!roundId || !Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
  try {
    await callRpc<boolean>(identity.token, "poker_add_rebuy", {
      p_round_id: roundId,
      p_amount: amount,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: rpcErrorMessage(err) }, { status: 400 });
  }
}
