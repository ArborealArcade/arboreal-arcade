import { NextRequest, NextResponse } from "next/server";
import { callRpc, requirePokerIdentity, rpcErrorMessage, unauthorized, runtime as _rt } from "@/lib/poker-server";

export const runtime = "nodejs";
void _rt;

// POST { amount }: burn lifesap server-side for later conversion into arcade
// tokens. The server only debits; token credit happens in the arcade wallet.
export async function POST(request: NextRequest) {
  const identity = await requirePokerIdentity();
  if (!identity) return unauthorized();
  let body: { amount?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
  const amount = Math.floor(Number(body.amount));
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
  try {
    const balance = await callRpc<number>(identity.token, "poker_convert_lifesap", {
      p_amount: amount,
    });
    return NextResponse.json({ balance });
  } catch (err) {
    return NextResponse.json({ error: rpcErrorMessage(err) }, { status: 400 });
  }
}
