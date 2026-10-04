import { callRpc } from "@/lib/poker-server";

export const NPC_UUID = "00000000-0000-0000-0000-000000000000";

export interface SessionPublic {
  wager_id: string;
  wager_state: string;
  session_state: string;
  player_score: number;
  target_score: number;
  hands_played: number;
  base_bet: number;
  winner: string | null;
  npc_name: string | null;
  player_asset_name: string | null;
  tier: string | null;
  current_hand: Record<string, unknown>;
}

export async function loadSession(token: string, id: string): Promise<SessionPublic> {
  return callRpc<SessionPublic>(token, "hatchling_stakes_session_public", { p_wager_id: id });
}

/**
 * The server only ever stores the public table projection in current_hand
 * (the shoe and the dealer's hole card live in bj_state and never leave the
 * API route). A fresh session row defaults current_hand to '{}', so the job
 * here is renaming a real table for the client while treating anything else
 * (the empty default, a partial write) as no open hand. The client must
 * never try to render a non-table as a table — that crashes the page.
 */
export function publicSession(session: SessionPublic) {
  const { current_hand, ...rest } = session;
  const ch = (current_hand ?? null) as Record<string, unknown> | null;
  const open_hand =
    ch && Array.isArray(ch.hands) && Array.isArray(ch.dealer) ? ch : null;
  return {
    ...rest,
    current_hand: undefined,
    open_hand,
  };
}
