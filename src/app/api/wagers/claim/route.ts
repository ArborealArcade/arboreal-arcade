import { NextRequest, NextResponse } from "next/server";
import { callRpc, requirePokerIdentity, rpcErrorMessage, unauthorized } from "@/lib/poker-server";

export const runtime = "nodejs";

const TIERS = new Set(["sprout", "vine", "canopy", "emergent", "crown"]);
const LIFE_STAGES = new Set(["neonate", "juvenile", "subadult", "adult"]);

// POST: claim a snake from the player's collection into the stakes registry.
// Body: { name, tier, lifeStage, traits? } — any owned snake, any origin or life stage.
export async function POST(request: NextRequest) {
  const identity = await requirePokerIdentity();
  if (!identity) return unauthorized();
  let body: { name?: string; tier?: string; lifeStage?: string; traits?: Record<string, unknown> };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
  const name = String(body.name ?? "").trim().slice(0, 80);
  const tier = String(body.tier ?? "");
  const lifeStage = String(body.lifeStage ?? "");
  if (!name) return NextResponse.json({ error: "Give your snake a name." }, { status: 400 });
  if (!TIERS.has(tier)) return NextResponse.json({ error: "Pick a valid tier." }, { status: 400 });
  if (!LIFE_STAGES.has(lifeStage)) {
    return NextResponse.json({ error: "Pick a valid life stage." }, { status: 400 });
  }
  try {
    const result = await callRpc<unknown>(identity.token, "hatchling_stakes_claim_inventory_animal", {
      p_name: name,
      p_tier: tier,
      p_life_stage: lifeStage,
      p_traits: body.traits ?? {},
    });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: rpcErrorMessage(err) }, { status: 400 });
  }
}
