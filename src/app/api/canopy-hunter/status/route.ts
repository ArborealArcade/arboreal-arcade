import { NextResponse } from "next/server";
import { callRpc, requirePokerIdentity } from "@/lib/poker-server";

export const runtime = "nodejs";

// GET: account perks for the Keeper game — whether the caller is exempt
// from Canopy Hunter expedition entry limits (weekly free cooldown +
// per-trip fee), whether they may see the River Port Stop private
// playtest, whether they have unlimited snake housing spaces, and whether
// they are the owner (gates owner-only features like the Expo Hall).
// Anonymous players and lookup failures fall back to the standard model.
export async function GET() {
  const identity = await requirePokerIdentity();
  if (!identity) return NextResponse.json({ unlimited: false, unlimitedSpaces: false, isOwner: false, anonymous: true });
  const isOwner = identity.user.user_role === "owner";
  let unlimitedSpaces = false;
  try {
    unlimitedSpaces = (await callRpc<boolean>(identity.token, "keeper_has_unlimited_spaces", {})) === true;
  } catch {}
  try {
    const unlimited = await callRpc<boolean>(identity.token, "canopy_hunter_is_exempt", {});
    const portDev = await callRpc<boolean>(identity.token, "canopy_hunter_port_dev", {});
    return NextResponse.json({
      unlimited: unlimited === true,
      portDev: portDev === true,
      unlimitedSpaces,
      isOwner,
    });
  } catch {
    return NextResponse.json({ unlimited: false, portDev: false, unlimitedSpaces, isOwner });
  }
}
