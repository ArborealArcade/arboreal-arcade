import { NextRequest, NextResponse } from "next/server";
import { getServerIdentity, SUPABASE_AUTH_KEY, SUPABASE_AUTH_URL } from "@/lib/supabase-auth";

/**
 * GET /api/arcade/wallet — the signed-in keeper's token balance.
 * POST /api/arcade/wallet { delta } — atomically earn (+) or spend (-) tokens.
 * POST /api/arcade/wallet { seed } — first-sync seed; the server keeps the
 *   larger of its balance and the device balance (greatest-wins).
 *
 * The wallet follows the account, not the device: the browser keeps a fast
 * localStorage cache, but the server balance is authoritative for signed-in
 * players. Signed-out players get 401 and keep the local-only wallet.
 */

const apiHeaders = (token: string) => ({
  apikey: SUPABASE_AUTH_KEY,
  Authorization: `Bearer ${token}`,
  Accept: "application/json",
});

async function readBalance(token: string, userId: string): Promise<number | null> {
  const response = await fetch(
    `${SUPABASE_AUTH_URL}/rest/v1/arcade_wallets?user_id=eq.${encodeURIComponent(userId)}&select=balance&limit=1`,
    { headers: apiHeaders(token), cache: "no-store" },
  );
  if (!response.ok) return null;
  const rows = (await response.json().catch(() => [])) as Array<{ balance?: unknown }>;
  // No row yet means a fresh wallet at zero.
  return typeof rows[0]?.balance === "number" ? rows[0].balance : 0;
}

export async function GET() {
  const identity = await getServerIdentity();
  if (!identity) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }
  const balance = await readBalance(identity.token, identity.user.id);
  if (balance === null) {
    return NextResponse.json({ ok: false, error: "Could not load your wallet. Please try again." }, { status: 502 });
  }
  return NextResponse.json({ authenticated: true, balance });
}

function pickAmount(v: unknown): number | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  const n = Math.trunc(v);
  if (n < -1_000_000 || n > 1_000_000) return null;
  return n;
}

export async function POST(request: NextRequest) {
  const identity = await getServerIdentity();
  if (!identity) {
    return NextResponse.json({ ok: false, error: "Sign in to sync your wallet." }, { status: 401 });
  }
  const body = (await request.json().catch(() => null)) as { delta?: unknown; seed?: unknown } | null;
  const seed = pickAmount(body?.seed);
  const delta = seed === null ? pickAmount(body?.delta) : null;
  if (seed === null && delta === null) {
    return NextResponse.json({ ok: false, error: "Provide a token delta or seed amount." }, { status: 400 });
  }
  const fn = seed !== null ? "arcade_wallet_seed" : "arcade_wallet_delta";
  const arg = seed !== null ? "p_amount" : "p_delta";
  const response = await fetch(`${SUPABASE_AUTH_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_AUTH_KEY,
      Authorization: `Bearer ${identity.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ [arg]: seed !== null ? seed : delta }),
    cache: "no-store",
  });
  const data = (await response.json().catch(() => null)) as unknown;
  if (!response.ok || typeof data !== "number") {
    return NextResponse.json({ ok: false, error: "Could not update your wallet. Please try again." }, { status: 502 });
  }
  return NextResponse.json({ ok: true, balance: data });
}
