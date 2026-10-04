"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { ChondroBreederExpandedShop } from "@/components/ChondroBreederExpandedShop";
import { ChondroPlayerMarket } from "@/components/ChondroPlayerMarket";
import { consumeStockRotated, isHankScaleMuted, playHankScaleLine, setHankScaleMuted } from "@/lib/hank-scale-voice";
import { isShopMusicMuted, setShopMusicMuted, startShopMusic, stopShopMusic } from "@/lib/shop-music";

// Three blink variants of Hank's idle loop in the Verdant Vivarium shop.
// Every clip opens and closes on the same eyes-open pose, so cutting
// between them is as invisible as each clip's own loop point — the store
// never visibly repeats.
const SHOP_CLIPS = [
  "/hatchery/game/bunn-shop-loop-v4-a.mp4",
  "/hatchery/game/bunn-shop-loop-v4-b.mp4",
  "/hatchery/game/bunn-shop-loop-v4-c.mp4",
];

// Hank's Captain Spaulding costume loops — swapped in when the owner flips
// the separate Hank Costume toggle (site setting hank_costume). Silent clips:
// no audio track at all, so nothing plays over the shop voice lines.
const COSTUME_CLIPS = [
  "/hatchery/game/bunn-shop-loop-costume-a.mp4",
  "/hatchery/game/bunn-shop-loop-costume-b.mp4",
  "/hatchery/game/bunn-shop-loop-costume-c.mp4",
];

function ShopLoopVideo({ costume = false }: { costume?: boolean }) {
  const clips = costume ? COSTUME_CLIPS : SHOP_CLIPS;
  const [clip, setClip] = useState(0);
  const refs = useRef<Array<HTMLVideoElement | null>>([]);

  const advance = () => {
    const next = (clip + 1) % clips.length;
    const upcoming = refs.current[next];
    if (upcoming) {
      upcoming.currentTime = 0;
      void upcoming.play().catch(() => {});
    }
    refs.current[clip]?.pause();
    setClip(next);
  };

  return (
    <>
      {clips.map((src, i) => {
        const active = i === clip;
        return (
          <video
            key={src}
            ref={(el) => {
              refs.current[i] = el;
            }}
            autoPlay={i === 0}
            muted
            playsInline
            preload="auto"
            disablePictureInPicture
            aria-hidden={!active}
            poster={costume ? "/hatchery/game/bunn-shop-counter-costume.webp" : "/hatchery/game/bunn-shop-counter-v4.webp"}
            onEnded={active ? advance : undefined}
            className={`absolute inset-0 h-full w-full object-cover [object-position:center_35%] transition-opacity duration-150 ${
              active ? "opacity-100" : "pointer-events-none opacity-0"
            }`}
          >
            <source src={src} type="video/mp4" />
          </video>
        );
      })}
    </>
  );
}

const HANK_TIPS = [
  "Howdy! Hank here. Buy your housing before your snakes — every chondro needs a home.",
  "The Dojo 2 Stack is where the neonates start out.",
  "Raise subadults to adults to unlock breeding.",
  "Check the Player Market for deals from other keepers.",
  "Holdbacks build your lineage — don't sell your best babies.",
  "I sell snakes and snake accessories.",
];

type View = "animals" | "enclosures" | "market";

const VIEWS: Array<{ id: View; label: string; shortLabel: string; thumb: string }> = [
  { id: "animals", label: "Animals", shortLabel: "Animals", thumb: "/hatchery/game/dock/animals.webp" },
  { id: "enclosures", label: "Enclosures", shortLabel: "Enclosures", thumb: "/hatchery/game/chondro-dojo-2-stack.webp" },
  { id: "market", label: "Player Market", shortLabel: "Market", thumb: "/hatchery/game/dock/breed.webp" },
];

