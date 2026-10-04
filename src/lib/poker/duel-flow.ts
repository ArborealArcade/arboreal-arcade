// Shared types and view helpers for Snake Duels (keeper-vs-keeper Hold'em).
// The database is the trusted game service: it shuffles, deals, and
// evaluates. This module only shapes the public duel state for the client.

export const DUEL_TIERS = ["sprout", "vine", "canopy"] as const;

export type PublicDuel = {
  id: string;
  state: string;
  tier: string;
  challenger: string;
  opponent: string | null;
  challenger_snake: string;
  opponent_snake: string | null;
  challenger_snake_name?: string | null;
  opponent_snake_name?: string | null;
  challenger_decided: boolean;
  opponent_decided: boolean;
  created_at: string;
  expires_at: string;
  winner: string | null;
  win_reason: string | null;
  winning_hand: string | null;
  is_challenger: boolean;
  is_opponent: boolean;
  can_accept?: boolean;
  my_hole?: string[] | null;
  my_decision?: string | null;
  my_snake?: string;
  board?: string[];
  challenger_hole?: string[] | null;
  opponent_hole?: string[] | null;
  challenger_decision?: string | null;
  opponent_decision?: string | null;
};

/** Defensive normalization: only pass through real card arrays. */
export function publicDuel(raw: unknown): PublicDuel | null {
  if (!raw || typeof raw !== "object") return null;
  const d = raw as Record<string, unknown>;
  if (typeof d.id !== "string" || typeof d.state !== "string") return null;
  const cards = (v: unknown): string[] | undefined =>
    Array.isArray(v) && v.every((c) => typeof c === "string") ? (v as string[]) : undefined;
  return {
    id: d.id,
    state: d.state,
    tier: typeof d.tier === "string" ? d.tier : "",
    challenger: typeof d.challenger === "string" ? d.challenger : "",
    opponent: typeof d.opponent === "string" ? d.opponent : null,
    challenger_snake: typeof d.challenger_snake === "string" ? d.challenger_snake : "Hatchling",
    opponent_snake: typeof d.opponent_snake === "string" ? d.opponent_snake : null,
    challenger_snake_name:
      typeof d.challenger_snake_name === "string" ? d.challenger_snake_name : null,
    opponent_snake_name:
      typeof d.opponent_snake_name === "string" ? d.opponent_snake_name : null,
    challenger_decided: d.challenger_decided === true,
    opponent_decided: d.opponent_decided === true,
    created_at: typeof d.created_at === "string" ? d.created_at : "",
    expires_at: typeof d.expires_at === "string" ? d.expires_at : "",
    winner: typeof d.winner === "string" ? d.winner : null,
    win_reason: typeof d.win_reason === "string" ? d.win_reason : null,
    winning_hand: typeof d.winning_hand === "string" ? d.winning_hand : null,
    is_challenger: d.is_challenger === true,
    is_opponent: d.is_opponent === true,
    can_accept: d.can_accept === true ? true : undefined,
    my_hole: cards(d.my_hole),
    my_decision: typeof d.my_decision === "string" ? d.my_decision : null,
    my_snake: typeof d.my_snake === "string" ? d.my_snake : undefined,
    board: cards(d.board),
    challenger_hole: cards(d.challenger_hole),
    opponent_hole: cards(d.opponent_hole),
    challenger_decision: typeof d.challenger_decision === "string" ? d.challenger_decision : null,
    opponent_decision: typeof d.opponent_decision === "string" ? d.opponent_decision : null,
  };
}

/** Friendly copy for duel errors (extends rpcErrorMessage). */
export function duelErrorMessage(clean: string): string | null {
  if (/keeper duels are paused/i.test(clean)) return "Keeper duels are paused right now.";
  if (/challenge expired/i.test(clean)) return "That challenge expired — the snake was unlocked.";
  if (/challenge not open/i.test(clean)) return "That challenge is no longer open.";
  if (/cannot accept your own challenge/i.test(clean)) return "You can't accept your own challenge.";
  if (/tier must match/i.test(clean)) return "Your snake must be in the same league as the challenge.";
  if (/tier mismatch/i.test(clean)) return "That snake isn't in this duel's league.";
  if (/snake not available/i.test(clean)) return "That snake isn't available to stake.";
  if (/snake is locked in another game/i.test(clean)) return "That snake is already locked in another game.";
  if (/no duel token available/i.test(clean)) return "You're out of duel tokens for this week.";
  if (/not your duel/i.test(clean)) return "That's not your duel.";
  if (/not your challenge/i.test(clean)) return "That's not your challenge.";
  if (/duel not in progress/i.test(clean)) return "This duel isn't in progress.";
  if (/duel not ready to settle/i.test(clean)) return "This duel isn't ready to settle yet.";
  if (/duel already started/i.test(clean)) return "This duel already started — no take-backs.";
  if (/bad decision/i.test(clean)) return "Pick run or fold.";
  return null;
}
