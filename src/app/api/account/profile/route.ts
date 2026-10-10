import { NextResponse } from "next/server";
import { getServerIdentity } from "@/lib/supabase-auth";

// Minimal profile endpoint for the standalone Arcade.
// Returns the authenticated user's basic profile, or 401 if not signed in.
// Used by poker and other features to detect auth state.
export async function GET() {
  const identity = await getServerIdentity();
  if (!identity) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  return NextResponse.json({
    id: identity.user.id,
    user_role: identity.user.user_role,
  });
}
