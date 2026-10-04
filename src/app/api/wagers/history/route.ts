import { NextResponse } from "next/server";
import { callRpc, requirePokerIdentity, rpcErrorMessage, unauthorized } from "@/lib/poker-server";

export const runtime = "nodejs";

interface HistoryRow {
  wager_id: string;
  state: string;
  winner: string | null;
  created_at: string;
}

// GET: the caller's wager receipts, projected to the shape the client renders.
export async function GET() {
  const identity = await requirePokerIdentity();
  if (!identity) return unauthorized();
  try {
    const rows = await callRpc<HistoryRow[] | null>(identity.token, "hatchling_stakes_history", { p_limit: 20 });
    const wagers = (rows ?? []).map((r) => ({
      id: r.wager_id,
      state: r.state,
      winner: r.winner ?? null,
      created_at: r.created_at,
    }));
    return NextResponse.json({ wagers });
  } catch (err) {
    return NextResponse.json({ error: rpcErrorMessage(err) }, { status: 500 });
  }
}
