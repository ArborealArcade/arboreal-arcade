import { NextResponse } from "next/server";
import { requirePokerIdentity, callRpc, rpcErrorMessage, unauthorized } from "@/lib/poker-server";
import { publicDuel } from "@/lib/poker/duel-flow";

export const runtime = "nodejs";

type DecideResult = {
  settle_ready: boolean;
  state?: string;
};

// POST { decision: "run" | "fold" }: lock in a decision. When the duel is
// ready, the database computes the outcome and settles — the route passes no
// cards, no deck, and no winner; the DB is the trusted game service.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const identity = await requirePokerIdentity();
  if (!identity) return unauthorized();
  const { id } = await params;
  let body: { decision?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Pick run or fold." }, { status: 400 });
  }
  const decision = String(body.decision ?? "");
  if (decision !== "run" && decision !== "fold") {
    return NextResponse.json({ error: "Pick run or fold." }, { status: 400 });
  }
  try {
    const decided = await callRpc<DecideResult>(identity.token, "snake_duels_decide", {
      p_duel_id: id,
      p_decision: decision,
    });
    if (decided.settle_ready) {
      // The database runs out the board, evaluates, and moves the snakes.
      // Idempotent: a retry after a dropped response replays the recorded result.
      await callRpc(identity.token, "snake_duels_settle", { p_duel_id: id });
    }
    const state = await callRpc(identity.token, "snake_duels_state", { p_duel_id: id });
    return NextResponse.json({ duel: publicDuel(state), waiting: !decided.settle_ready });
  } catch (err) {
    return NextResponse.json({ error: rpcErrorMessage(err) }, { status: 400 });
  }
}
