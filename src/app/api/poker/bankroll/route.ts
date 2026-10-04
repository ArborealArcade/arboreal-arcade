import { NextResponse } from "next/server";
import { callRpc, requirePokerIdentity, rpcErrorMessage, unauthorized, runtime as _rt } from "@/lib/poker-server";

export const runtime = "nodejs";
void _rt;

// GET: caller's lifesap bankroll (creates at 1000 on first use).
export async function GET() {
  const identity = await requirePokerIdentity();
  if (!identity) return unauthorized();
  try {
    const balance = await callRpc<number>(identity.token, "lifesap_get_bankroll", {});
    return NextResponse.json({ balance });
  } catch (err) {
    return NextResponse.json({ error: rpcErrorMessage(err) }, { status: 500 });
  }
}
