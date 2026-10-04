import { NextRequest, NextResponse } from "next/server";
import { callRpc, requirePokerIdentity, rpcErrorMessage, unauthorized, runtime as _rt } from "@/lib/poker-server";

export const runtime = "nodejs";
void _rt;

const GAMES = new Set(["holdem", "blackjack", "draw"]);

// POST { game, bet }: debit the bet server-side and open a round. Returns { roundId }.
export async function POST(request: NextRequest) {
  const identity = await requirePokerIdentity();
  if (!identity) return unauthorized();
  let body: { game?: string; bet?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
  const game = String(body.game ?? "");
  const bet = Math.floor(Number(body.bet));
  if (!GAMES.has(game) || !Number.isFinite(bet) || bet <= 0) {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
  try {
    const roundId = await callRpc<string>(identity.token, "poker_place_bet", {
      p_game: game,
      p_bet: bet,
    });
    return NextResponse.json({ roundId });
  } catch (err) {
    return NextResponse.json({ error: rpcErrorMessage(err) }, { status: 400 });
  }
}
