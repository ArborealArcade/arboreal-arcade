import { notFound } from "next/navigation";
import { getServerIdentity } from "@/lib/supabase-auth";
import { OwnerConsoleClient } from "@/components/OwnerConsoleClient";

export const metadata = {
  title: "Owner Console — Arboreal Arcade",
  robots: { index: false, follow: false },
};

// Hidden owner console: not linked from the arcade page or sitemap.
// Server-gated — only the owner's verified Arcade JWT gets in.
export default async function ArcadeOwnerPage() {
  const identity = await getServerIdentity();
  if (!identity || identity.user.user_role !== "owner") notFound();
  return <OwnerConsoleClient token={identity.token} />;
}
