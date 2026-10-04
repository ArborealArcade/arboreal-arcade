import { NextResponse } from "next/server";
import { requirePokerIdentity, rpcErrorMessage, unauthorized } from "@/lib/poker-server";
import { bjDealerPlay, bjSettle } from "@/lib/poker/blackjack";
import {
  dealStakeTable,
  finishStakeTable,
  loadFullTable,
  publicStakeTable,
  saveFullTable,
  savePublicTable,
} from "@/lib/poker/stake-blackjack";
import { loadSession, publicSession } from "@/lib/poker/stake-flow";

export const runtime = "nodejs";

// POST: deal one Den-style blackjack hand for the snake wager. Idempotent —
// if a hand is already open it returns the public table instead of dealing
// over it. Naturals run out immediately.
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const identity = await requirePokerIdentity();
  if (!identity) return unauthorized();
  const { id } = await params;
  const token = identity.token;
  try {
    const session = await loadSession(token, id);
    if (session.wager_state !== "in_progress" || session.session_state !== "in_progress") {
      return NextResponse.json({ error: "This wager is not in progress." }, { status: 400 });
    }
    const existing = await loadFullTable(token, id);
    if (existing) {
      return NextResponse.json({
        table: publicStakeTable(existing),
        session: publicSession(session),
      });
    }
    let t = dealStakeTable();
    if (t.phase === "dealer") {
      // Natural on the deal: run it out and finish immediately.
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
