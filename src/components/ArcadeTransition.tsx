"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const SPLASH_SRC = "/branding/arboreal-arcade-splash.webp";
const HALLOWEEN_SPLASH_SRC = "/arcade/arboreal-arcade-halloween-loading.png";

export function ArcadeTransition({ destination }: { destination: "/arcade" | "/arcade/chondro-breeder" }) {
  const router = useRouter();
  const [halloween, setHalloween] = useState(false);

  useEffect(() => {
    router.prefetch(destination);
    const timer = window.setTimeout(() => router.replace(destination), 3000);
    return () => window.clearTimeout(timer);
  }, [destination, router]);

  // Halloween edition: the owner's 🎃 Halloween button (site setting
  // shop_theme) swaps the loading screen art. Fetched once on mount; any
  // failure keeps the standard splash. Separate from Hank's costume toggle.
  useEffect(() => {
    let active = true;
    void fetch("/api/site-settings?key=shop_theme", { cache: "no-store" })
      .then((response) => response.json().catch(() => null))
      .then((data) => {
        if (active && data && data.value === "halloween") setHalloween(true);
      })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  return (
    <main className="fixed inset-0 z-[100] grid place-items-center overflow-hidden bg-[#020a07] p-3" aria-label="Loading Arboreal Arcade">
      <div className="relative h-full w-full max-w-[560px] overflow-hidden rounded-[28px] border border-emerald-200/15 bg-black shadow-[0_0_100px_rgba(16,185,129,.12)]">
        <Image src={halloween ? HALLOWEEN_SPLASH_SRC : SPLASH_SRC} alt="Arboreal Planet Arboreal Arcade" fill sizes="(max-width: 600px) 100vw, 560px" className="object-contain" priority />
        <div className="absolute inset-x-7 bottom-6 h-1 overflow-hidden rounded-full bg-white/10">
          <div className="arcade-load-progress h-full origin-left rounded-full bg-emerald-200" />
        </div>
      </div>
    </main>
  );
}
