"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

import { isHankScaleMuted } from "@/lib/hank-scale-voice";

// Hank's spoken closer over the final welcome scene — he signs off on the
// whole unboxing sequence. Plays once per cinematic view, honoring the
// persisted Hank voice mute; a started line plays out over the handoff into
// the game rather than cutting off mid-chuckle.
const INTRO_CLOSING_LINE_SRC = "/cutscene/intro-closing-line.mp3";

type KenBurns = "push" | "drift" | "package" | "rise";

type CinematicScene = {
  id: string;
  src: string;
  alt: string;
  /** Auto-advance after this long. Omit on the final scene — it waits for the CTA. */
  durationMs?: number;
  kb: KenBurns;
  eyebrow?: string;
  body?: string;
  counter?: boolean;
  cta?: boolean;
};

const CREDIT = 30000;

function subscribeReducedMotion(onChange: () => void) {
  const query = window.matchMedia("(prefers-reduced-motion: reduce)");
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

// Reads the OS reduced-motion preference without an effect (and therefore
// without a synchronous setState): server snapshot matches the old
// useState(false) initial value, and it even follows live OS setting changes.
function useReducedMotion() {
  return useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => false,
  );
}

/**
 * The "$30,000 win" intro cinematic: staged stills + CSS Ken Burns, stitched
 * with gold-flash cross-dissolves, HTML overlay copy (never baked into art).
 * Silent until the final scene, where Hank delivers one spoken closing line.
 * Reduced-motion clients get static stills with manual advance and no timers.
 */
const SCENES: CinematicScene[] = [
  {
    id: "living-room",
    src: "/cutscene/01-living-room.webp",
    alt: "A cozy living room at night. On the retro TV, Hank Scale pitches the Chondro Dojo; a sealed Chondro Dojo package waits on the coffee table.",
    durationMs: 7000,
    kb: "push",
    eyebrow: "Arboreal Keeper",
    body: "It started like every great story does… on television.",
  },
  {
    id: "package",
    src: "/cutscene/01-living-room.webp",
    alt: "The camera drifts from the TV down to the sealed Chondro Dojo package on the coffee table.",
    durationMs: 6500,
    kb: "package",
  },
  {
    id: "sealed-box",
    src: "/cutscene/02-sealed-box.webp",
    alt: "Close-up of the sealed matte-black Chondro Dojo box, its gold snake seal glinting.",
    durationMs: 6000,
    kb: "push",
  },
  {
    id: "the-reach",
    src: "/cutscene/03-the-reach.webp",
    alt: "First-person view: your hands crack the gold wax seal on the Chondro Dojo box.",
    durationMs: 6000,
    kb: "push",
    body: "Then… you open it.",
  },
  {
    id: "unboxing",
    src: "/cutscene/04-unboxing.webp",
    alt: "The open box reveals the Chondro Dojo — a clear tub with a black PVC perch frame, substrate and water dish — with a glowing envelope resting on top.",
    durationMs: 8000,
    kb: "drift",
    body: "Inside: your Chondro Dojo. And on top… an envelope.",
  },
  {
    id: "golden-ticket",
    src: "/cutscene/05-golden-ticket.webp",
    alt: "The envelope opens by itself and a glowing golden ticket rises, wreathed in light.",
    durationMs: 10000,
    kb: "rise",
    eyebrow: "The golden ticket",
    body: "in credit at Hank Scale\u2019s Reptiles. Yours. Right now.",
    counter: true,
  },
  {
    id: "welcome",
    src: "/cutscene/06-welcome-hank.webp",
    alt: "Hank Scale tips his hat beside your empty Chondro Dojo, ready for its first snake.",
    kb: "drift",
    eyebrow: "Arboreal Keeper",
    body: "Welcome to the game. Your $30,000 credit is loaded.",
    cta: true,
  },
];

