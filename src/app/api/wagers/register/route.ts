import { NextRequest, NextResponse } from "next/server";
import { callRpc, requirePokerIdentity, rpcErrorMessage, unauthorized } from "@/lib/poker-server";

export const runtime = "nodejs";

const TIERS = new Set(["sprout", "vine", "canopy", "emergent", "crown"]);

type OffspringIn = { name?: string; tier?: string; traits?: Record<string, unknown> };

// POST: register a bred clutch -> server-issued canonical assets (idempotent).
// Body: { clutchFingerprint, parents?, offspring: [{ name, tier, traits? }] }
export async function POST(request: NextRequest) {
  const identity = await requirePokerIdentity();
  if (!identity) return unauthorized();
  let body: { clutchFingerprint?: string; parents?: Record<string, unknown>; offspring?: OffspringIn[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
  const fingerprint = String(body.clutchFingerprint ?? "").trim().slice(0, 200);
  const offspring = Array.isArray(body.offspring) ? body.offspring.slice(0, 40) : [];
  if (!fingerprint || offspring.length === 0) {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
  for (const o of offspring) {
    if (!TIERS.has(String(o.tier))) {
      return NextResponse.json({ error: "Each hatchling needs a valid tier." }, { status: 400 });
    }
  }
  try {
    const result = await callRpc<unknown>(identity.token, "hatchling_stakes_register_offspring", {
      p_clutch_fingerprint: fingerprint,
      p_parents: body.parents ?? {},
      p_offspring: offspring.map((o) => ({
        name: String(o.name ?? "Hatchling").slice(0, 80),
        tier: o.tier,
        traits: o.traits ?? {},
      })),
    });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: rpcErrorMessage(err) }, { status: 400 });
  }
}
