import { NextRequest, NextResponse } from "next/server";
import { getServerIdentity, SUPABASE_AUTH_KEY, SUPABASE_AUTH_URL } from "@/lib/supabase-auth";

type RedeemResult = {
  ok?: boolean;
  kind?: string;
  amount?: number | null;
  value?: string | null;
  label?: string;
  error?: string;
};

/**
 * POST /api/arcade/redeem — redeem an event code for the signed-in player.
 * All validation (active window, one claim per account, claim caps) and the
 * Keeper-save reward grant happen inside the redeem_event_code RPC; arcade
 * token rewards are returned to the client, which credits the account wallet
 * (synced across devices) only after the server has recorded the claim.
 */
export async function POST(request: NextRequest) {
  const identity = await getServerIdentity();
  if (!identity) {
    return NextResponse.json({ ok: false, error: "Sign in to redeem a code." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as { code?: unknown } | null;
  const code = typeof body?.code === "string" ? body.code.trim() : "";
  if (!code || code.length > 60) {
    return NextResponse.json({ ok: false, error: "Enter a code first." }, { status: 400 });
  }

  const response = await fetch(`${SUPABASE_AUTH_URL}/rest/v1/rpc/redeem_event_code`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_AUTH_KEY,
      Authorization: `Bearer ${identity.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ p_code: code }),
    cache: "no-store",
  });

  const data = (await response.json().catch(() => null)) as RedeemResult | RedeemResult[] | null;
  if (!response.ok) {
    return NextResponse.json(
      { ok: false, error: "Could not redeem that code. Please try again." },
      { status: 502 },
    );
  }

  const result: RedeemResult = Array.isArray(data) ? (data[0] ?? {}) : (data ?? {});
  return NextResponse.json(result);
}
