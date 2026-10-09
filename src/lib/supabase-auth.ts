import { createVerify } from "node:crypto";
import { cookies } from "next/headers";

// Arcade Supabase project (arboreal-arcade, zuhovlszrohwtdxqrhnx). This code must
// NEVER fall back to Planet's project — a missing env var should fail loudly
// instead of silently talking to Planet's database.
const ARCADE_SUPABASE_URL = "https://zuhovlszrohwtdxqrhnx.supabase.co";

export const SUPABASE_AUTH_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? ARCADE_SUPABASE_URL;

// Intentionally no hardcoded key fallback: the Arcade publishable key comes
// from NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (set in Vercel first thing when the
// Arcade project is created). An empty key fails loudly at request time.
export const SUPABASE_AUTH_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";

function assertSupabaseConfigured() {
  if (!SUPABASE_AUTH_KEY) {
    throw new Error(
      "Arcade Supabase is not configured: set NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY " +
        "to the Arcade Supabase project's publishable key. This app intentionally " +
        "carries no Planet credential fallback."
    );
  }
}

// ---------------------------------------------------------------------------
// Arcade identity: Planet is the identity/role source. Planet's server mints
// a short-lived ES256 Arcade JWT (ap_arcade_jwt cookie) with sub = the
// player's Planet user UUID, role = "authenticated", and user_role = the
// Planet role. The Arcade verifies the signature with the Arcade project's
// JWT secret and forwards the SAME token as the PostgREST Bearer, so
// auth.uid() and RLS resolve with no copied auth users and no shadow accounts.
// Required server-only env: ARCADE_JWT_SECRET.
// ---------------------------------------------------------------------------
export const ARCADE_JWT_COOKIE = "ap_arcade_jwt";
const ARCADE_JWT_SECRET = process.env.ARCADE_JWT_SECRET ?? "";

export type ArcadeIdentity = {
  token: string;
  user: { id: string; user_role: string | null };
};

export function verifyArcadeJwt(token: string): { sub: string; user_role: string | null } | null {
  if (!ARCADE_JWT_SECRET) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [headerB64, payloadB64, signature] = parts;

  let header: { alg?: string };
  try {
    header = JSON.parse(Buffer.from(headerB64, "base64url").toString("utf8")) as { alg?: string };
  } catch {
    return null;
  }
  // ES256 (ECC P-256) — matches the Supabase project's JWT signing key so
  // PostgREST accepts the same token for auth.uid()/RLS.
  if (header.alg !== "ES256") return null;

  let sigJose: Buffer;
  try {
    sigJose = Buffer.from(signature, "base64url");
  } catch {
    return null;
  }
  if (sigJose.length !== 64) return null;
  const sigDer = joseToDer(sigJose);

  let ok = false;
  try {
    const verifier = createVerify("SHA256");
    verifier.update(`${headerB64}.${payloadB64}`);
    ok = verifier.verify(ARCADE_JWT_SECRET, sigDer);
  } catch {
    return null;
  }
  if (!ok) return null;

  let claims: { sub?: unknown; user_role?: unknown; exp?: unknown };
  try {
    claims = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8")) as {
      sub?: unknown;
      user_role?: unknown;
      exp?: unknown;
    };
  } catch {
    return null;
  }
  if (typeof claims.sub !== "string" || !claims.sub) return null;
  if (typeof claims.exp === "number" && claims.exp * 1000 < Date.now() - 30_000) return null;
  return {
    sub: claims.sub,
    user_role: typeof claims.user_role === "string" ? claims.user_role : null,
  };
}

/** JOSE 64-byte R||S -> DER-encoded ECDSA signature. */
function joseToDer(jose: Buffer): Buffer {
  let r = jose.subarray(0, 32);
  let s = jose.subarray(32, 64);
  while (r.length > 1 && r[0] === 0x00) r = r.subarray(1);
  while (s.length > 1 && s[0] === 0x00) s = s.subarray(1);
  if (r[0] & 0x80) r = Buffer.concat([Buffer.from([0x00]), r]);
  if (s[0] & 0x80) s = Buffer.concat([Buffer.from([0x00]), s]);
  const innerLen = 2 + r.length + 2 + s.length;
  const der = Buffer.alloc(2 + innerLen);
  let o = 0;
  der[o++] = 0x30;
  der[o++] = innerLen;
  der[o++] = 0x02;
  der[o++] = r.length;
  r.copy(der, o);
  o += r.length;
  der[o++] = 0x02;
  der[o++] = s.length;
  s.copy(der, o);
  return der;
}

// First-use profile creation: the Arcade keeps a minimal profiles row per
// Planet player (id + role + directory columns). The upsert runs with the
// player's own JWT and refreshes role from the Planet-issued claim on every
// call, so Planet stays the role source of truth. Best-effort: identity must
// never fail because a profile sync hiccuped.
async function ensureArcadeProfile(token: string, userId: string, userRole: string | null) {
  try {
    assertSupabaseConfigured();
    const body: Record<string, unknown> = { id: userId };
    if (userRole) body.role = userRole;
    await fetch(`${SUPABASE_AUTH_URL}/rest/v1/profiles?on_conflict=id`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_AUTH_KEY,
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates",
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });
  } catch {
    /* best-effort */
  }
}

export async function getServerIdentity(): Promise<ArcadeIdentity | null> {
  const token = (await cookies()).get(ARCADE_JWT_COOKIE)?.value;
  if (!token) return null;
  const verified = verifyArcadeJwt(token);
  if (!verified) return null;
  await ensureArcadeProfile(token, verified.sub, verified.user_role);
  return { token, user: { id: verified.sub, user_role: verified.user_role } };
}
