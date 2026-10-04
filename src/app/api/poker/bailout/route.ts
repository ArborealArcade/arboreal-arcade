import { NextResponse } from "next/server";
import { callRpc, requirePokerIdentity, rpcErrorMessage, unauthorized, runtime as _rt } from "@/lib/poker-server";

export const runtime = "nodejs";
void _rt;

// POST: claim the once-daily bust-out bailout (tops a sub-100 stack to 500).
export async function POST() {
  const identity = await requirePokerIdentity();
  if (!identity) return unauthorized();
  try {
    const balance = await callRpc<number>(identity.token, "poker_claim_bailout", {});
    return NextResponse.json({ balance });
  } catch (err) {
    return NextResponse.json({ error: rpcErrorMessage(err) }, { status: 400 });
  }
}
