"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

const TIPS = [
  "Buy your housing before your snakes — every chondro needs a home.",
  "Neonates start out in the Dojo 2 Stack.",
  "Raise subadults to adults to unlock breeding.",
  "Holdbacks build your lineage.",
  "Check the Player Market for deals from other keepers.",
];

const SPORES = [
  { left: "8%", size: 5, delay: "0s", duration: "7s" },
  { left: "18%", size: 3, delay: "1.2s", duration: "9s" },
  { left: "32%", size: 6, delay: "2.4s", duration: "8s" },
  { left: "47%", size: 4, delay: ".6s", duration: "10s" },
  { left: "61%", size: 5, delay: "3.1s", duration: "7.5s" },
  { left: "74%", size: 3, delay: "1.8s", duration: "9.5s" },
  { left: "86%", size: 6, delay: ".2s", duration: "8.5s" },
  { left: "93%", size: 4, delay: "2.8s", duration: "7s" },
];

export function ArborealKeeperLoadingScreen({
  message = "Loading save file…",
}: {
  message?: string;
}) {
  const [tipIndex, setTipIndex] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTipIndex((i) => (i + 1) % TIPS.length), 3600);
    return () => clearInterval(id);
  }, []);

  return (
    <div
      className="fixed inset-0 z-[9999] grid place-items-center overflow-hidden bg-black text-white"
      role="status"
      aria-live="polite"
      aria-label={message}
    >
      <style>{`
        @keyframes keeper-glow { 0%,100% { opacity:.45; transform:scale(1);} 50% { opacity:.9; transform:scale(1.08);} }
        @keyframes keeper-shimmer { 0% { transform:translateX(-120%);} 100% { transform:translateX(320%);} }
        @keyframes keeper-spore { 0% { transform:translateY(0); opacity:0;} 15% { opacity:.7;} 100% { transform:translateY(-46vh); opacity:0;} }
        @keyframes keeper-tip { 0% { opacity:0; transform:translateY(6px);} 12%,82% { opacity:1; transform:translateY(0);} 100% { opacity:0; transform:translateY(-6px);} }
      `}</style>

      {/* rising spores */}
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        {SPORES.map((s, i) => (
          <span
            key={i}
            className="absolute bottom-[-10px] rounded-full bg-emerald-300/50"
            style={{
              left: s.left,
              width: s.size,
              height: s.size,
              animation: `keeper-spore ${s.duration} linear ${s.delay} infinite`,
            }}
          />
        ))}
      </div>

      <div className="relative flex flex-col items-center px-6">
        {/* pulsing jungle glow */}
        <div
          className="pointer-events-none absolute left-1/2 top-[38%] h-72 w-72 -translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-400/25 blur-3xl"
          style={{ animation: "keeper-glow 3.2s ease-in-out infinite" }}
          aria-hidden="true"
        />

        <div className="relative w-56 overflow-hidden rounded-[28px] border border-emerald-200/20 shadow-[0_30px_90px_rgba(0,0,0,.7)] sm:w-64">
          <Image
            src="/branding/arboreal-keeper-loader.webp"
            alt=""
            width={640}
            height={640}
            priority
            className="block h-auto w-full"
          />
        </div>

        <div className="mt-6 text-[11px] font-black uppercase tracking-[.3em] text-emerald-100/80">Arboreal Keeper</div>
        <div className="mt-2 text-sm text-white/55">{message}</div>

        {/* shimmer loading bar */}
        <div className="mt-5 h-1.5 w-48 overflow-hidden rounded-full bg-white/10" aria-hidden="true">
          <div className="h-full w-1/3 rounded-full bg-gradient-to-r from-transparent via-emerald-300 to-transparent" style={{ animation: "keeper-shimmer 1.6s linear infinite" }} />
        </div>

        {/* rotating keeper tip */}
        <div key={tipIndex} className="mt-5 max-w-[280px] text-center text-xs leading-5 text-white/40" style={{ animation: "keeper-tip 3.6s ease-in-out infinite" }}>
          <span className="font-bold uppercase tracking-[.14em] text-amber-100/50">Keeper tip · </span>
          {TIPS[tipIndex]}
        </div>
      </div>

      <span className="sr-only">{message}</span>
    </div>
  );
}