export function ArborealKeeperReptiShop({ navCollapsed = false, costume = false }: { navCollapsed?: boolean; costume?: boolean }) {
  const [view, setView] = useState<View>("animals");
  // Keep visited tabs mounted (hidden) instead of remounting on every tab
  // switch: remounting wiped carousel scroll position and re-ran the shop
  // loader ("Loading snake store...") on each switch. Tabs mount lazily on
  // first visit so the initial load stays light.
  const [visited, setVisited] = useState<Set<View>>(() => new Set<View>(["animals"]));
  const [tip, setTip] = useState(0);
  const [qaOpen, setQaOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [muted, setMuted] = useState(() => isHankScaleMuted());
  const [musicMuted, setMusicMuted] = useState(() => isShopMusicMuted());
  const introducedRef = useRef(false);

  // Sprite QA is a production tool — only admins ever see the button or panel.
  useEffect(() => {
    let active = true;
    void fetch("/api/hatchery/chondro-breeder/save", { cache: "no-store" })
      .then((response) => response.json().catch(() => null))
      .then((data) => {
        if (active && data && (data.role === "admin" || data.role === "owner")) setIsAdmin(true);
      })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  // Hank Scale voice line per tip index (HANK_TIPS order).
  const TIP_LINES = [3, 4, 5, 6, 7, 22];
  const VIEW_LINES: Record<View, number> = { animals: 2, enclosures: 3, market: 6 };

  useEffect(() => {
    const onMuteChange = () => setMuted(isHankScaleMuted());
    window.addEventListener("hank-scale-mute-changed", onMuteChange);
    return () => window.removeEventListener("hank-scale-mute-changed", onMuteChange);
  }, []);

  function toggleMute() {
    const next = !muted;
    setMuted(next);
    setHankScaleMuted(next);
  }

  function toggleMusicMute() {
    const next = !musicMuted;
    setMusicMuted(next);
    setShopMusicMuted(next);
  }

  // Hank's shop theme: start on mount (deferred to first gesture if autoplay
  // blocks it), fade out when leaving the shop.
  useEffect(() => {
    startShopMusic();
    return () => stopShopMusic();
  }, []);

  useEffect(() => {
    const onMusicMuteChange = () => setMusicMuted(isShopMusicMuted());
    window.addEventListener("game-music-mute-changed", onMusicMuteChange);
    return () => window.removeEventListener("game-music-mute-changed", onMusicMuteChange);
  }, []);

  function hasReturningSave(): boolean {
    try {
      const raw = window.localStorage.getItem("arboreal_chondro_breeder_v2");
      if (!raw) return false;
      const parsed = JSON.parse(raw) as { colony?: unknown };
      return Array.isArray(parsed?.colony) && parsed.colony.length > 0;
    } catch {
      return false;
    }
  }

  function handleTipClick() {
    const next = (tip + 1) % HANK_TIPS.length;
    setTip(next);
    if (!introducedRef.current) {
      introducedRef.current = true;
      // Returning keepers get the welcome-back line; new players get the intro.
      playHankScaleLine(hasReturningSave() ? 17 : 1);
    } else {
      playHankScaleLine(TIP_LINES[next]);
    }
  }

  function selectView(next: View) {
    if (next === view) return;
    setView(next);
    setVisited((prev) => {
      if (prev.has(next)) return prev;
      const copy = new Set(prev);
      copy.add(next);
      return copy;
    });
    // After a daily stock rotation, the animals tab gets the fresh-stock
    // greeting instead of the standard one — once.
    playHankScaleLine(next === "animals" && consumeStockRotated() ? 11 : VIEW_LINES[next]);
  }

  // Tips only advance when the keeper taps the tip row — no auto-scroll.

  useEffect(() => {
    if (!qaOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setQaOpen(false);
    };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [qaOpen]);

  // Height reserves header + dock space; when the dock is collapsed the store
  // stretches to use the freed room. (Desktop never collapses.)
  // Mobile scrolls vertically as one page (Hank video, pills, inventory at
  // natural height); sm+ keeps the fixed-height panel with internal carousels.
  return (
    <div className={`mx-auto flex ${navCollapsed ? "h-[calc(100dvh-66px-env(safe-area-inset-bottom))] sm:h-[calc(100dvh-72px-env(safe-area-inset-bottom))] lg:h-[calc(100dvh-170px-env(safe-area-inset-bottom))]" : "h-[calc(100dvh-164px-env(safe-area-inset-bottom))] sm:h-[calc(100dvh-170px-env(safe-area-inset-bottom))]"} w-full max-w-5xl lg:max-w-7xl flex-col overflow-y-auto overscroll-contain px-4 py-3 transition-[height] duration-300 sm:overflow-hidden sm:px-6`}>
      {/* Sprite QA — production tool, admins only, parked above the tip bar on the right */}
      {isAdmin && !qaOpen ? (
      <>
      {/* Mobile: floating top-right pill — zero layout footprint, so the store
          gets every pixel. Desktop keeps the quiet in-flow link (room to spare). */}
      <button
        type="button"
        onClick={() => setQaOpen(true)}
        className="fixed right-3 top-3 z-[80] rounded-full border border-white/10 bg-black/60 px-3 py-2 text-[10px] font-semibold text-white/40 backdrop-blur-md hover:text-white/70 sm:hidden"
      >
        Sprite QA
      </button>
      <div className="mb-1 hidden flex-none justify-end sm:flex">
        <button
          type="button"
          onClick={() => setQaOpen(true)}
          className="shrink-0 text-[10px] font-semibold text-white/30 underline decoration-white/15 underline-offset-4 hover:text-white/60"
        >
          Sprite QA
        </button>
      </div>
      </>
      ) : null}

      {/* Hank's tip — slim row above the store, tap for another tip */}
      <button
        type="button"
        onClick={handleTipClick}
        title="Ask Hank for another tip"
        className="mb-2 flex w-full flex-none items-center gap-2 rounded-2xl border border-white/[.08] bg-white/[.96] px-3 py-2 text-left shadow-[0_10px_30px_rgba(0,0,0,.35)]"
      >
        <span className="min-w-0 flex-1 text-[11px] leading-4 text-[#0a120d] sm:text-[12px] lg:text-sm lg:leading-5">
          <span className="font-semibold">Hank says:</span> {HANK_TIPS[tip]}
        </span>
        <span className="shrink-0 text-[9px] font-black uppercase tracking-[.12em] text-[#0a120d]/40">↻ tip</span>
      </button>

      {/* Hank's animated store — large on phones per owner (2026-09-26);
          as large as possible on larger screens.
          Mute tucked into the bottom-right corner. */}
      <div className="relative min-h-0 w-full h-56 flex-none overflow-hidden rounded-[24px] border border-emerald-300/12 bg-black shadow-[0_24px_70px_rgba(0,0,0,.35)] sm:h-auto sm:flex-1">
        <div className="absolute inset-0">
          <ShopLoopVideo key={costume ? "costume" : "standard"} costume={costume} />
        </div>
        <button
          type="button"
          onClick={toggleMusicMute}
          title={musicMuted ? "Unmute shop music" : "Mute shop music"}
          aria-label={musicMuted ? "Unmute shop music" : "Mute shop music"}
          className="absolute bottom-2 right-[54px] z-10 rounded-full border border-white/15 bg-black/55 px-2.5 py-1 text-[11px] text-white/80 backdrop-blur-sm hover:bg-black/75 hover:text-white"
        >
          {musicMuted ? "🔇" : "🎵"}
        </button>
        <button
          type="button"
          onClick={toggleMute}
          title={muted ? "Unmute Hank's voice" : "Mute Hank's voice"}
          aria-label={muted ? "Unmute Hank's voice" : "Mute Hank's voice"}
          className="absolute bottom-2 right-2 z-10 rounded-full border border-white/15 bg-black/55 px-2.5 py-1 text-[11px] text-white/80 backdrop-blur-sm hover:bg-black/75 hover:text-white"
        >
          {muted ? "🔇" : "🔊"}
        </button>
      </div>

      {/* View buttons — three equal pills with fully visible labels.
          On phones the pills use compact labels ("Market") and slightly
          smaller text so nothing truncates; sm+ shows the full labels. */}
      <div className="mt-2 flex flex-none items-stretch gap-1.5">
        {VIEWS.map((v) => {
          const selected = v.id === view;
          return (
            <button
              key={v.id}
              type="button"
              onClick={() => selectView(v.id)}
              aria-current={selected ? "true" : undefined}
              className={`flex min-w-0 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-full border py-1.5 pl-1 pr-2 text-[8px] font-black uppercase tracking-[.05em] transition sm:text-[9px] lg:py-2 lg:pl-1.5 lg:pr-3 lg:text-[11px] ${
                selected
                  ? "border-emerald-200/70 bg-gradient-to-b from-emerald-300 to-emerald-400 text-[#04120a] shadow-[0_0_18px_rgba(52,211,153,.45)] ring-1 ring-inset ring-white/40"
                  : "border-white/12 bg-white/[.05] text-white/60 backdrop-blur-sm hover:border-white/25 hover:bg-white/[.09] hover:text-white"
              }`}
              >
                <Image src={v.thumb} alt="" width={28} height={28} className="h-3.5 w-3.5 shrink-0 rounded-full object-cover lg:h-5 lg:w-5" />
                <span className="truncate">
                  <span className="sm:hidden">{v.shortLabel}</span>
                  <span className="hidden sm:inline">{v.label}</span>
                </span>
              </button>
            );
          })}
        </div>

      {/* Current-view inventory — on phones it renders at natural height and
          scrolls with the page; sm+ keeps the horizontal carousel filling the
          fixed panel. Tabs stay mounted once visited (inactive ones are hidden,
          not unmounted) so carousel scroll position survives tab switches and
          the shop loader only runs on first visit. */}
      <div className="mt-2 min-h-0 flex-none overflow-hidden sm:flex-1">
        <div className={view === "animals" ? "h-full" : "hidden"}>
          <ChondroBreederExpandedShop section="snakes" layout="carousel" />
        </div>
        {visited.has("enclosures") ? (
          <div className={view === "enclosures" ? "h-full" : "hidden"}>
            <ChondroBreederExpandedShop section="enclosures" layout="carousel" />
          </div>
        ) : null}
        {visited.has("market") ? (
          <div className={view === "market" ? "h-full" : "hidden"}>
            <ChondroPlayerMarket bare layout="carousel" />
          </div>
        ) : null}
      </div>

      {qaOpen && isAdmin ? (
        <div className="fixed inset-0 z-[90] flex items-end justify-center sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label="Sprite QA">
          <button type="button" aria-label="Close sprite QA" onClick={() => setQaOpen(false)} className="absolute inset-0 cursor-default bg-black/72 backdrop-blur-sm" />
          <div className="relative flex max-h-[90dvh] w-full max-w-3xl lg:max-w-5xl flex-col overflow-hidden rounded-t-[28px] border border-white/10 bg-[#071009] sm:rounded-[28px]">
            <div className="flex items-start justify-between gap-3 border-b border-white/[.06] p-4 sm:p-5">
              <div>
                <div className="text-[9px] font-black uppercase tracking-[.17em] text-violet-200/50">Production tool</div>
                <h3 className="mt-1 text-lg font-bold text-white">Sprite QA</h3>
                <p className="mt-0.5 text-xs text-white/40">Every game animal sprite slot — review and flag what needs tweaking.</p>
              </div>
              <button
                type="button"
                onClick={() => setQaOpen(false)}
                aria-label="Close"
                className="rounded-xl border border-white/10 bg-white/[.04] px-3.5 py-2 text-sm font-black text-white/70 hover:bg-white/[.08]"
              >
                ✕
              </button>
            </div>
            <div className="overflow-y-auto p-4 sm:p-5">
              <ChondroBreederExpandedShop section="qa" />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
