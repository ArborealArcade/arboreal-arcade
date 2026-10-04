import { createHash, randomInt } from "node:crypto";
import { callRpc } from "@/lib/poker-server";
import {
  bjApply,
  bjDealerPlay,
  bjSettle,
  createShoe,
  dealBJ,
  type BJCard,
  type BJHandState,
  type BJPhase,
  type BJResult,
  type BJTableState,
} from "@/lib/poker/blackjack";

// Hatchling Stakes plays the Den's blackjack (Canopy Blackjack engine),
// one hand per wager: your snake vs the house snake, winner takes both.
// The browser is a dumb terminal — the full table (shoe included) lives in
// the bj_state column via the RPCs below, and only the public projection
// ever reaches the client.

export const NPC_UUID = "00000000-0000-0000-0000-000000000000";

export interface StakeCard {
  rank: number;
  suit: "S" | "H" | "D" | "C";
}

/**
 * Fresh shuffled shoe + commitment for hatchling_stakes_start_session.
 * The per-hand dealing shoe is separate (dealStakeTable); this only
 * satisfies the session-start contract.
 */
export function generateShoe(): { shoe: StakeCard[]; commitment: string } {
  const suits = ["S", "H", "D", "C"] as const;
  const shoe: StakeCard[] = [];
  for (let d = 0; d < 4; d++) {
    for (const suit of suits) {
      for (let rank = 2; rank <= 14; rank++) shoe.push({ rank, suit });
    }
  }
  for (let i = shoe.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [shoe[i], shoe[j]] = [shoe[j], shoe[i]];
  }
  const commitment = createHash("sha256").update(JSON.stringify(shoe)).digest("hex");
  return { shoe, commitment };
}

/** Deal one stakes hand from a fresh shoe. Insurance doesn't map to a
 *  snake bet (there's no half-stake), so it's always declined. */
export function dealStakeTable(): BJTableState {
  let t = dealBJ(createShoe(4, Math.random), 10, Math.random);
  if (t.phase === "insurance") t = bjApply(t, "insurance-no");
  return t;
}

/** What the browser may see: no shoe, and the dealer's hole card stays
 *  hidden until the hand is done. */
export interface PublicBJTable {
  hands: BJHandState[];
  activeHand: number;
  dealer: BJCard[];
  holeHidden: boolean;
  phase: BJPhase;
  result?: BJResult[];
}

export function publicStakeTable(t: BJTableState): PublicBJTable {
  const done = t.phase === "done";
  return {
    hands: t.hands,
    activeHand: t.activeHand,
    dealer: done ? t.dealer : t.dealer.slice(0, 1),
    holeHidden: !done,
    phase: t.phase,
    result: t.result,
  };
}

export type StakeBJWinner = "player" | "house" | "push";

/** Single-hand stakes have no double/split, so exactly one result decides. */
export function stakeBJWinner(t: BJTableState): StakeBJWinner {
  const r = (t.result ?? []).find((x) => x.handIndex >= 0);
  if (!r) throw new Error("stakeBJWinner: hand is not settled");
  if (r.outcome === "blackjack" || r.outcome === "win") return "player";
  if (r.outcome === "push") return "push";
  return "house";
}

export async function loadFullTable(token: string, wagerId: string): Promise<BJTableState | null> {
  return callRpc<BJTableState | null>(token, "hatchling_stakes_bj_load", { p_wager_id: wagerId });
}

export async function saveFullTable(
  token: string,
  wagerId: string,
  t: BJTableState | null
): Promise<void> {
  await callRpc(token, "hatchling_stakes_bj_save", { p_wager_id: wagerId, p_state: t });
}

export async function savePublicTable(
  token: string,
  wagerId: string,
  t: BJTableState | null
): Promise<void> {
  await callRpc(token, "hatchling_stakes_session_set_hand", {
    p_wager_id: wagerId,
    p_hand: t ? publicStakeTable(t) : {},
  });
}

export interface FinishedStakeTable {
  table: PublicBJTable;
  result?: BJResult[];
  winner?: StakeBJWinner;
  push?: boolean;
  settled?: unknown;
}

/**
 * Finish a settled table: a push clears the table so the player can re-deal
 * (both snakes stay escrowed); otherwise the wager settles and the winner
 * takes both hatchlings.
 */
export async function finishStakeTable(
  token: string,
  userId: string,
  wagerId: string,
  t: BJTableState
): Promise<FinishedStakeTable> {
  if (t.phase !== "done" || !t.result) {
    t = bjSettle(bjDealerPlay(t));
  }
  const winner = stakeBJWinner(t);
  if (winner === "push") {
    await saveFullTable(token, wagerId, null);
    // Keep the final table visible so the player sees the push; only the
    // server-side state clears, allowing a re-deal.
    await savePublicTable(token, wagerId, t);
    return { push: true, table: publicStakeTable(t), result: t.result };
  }
  // Clear the server-side table BEFORE settling: hatchling_stakes_bj_save
  // only allows writes while the wager is in progress, and settle flips it
  // to complete — saving after settle trips the guard and leaks a raw
  // "wager not in progress" error over a result the player already earned.
  // Best-effort: on a double-submit the first request already settled, and
  // the disposable table state must not surface as an error then either.
  try {
    await saveFullTable(token, wagerId, null);
  } catch {
    /* already settled or never dealt; safe to ignore */
  }
  const settled = await callRpc(token, "hatchling_stakes_settle", {
    p_wager_id: wagerId,
    p_winner: winner === "player" ? userId : NPC_UUID,
    p_player_score: winner === "player" ? 1 : 0,
  });
  // The client receives the final table in this response, and the
  // terminal UI never reads current_hand, so no post-settle publish is
  // needed — and session_set_hand would trip the same in_progress guard.
  return { winner, settled, table: publicStakeTable(t), result: t.result };
}
