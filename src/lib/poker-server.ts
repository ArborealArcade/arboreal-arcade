import { NextResponse } from "next/server";
import { getServerIdentity, SUPABASE_AUTH_KEY, SUPABASE_AUTH_URL } from "@/lib/supabase-auth";
import { duelErrorMessage } from "@/lib/poker/duel-flow";

export const runtime = "nodejs";

export type PokerIdentity = NonNullable<Awaited<ReturnType<typeof getServerIdentity>>>;

export async function requirePokerIdentity() {
  const identity = await getServerIdentity();
  if (!identity) return null;
  return identity;
}

export function unauthorized() {
  return NextResponse.json({ error: "Sign in to play with a saved bankroll." }, { status: 401 });
}

/** Call a Postgres RPC with the player's own bearer token (RLS + SECURITY DEFINER apply). */
export async function callRpc<T>(token: string, fn: string, params: Record<string, unknown>): Promise<T> {
  const response = await fetch(`${SUPABASE_AUTH_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_AUTH_KEY,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(params),
    cache: "no-store",
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`rpc:${fn}:${response.status}:${detail.slice(0, 200)}`);
  }
  return response.json() as Promise<T>;
}

export function rpcErrorMessage(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  // Surface the Postgres RAISE message without leaking internals.
  const m = msg.match(/P0001: ([^"]+)/) ?? msg.match(/rpc:[^:]+:\d+: ([^"]+)/);
  const clean = (m?.[1] ?? msg).replace(/^[A-Z_ ]+: /, "").trim();
  if (/insufficient lifesap/i.test(clean)) return "Not enough lifesap for that bet.";
  if (/no wager tokens/i.test(clean)) return "No wager tokens left this week.";
  if (/not eligible/i.test(clean)) return "That hatchling is not eligible to stake.";
  if (/already staked/i.test(clean)) return "That hatchling is already staked.";
  if (/wager not in progress/i.test(clean)) return "That wager already finished.";
  if (/paused/i.test(clean)) return "Hatchling Stakes is paused right now.";
  if (/not open in the NPC pilot/i.test(clean))
    return "That tier isn't open in the NPC pilot yet — sprout, vine and canopy only.";
  if (/42883|no function matches/i.test(clean))
    return "Staking is having a moment on our end — give it a minute and try again.";
  if (/bet out of range|rebuy out of range/i.test(clean)) return "Bet out of range for this table.";
  if (/payout out of bounds/i.test(clean)) return "Result rejected by the house.";
  const duel = duelErrorMessage(clean);
  if (duel) return duel;
  return clean.slice(0, 160) || "Something went wrong.";
}
