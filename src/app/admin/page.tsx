import { cookies } from "next/headers";
import { ArcadeThemeSwitch } from "@/components/ArcadeThemeSwitch";

// Owner controls for the standalone Arcade. The theme switch here and the
// matching switch in Planet's owner console flip the same flag in the
// Arcade's own arcade_settings table.
//
// Access: this deployment is Vercel-login-locked (team only). The switch
// additionally needs an Arcade JWT (ap_arcade_jwt cookie), minted by
// Planet's server for the owner — wired up when Planet embeds the Arcade.
export default async function ArcadeAdminPage() {
  const token = (await cookies()).get("ap_arcade_jwt")?.value ?? null;

  return (
    <main className="mx-auto max-w-3xl px-5 py-10">
      <p className="text-[10px] font-black uppercase tracking-[.15em] text-emerald-100/55">★ Arcade owner</p>
      <h1 className="mt-2 text-2xl font-semibold text-white/85">Arcade controls</h1>
      <section className="mt-6 rounded-3xl border border-white/[.07] bg-white/[.02] p-6">
        <h2 className="text-sm font-black uppercase tracking-[.06em] text-white/70">Seasonal theme</h2>
        <p className="mt-1 text-xs leading-5 text-white/40">
          Swaps the Arcade loading screen art. Mirrored in Planet&apos;s owner console.
        </p>
        <div className="mt-4">
          {token ? (
            <ArcadeThemeSwitch token={token} />
          ) : (
            <p className="text-xs text-white/40">Owner Arcade session required — open the Arcade from Planet.</p>
          )}
        </div>
      </section>
    </main>
  );
}
