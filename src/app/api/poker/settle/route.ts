import { NextRequest, NextResponse } from "next/server";
import { callRpc, requirePokerIdentity, rpcErrorMessage, unauthorized, runtime as _rt } from "@/lib/poker-server";

export const runtime = "nodejs";
void _rt;

// POST { roundId, payout, risked? }: credit the hand result. The payout is bounded
// server-side — the client cannot mint lifesap. Blackjack passes `risked`
// (total put at risk incl. doubles/splits/insurance); the server debits any
// risk beyond the opening bet before crediting.
export async function POST(request: NextRequest) {
  const identity = await requirePokerIdentity();
  if (!identity) return unauthorized();
  let body: { roundId?: string; payout?: number; risked?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
  const roundId = String(body.roundId ?? "");
  const payout = Math.floor(Number(body.payout));
  const risked = body.risked == null ? null : Math.floor(Number(body.risked));
  if (!roundId || !Number.isFinite(payout) || payout < 0) {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
  try {
    const balance = await callRpc<number>(identity.token, "poker_settle_round", {
      p_round_id: roundId,
      p_payout: payout,
      p_risked: risked,
    });
    return NextResponse.json({ balance });
  } catch (err) {
    return NextResponse.json({ error: rpcErrorMessage(err) }, { status: 400 });
  }
}
