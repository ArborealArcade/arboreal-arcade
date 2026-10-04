import { NextResponse } from "next/server";
import { callRpc, requirePokerIdentity, rpcErrorMessage, unauthorized } from "@/lib/poker-server";

export const runtime = "nodejs";

// GET: the caller's two weekly wager tokens + reset countdown.
export async function GET() {
  const identity = await requirePokerIdentity();
  if (!identity) return unauthorized();
  try {
    const tokens = await callRpc<unknown>(identity.token, "hatchling_stakes_my_tokens", {});
    return NextResponse.json(tokens);
  } catch (err) {
    return NextResponse.json({ error: rpcErrorMessage(err) }, { status: 500 });
  }
}
