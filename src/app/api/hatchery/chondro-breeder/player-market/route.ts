import { NextRequest, NextResponse } from "next/server";
import { getServerIdentity, SUPABASE_AUTH_KEY, SUPABASE_AUTH_URL } from "@/lib/supabase-auth";

const headers = (token: string) => ({ apikey: SUPABASE_AUTH_KEY, Authorization: `Bearer ${token}`, "Content-Type": "application/json" });

async function runMarketSettlement(token: string) {
  const response = await fetch(`${SUPABASE_AUTH_URL}/rest/v1/rpc/settle_chondro_market_cycle`, {
    method: "POST",
    headers: headers(token),
    body: "{}",
    cache: "no-store",
  });
  if (!response.ok) return null;
  return response.json() as Promise<{
    clearedCount?: number;
    petSales?: number;
    conservationAcquisitions?: number;
    sellerPayoutTotal?: number;
    payoutRate?: number;
  }>;
}

export async function GET() {
  const identity = await getServerIdentity();
  if (!identity) return NextResponse.json({ authenticated: false, listings: [], pendingProceeds: 0, pendingSaleCount: 0 }, { status: 401 });

  // Settlement is idempotent. Any market visit can clear listings that have reached
  // the 48-hour fallback window, so the system does not depend on a separate cron job.
  const settlement = await runMarketSettlement(identity.token);

  const [marketResponse, proceedsResponse] = await Promise.all([
    fetch(`${SUPABASE_AUTH_URL}/rest/v1/chondro_player_market?status=eq.active&select=id,snake_id,seller_id,snake,price,listed_at&order=listed_at.desc&limit=60`, {
      headers: headers(identity.token),
      cache: "no-store",
    }),
    fetch(`${SUPABASE_AUTH_URL}/rest/v1/chondro_player_market?seller_id=eq.${encodeURIComponent(identity.user.id)}&status=eq.sold&payout_claimed_at=is.null&select=price,sale_channel,original_price`, {
      headers: headers(identity.token),
      cache: "no-store",
    }),
  ]);

  if (!marketResponse.ok) return NextResponse.json({ error: "Unable to load the player market." }, { status: 502 });

  const listings = (await marketResponse.json()) as Array<Record<string, unknown> & { seller_id?: string }>;
  const proceedsRows = proceedsResponse.ok
    ? await proceedsResponse.json() as Array<{ price?: number; sale_channel?: string | null; original_price?: number | null }>
    : [];
  const pendingProceeds = proceedsRows.reduce((sum, row) => sum + Math.max(0, Number(row.price ?? 0)), 0);
  const fallbackSaleCount = proceedsRows.filter((row) => row.sale_channel === "npc_pet" || row.sale_channel === "conservation").length;
  const conservationSaleCount = proceedsRows.filter((row) => row.sale_channel === "conservation").length;

  return NextResponse.json({
    authenticated: true,
    pendingProceeds,
    pendingSaleCount: proceedsRows.length,
    fallbackSaleCount,
    conservationSaleCount,
    settlement,
    listings: listings.map((listing) => ({
      ...listing,
      isMine: listing.seller_id === identity.user.id,
    })),
  });
}

export async function POST(request: NextRequest) {
  const identity = await getServerIdentity();
  if (!identity) return NextResponse.json({ error: "Sign in to use the player market." }, { status: 401 });
  const body = await request.json() as { action?: string; snakeId?: string; price?: number; listingId?: string; clutch?: unknown; holdbackIds?: string[]; saleItems?: unknown[] };
  const action = body.action === "list"
    ? "list_chondro_snake_for_player_market"
    : body.action === "buy"
      ? "buy_chondro_player_market_listing"
      : body.action === "reclaim"
        ? "reclaim_chondro_player_market_listing"
        : body.action === "list-clutch"
          ? "list_chondro_clutch_for_player_market"
          : body.action === "claim-proceeds"
            ? "claim_chondro_market_proceeds"
            : null;
  if (!action) return NextResponse.json({ error: "Unsupported market action." }, { status: 400 });

  const payload = action === "list_chondro_snake_for_player_market"
    ? { p_snake_id: String(body.snakeId ?? "").slice(0, 160), p_price: Math.round(Number(body.price ?? 0)) }
    : action === "buy_chondro_player_market_listing" || action === "reclaim_chondro_player_market_listing"
      ? { p_listing_id: String(body.listingId ?? "") }
      : action === "claim_chondro_market_proceeds"
        ? {}
        : {
            p_clutch: body.clutch,
            p_holdback_ids: Array.isArray(body.holdbackIds) ? body.holdbackIds.map(id => String(id).slice(0, 160)) : [],
            p_sale_items: Array.isArray(body.saleItems) ? body.saleItems : [],
          };
  const response = await fetch(`${SUPABASE_AUTH_URL}/rest/v1/rpc/${action}`, { method: "POST", headers: headers(identity.token), body: JSON.stringify(payload), cache: "no-store" });
  if (!response.ok) { const message = await response.text(); const match = message.match(/"message":"([^"]+)/); return NextResponse.json({ error: match?.[1] ?? "The market changed before this action completed." }, { status: response.status === 400 ? 409 : 502 }); }
  return NextResponse.json({ ok: true, result: await response.json() });
}
