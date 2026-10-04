"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";

interface Slide {
  src: string;
  alt: string;
  caption: string;
  /** Slides whose art is a tall portrait sprite use "contain" so the
      whole figure shows on the black frame instead of an awkward crop. */
  fit?: "cover" | "contain";
}

const SLIDES: Slide[] = [
  {
    src: "/arcade/canopy-hunter/pilot-bush.webp",
    alt: "Dave, the bush pilot, leaning against his plane at sunset",
    caption: "Meet Dave — your bush pilot",
  },
  {
    src: "/arcade/canopy-hunter/canopy-banner.webp",
    alt: "Canopy Hunter expedition art",
    caption: "Hunt the night canopy",
  },
  {
    src: "/arcade/canopy-hunter/path-night.webp",
    alt: "Night trail through the jungle",
    caption: "Read the night trail",
  },
  {
    src: "/arcade/canopy-hunter/catch-backdrop.webp",
    alt: "The catch",
    caption: "Grab it before it slips away",
  },
  {
    src: "/arcade/canopy-hunter/port-river-dusk.webp",
    alt: "Lantern-lit river port at dusk",
    caption: "Trade at the river port",
  },
  {
    src: "/arcade/canopy-hunter/python.webp",
    alt: "Green tree python coiled on a branch",
    caption: "Bag wild localities",
  },
  {
    src: "/arcade/canopy-hunter/explorer-back-standing.webp",
    alt: "Gage heading into the jungle",
    caption: "Four groves. One night.",
    fit: "contain",
  },
];

const AUTOPLAY_MS = 5000;

/**
 * Canopy Hunter showcase: auto-advancing slideshow of game art with the
 * play button below the frame so no artwork (or faces) is ever covered.
 * On /arcade the button links to the Keeper; pass onPlay to fire a custom
 * action instead (e.g. opening the expedition modal from the Keeper home
 * screen).
 */
export function CanopyHunterSlideshow({ onPlay }: { onPlay?: () => void }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const timer = useRef<number | null>(null);

  const go = useCallback((dir: 1 | -1) => {
    setIndex((i) => (i + dir + SLIDES.length) % SLIDES.length);
  }, []);

  useEffect(() => {
    if (paused) return;
    if (
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }
    timer.current = window.setTimeout(() => go(1), AUTOPLAY_MS);
    return () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    };
  }, [index, paused, go]);

  const arrowClass =
    "absolute top-1/2 -translate-y-1/2 rounded-full border border-white/15 bg-black/50 p-2 text-lg leading-none text-white/80 opacity-0 backdrop-blur transition hover:bg-black/70 hover:text-white focus:opacity-100 group-hover:opacity-100";

  return (
    <div className="md:col-span-2">
      <div className="overflow-hidden rounded-2xl border border-white/[.07] bg-black">
        <div
          className="group relative aspect-[16/9] w-full"
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
        >
          {SLIDES.map((s, i) => (
            <Image
              key={s.src}
              src={s.src}
              alt={i === index ? s.alt : ""}
              aria-hidden={i === index ? undefined : true}
              fill
              sizes="(max-width: 768px) 100vw, 64rem"
              draggable={false}
              priority={i === 0}
              className={`${s.fit === "contain" ? "object-contain" : "object-cover"} transition-opacity duration-700 ${i === index ? "opacity-100" : "opacity-0"}`}
            />
          ))}
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(2,8,6,.25)_0%,transparent_35%,transparent_100%)]" />

          <button
            type="button"
            aria-label="Previous slide"
            onClick={() => go(-1)}
            className={`${arrowClass} left-3`}
          >
            <span aria-hidden="true">‹</span>
          </button>
          <button
            type="button"
            aria-label="Next slide"
            onClick={() => go(1)}
            className={`${arrowClass} right-3`}
          >
            <span aria-hidden="true">›</span>
          </button>

          <div className="absolute bottom-4 right-4 hidden gap-1.5 sm:flex">
            {SLIDES.map((s, i) => (
              <button
                key={s.src}
                type="button"
                aria-label={`Go to slide ${i + 1}: ${s.caption}`}
                onClick={() => setIndex(i)}
                className={`h-1.5 rounded-full transition-all ${
                  i === index ? "w-5 bg-emerald-200" : "w-1.5 bg-white/35 hover:bg-white/60"
                }`}
              />
            ))}
          </div>
        </div>

        <div className="flex flex-col items-center gap-1.5 border-t border-white/[.06] bg-[#030806] p-4 sm:p-5">
          <p className="text-[10px] font-bold uppercase tracking-[.16em] text-white/50">
            {SLIDES[index].caption}
          </p>
          {onPlay ? (
            <button
              type="button"
              onClick={onPlay}
              className="rounded-2xl bg-emerald-300 px-8 py-3 text-base font-bold text-[#06100c] shadow-[0_8px_30px_rgba(0,0,0,.45)] transition hover:bg-emerald-200 active:scale-[.99] sm:py-3.5"
            >
              ▶ Play Canopy Hunter
            </button>
          ) : (
            <Link
              href="/arcade/arboreal-keeper"
              className="rounded-2xl bg-emerald-300 px-8 py-3 text-base font-bold text-[#06100c] shadow-[0_8px_30px_rgba(0,0,0,.45)] transition hover:bg-emerald-200 active:scale-[.99] sm:py-3.5"
            >
              ▶ Play Canopy Hunter
            </Link>
          )}
          <p className="text-[11px] text-white/60">
            Expedition event inside Arboreal Keeper — one free flight every week
          </p>
        </div>
      </div>
    </div>
  );
}
