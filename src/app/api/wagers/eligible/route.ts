import { NextResponse } from "next/server";
import { callRpc, requirePokerIdentity, rpcErrorMessage, unauthorized } from "@/lib/poker-server";

export const runtime = "nodejs";

// GET: registry animals the caller may stake (server-proven, never save fields).
export async function GET() {
  const identity = await requirePokerIdentity();
  if (!identity) return unauthorized();
  try {
    const animals = await callRpc<unknown>(identity.token, "hatchling_stakes_eligible_animals", {});
    return NextResponse.json({ animals });
  } catch (err) {
    return NextResponse.json({ error: rpcErrorMessage(err) }, { status: 500 });
  }
}