export default function IntroCinematic({ onDone }: { onDone: () => void }) {
  const [index, setIndex] = useState(0);
  const [flashing, setFlashing] = useState(false);
  const [count, setCount] = useState(0);
  const reducedMotion = useReducedMotion();
  const busyRef = useRef(false);
  const timersRef = useRef<number[]>([]);
  const closingAudioRef = useRef<HTMLAudioElement | null>(null);

  const scene = SCENES[index];
  const isLast = index === SCENES.length - 1;

  const clearTimers = useCallback(() => {
    timersRef.current.forEach((timer) => window.clearTimeout(timer));
    timersRef.current = [];
  }, []);

  // Reduced-motion preference is read via useSyncExternalStore above (no
  // effect needed); this mount effect only preloads the stills.
  useEffect(() => {
    // Preload every still so scenes never pop in blank mid-playback.
    SCENES.forEach((entry) => {
      const img = new Image();
      img.src = entry.src;
    });
    return () => {
      timersRef.current.forEach((timer) => window.clearTimeout(timer));
      timersRef.current = [];
    };
  }, []);

  const advance = useCallback(() => {
    if (busyRef.current) return;
    busyRef.current = true;
    clearTimers();
    const swap = () => {
      setIndex((value) => Math.min(value + 1, SCENES.length - 1));
      const timer = window.setTimeout(() => {
        setFlashing(false);
        busyRef.current = false;
      }, 450);
      timersRef.current.push(timer);
    };
    if (reducedMotion) {
      // Reduced motion: instant cut, no flash, no timers.
      swap();
      return;
    }
    setFlashing(true);
    const timer = window.setTimeout(swap, 330);
    timersRef.current.push(timer);
  }, [clearTimers, reducedMotion]);

  const skip = useCallback(() => {
    clearTimers();
    onDone();
  }, [clearTimers, onDone]);

  // Auto-advance each timed scene (motion-safe only).
  useEffect(() => {
    if (reducedMotion) return;
    const current = SCENES[index];
    if (current.durationMs == null) return;
    const timer = window.setTimeout(advance, current.durationMs);
    timersRef.current.push(timer);
    return () => window.clearTimeout(timer);
  }, [index, reducedMotion, advance]);

  // Hank's closing line plays once when the welcome scene arrives. If the
  // browser blocks audio until a fresh gesture, the next tap or keypress
  // retries it (the same arrival pattern as the costume shop intro). A line
  // that has started is left to finish even as the cinematic hands off into
  // the game; one that never started is discarded on unmount.
  useEffect(() => {
    if (scene.id !== "welcome" || closingAudioRef.current) return;
    if (isHankScaleMuted()) return;
    const audio = new Audio(INTRO_CLOSING_LINE_SRC);
    closingAudioRef.current = audio;
    let started = false;
    const detach = () => {
      window.removeEventListener("pointerdown", attempt);
      window.removeEventListener("keydown", attempt);
    };
    const attempt = () => {
      if (started) return;
      void audio
        .play()
        .then(() => {
          started = true;
          detach();
        })
        .catch(() => {
          // Autoplay blocked — the gesture listeners below retry.
        });
    };
    attempt();
    window.addEventListener("pointerdown", attempt);
    window.addEventListener("keydown", attempt);
    return () => {
      detach();
      if (!started) {
        audio.pause();
        closingAudioRef.current = null;
      }
    };
  }, [scene.id]);

  // Escape skips, like the game's other dialogs.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") skip();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [skip]);

  // $0 → $30,000 tick-up on the golden-ticket scene. Reduced-motion players
  // see the final amount instantly via displayCount below — no animation.
  useEffect(() => {
    if (!scene.counter || reducedMotion) return;
    let frame = 0;
    const startedAt = performance.now();
    const tick = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / 3000);
      const eased = 1 - Math.pow(1 - progress, 3);
      setCount(Math.round(eased * CREDIT));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [index, reducedMotion, scene.counter]);

  // Reduced motion: show the full credit instantly instead of ticking up.
  const displayCount = reducedMotion && scene.counter ? CREDIT : count;

  return (
    <div role="dialog" aria-modal="true" aria-label="Arboreal Keeper intro" className="fixed inset-0 z-[70] overflow-hidden bg-black">
      {/* Scene still */}
      <div key={scene.id} className="absolute inset-0 overflow-hidden">
        <img
          src={scene.src}
          alt={scene.alt}
          draggable={false}
          className={reducedMotion ? "h-full w-full object-cover" : `h-full w-full object-cover anim-cinematic-kb-${scene.kb}`}
          style={reducedMotion ? undefined : { animationDuration: `${scene.durationMs ?? 12000}ms` }}
        />
      </div>

      {/* Cinematic vignette */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{ background: "radial-gradient(ellipse at 50% 45%, transparent 55%, rgba(0,0,0,.55) 100%)" }}
      />
      {/* Gold-flash cross-dissolve between scenes */}
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute inset-0 transition-opacity ${flashing ? "opacity-100 duration-300" : "opacity-0 duration-500"}`}
        style={{ background: "radial-gradient(circle at 50% 55%, rgba(255,216,130,.96), rgba(255,176,66,.6) 45%, rgba(120,62,12,.18))" }}
      />

      {/* Skip — always available */}
      <button
        type="button"
        onClick={skip}
        className="absolute right-4 top-[max(1rem,env(safe-area-inset-top))] rounded-full border border-white/15 bg-black/45 px-4 py-2 text-[11px] font-bold text-white/60 backdrop-blur-sm transition hover:text-white/90"
      >
        Skip intro
      </button>

      {/* Copy overlay — HTML, never baked into art; sized for ~390px */}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/35 to-transparent pb-[max(1.75rem,env(safe-area-inset-bottom))] pt-16">
        <div key={`copy-${scene.id}`} className="anim-cinematic-copy-in mx-auto w-full max-w-sm px-5 text-center">
          {scene.eyebrow ? (
            <div className="text-[10px] font-black uppercase tracking-[.22em] text-amber-200/70">{scene.eyebrow}</div>
          ) : null}
          {scene.counter ? (
            <div className="mt-2 text-5xl font-black tabular-nums text-amber-200 drop-shadow-[0_2px_18px_rgba(255,190,80,.45)]">
              ${displayCount.toLocaleString("en-US")}
            </div>
          ) : null}
          {scene.body ? (
            <p className={`${scene.counter || scene.cta ? "mt-2 text-base" : "text-xl"} font-semibold leading-8 text-white/90`}>{scene.body}</p>
          ) : null}
          {scene.cta ? (
            <button
              type="button"
              onClick={skip}
              className="mt-5 w-full rounded-2xl bg-amber-200 px-6 py-3.5 text-sm font-black text-[#17130a] transition hover:brightness-105 active:scale-[.98]"
            >
              Start with $30K
            </button>
          ) : null}

          {/* Progress + manual advance */}
          <div className="mt-5 flex items-center justify-center gap-2">
            {SCENES.map((entry, dot) => (
              <span
                key={entry.id}
                aria-hidden="true"
                className={`h-1.5 rounded-full transition-all ${dot === index ? "w-6 bg-amber-200/90" : dot < index ? "w-1.5 bg-amber-200/40" : "w-1.5 bg-white/20"}`}
              />
            ))}
          </div>
          {reducedMotion && !isLast ? (
            <button
              type="button"
              onClick={advance}
              className="mt-4 rounded-xl border border-white/15 bg-white/[.06] px-5 py-2.5 text-xs font-bold text-white/75"
            >
              Next
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
