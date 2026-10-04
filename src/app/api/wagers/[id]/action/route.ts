import { NextRequest, NextResponse } from "next/server";
import { requirePokerIdentity, rpcErrorMessage, unauthorized } from "@/lib/poker-server";
import { bjApply, bjDealerPlay, bjLegalActions, bjSettle } from "@/lib/poker/blackjack";
import {
  finishStakeTable,
  loadFullTable,
  publicStakeTable,
  saveFullTable,
  savePublicTable,
} from "@/lib/poker/stake-blackjack";
import { loadSession, publicSession } from "@/lib/poker/stake-flow";

export const runtime = "nodejs";

// A snake is the whole bet — double, split, and insurance don't map to a
// single-asset wager, so the stakes table plays hit/stand only.
const ACTIONS = ["hit", "stand"] as const;

// POST { action: "hit"|"stand" }: play the open hand. When the hand ends the
// dealer plays out, the table settles, and the wager resolves: winner takes
// both hatchlings, a push clears for a re-deal.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const identity = await requirePokerIdentity();
  if (!identity) return unauthorized();
  const { id } = await params;
  let body: { action?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
  const action = String(body.action ?? "");
  if (!(ACTIONS as readonly string[]).includes(action)) {
    return NextResponse.json({ error: "Illegal action." }, { status: 400 });
  }
  const token = identity.token;
  try {
    const session = await loadSession(token, id);
    if (session.wager_state !== "in_progress" || session.session_state !== "in_progress") {
      return NextResponse.json({ error: "This wager is not in progress." }, { status: 400 });
    }
    const full = await loadFullTable(token, id);
    if (!full) {
      return NextResponse.json({ error: "No open hand — deal first." }, { status: 400 });
    }
    if (!bjLegalActions(full).includes(action as "hit" | "stand")) {
      return NextResponse.json({ error: "Illegal action." }, { status: 400 });
    }
    let t = bjApply(full, action);
    if (t.phase === "dealer") {
      t = bjSettle(bjDealerPlay(t));
      const done = await finishStakeTable(token, identity.user.id, id, t);
      const fresh = await loadSession(token, id);
      return NextResponse.json({ ...done, session: publicSession(fresh) });
    }
    await saveFullTable(token, id, t);
    await savePublicTable(token, id, t);
    const fresh = await loadSession(token, id);
    return NextResponse.json({ table: publicStakeTable(t), session: publicSession(fresh) });
  } catch (err) {
    return NextResponse.json({ error: rpcErrorMessage(err) }, { status: 400 });
  }
}
