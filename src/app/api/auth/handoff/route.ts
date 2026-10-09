import { NextRequest, NextResponse } from "next/server";
import { verifyArcadeJwt, ARCADE_JWT_COOKIE } from "@/lib/supabase-auth";

// Planet → Arcade login handoff. Planet redirects a signed-in player here with
// a short-lived Arcade JWT (?token=...&next=/arcade/...). We verify the token,
// set the ap_arcade_jwt cookie (httpOnly), and redirect to `next` — clearing
// the token from the URL. Without a valid token the player still lands on
// `next`, just anonymously.
function safeNext(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/arcade";
  return raw;
}

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token") ?? "";
  const next = safeNext(request.nextUrl.searchParams.get("next"));
  const verified = verifyArcadeJwt(token);
  const response = NextResponse.redirect(new URL(next, request.url));
  if (verified) {
    response.cookies.set(ARCADE_JWT_COOKIE, token, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7, // 7 days; the JWT's own exp is the real bound
    });
  }
  return response;
}
