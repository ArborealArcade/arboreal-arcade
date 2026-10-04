"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";

const LOCAL_SAVE_KEY = "arboreal_chondro_breeder_v2";

type LooseSave = {
  breedingCycle?: {
    stage?: string;
    startedAt?: number;
    completesAt?: number;
  } | null;
  clutch?: {
    offspring?: unknown[];
  } | null;
  clutchEstablished?: boolean;
};

type StageArt = {
  src: string;
  eyebrow: string;
  title: string;
  detail: string;
  phase: number;
};

const clutchPhases = [
  { label: "Incubate", detail: "Eggs laid and placed in the incubator" },
  { label: "Hatch", detail: "Incubation finishes and neonates emerge" },
  { label: "Establish", detail: "Raise the clutch together before individual actions" },
  { label: "Manage", detail: "Choose holdbacks and list the remaining neonates" },
] as const;

function readSave(): LooseSave | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(LOCAL_SAVE_KEY);
    return raw ? (JSON.parse(raw) as LooseSave) : null;
  } catch {
    return null;
  }
}

function normalizeStage(stage: string) {
  if (stage === "gestation" || stage === "separate-pair" || stage === "pre-lay" || stage === "laying") return "development";
  if (stage === "hatch-day") return "incubation";
  return stage;
}

function chooseArt(save: LooseSave | null, now: number): StageArt {
  if (!save) {
    return {
      src: "/hatchery/game/fresh-eggs.webp",
      eyebrow: "Clutch room",
      title: "Incubate, hatch, establish, manage",
      detail: "Once development finishes, eggs are laid and incubation begins the same day. After hatch, establish the clutch as a group before making individual decisions.",
      phase: -1,
    };
  }

  const clutchCount = Array.isArray(save.clutch?.offspring) ? save.clutch!.offspring!.length : 0;
  if (clutchCount > 0) {
    if (save.clutchEstablished) {
      return {
        src: "/hatchery/game/neonates.webp",
        eyebrow: "Established clutch",
        title: `${clutchCount} neonate${clutchCount === 1 ? "" : "s"} ready for management`,
        detail: "The clutch is established. You can now choose holdbacks and move the remaining neonates to the player market.",
        phase: 3,
      };
    }
    return {
      src: "/hatchery/game/hatching.webp",
      eyebrow: "Hatched clutch",
      title: `${clutchCount} hatchling${clutchCount === 1 ? "" : "s"} need establishment`,
      detail: "Incubation is complete and the clutch has hatched. Establish the group before naming, holding back or selling individual animals.",
      phase: 2,
    };
  }

  const cycle = save.breedingCycle;
  const stage = normalizeStage(cycle?.stage ?? "");

  if (stage === "incubation") {
    const started = Number(cycle?.startedAt ?? 0);
    const completes = Number(cycle?.completesAt ?? 0);
    const span = Math.max(1, completes - started);
    const progress = Math.max(0, Math.min(1, (now - started) / span));
    if (progress >= 0.68) {
      return {
        src: "/hatchery/game/near-hatch-eggs.webp",
        eyebrow: "Late incubation",
        title: "The clutch is getting close",
        detail: "Incubation is well advanced. When the timer finishes, the clutch hatches and moves directly into the establishment step.",
        phase: 0,
      };
    }
    return {
      src: "/hatchery/game/fresh-eggs.webp",
      eyebrow: "Incubation",
      title: "Eggs laid and incubation underway",
      detail: "The lay event has already happened. Keep the clutch stable while the incubation timer runs; hatch follows when it finishes.",
      phase: 0,
    };
  }

  if (stage === "development") {
    return {
      src: "/hatchery/game/fresh-eggs.webp",
      eyebrow: "Development",
      title: "Waiting for the lay event",
      detail: "The successful pairing is in development. When that timer finishes, the lay notification appears and incubation starts immediately.",
      phase: -1,
    };
  }

  return {
    src: "/hatchery/game/fresh-eggs.webp",
    eyebrow: "Clutch room",
    title: "No active clutch yet",
    detail: "Complete Cycle, Pair and Develop. The clutch screen becomes active when eggs are laid and incubation begins.",
    phase: -1,
  };
}

export function ChondroClutchStageArt() {
  const [save, setSave] = useState<LooseSave | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const refresh = () => setSave(readSave());
    const initial = window.setTimeout(refresh, 0);
    const tick = window.setInterval(() => setNow(Date.now()), 60_000);
    window.addEventListener("arboreal-chondro-breeder-save-change", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(tick);
      window.removeEventListener("arboreal-chondro-breeder-save-change", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  const art = useMemo(() => chooseArt(save, now), [save, now]);

  return (
    <section className="mx-auto max-w-7xl px-4 pt-5 sm:px-6">
      <div className="overflow-hidden rounded-[28px] border border-emerald-300/10 bg-[radial-gradient(circle_at_left,rgba(16,185,129,.08),transparent_36%),#06100c] shadow-[0_18px_60px_rgba(0,0,0,.18)]">
        <div className="grid items-stretch lg:grid-cols-[minmax(260px,36%)_1fr]">
          <div className="relative min-h-[270px] overflow-hidden border-b border-white/[.06] bg-black/30 lg:min-h-[360px] lg:border-b-0 lg:border-r">
            <Image src={art.src} alt="Arboreal Keeper clutch progression illustration" fill sizes="(max-width: 1024px) 100vw, 36vw" className="object-cover" />
            <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,transparent_55%,rgba(3,8,6,.72)_100%)] lg:bg-[linear-gradient(90deg,transparent_58%,rgba(6,16,12,.62)_100%)]" />
          </div>

          <div className="flex flex-col justify-center p-5 sm:p-7 lg:p-8">
            <div className="text-[9px] font-black uppercase tracking-[.17em] text-emerald-200/48">{art.eyebrow}</div>
            <h2 className="mt-2 text-2xl font-semibold tracking-[-.035em] text-white sm:text-3xl">{art.title}</h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-white/44">{art.detail}</p>

            <div className="mt-6 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              {clutchPhases.map((phase, index) => {
                const complete = art.phase > index;
                const active = art.phase === index;
                return (
                  <div
                    key={phase.label}
                    className={`rounded-2xl border p-3 ${active ? "border-emerald-300/25 bg-emerald-300/[.07]" : complete ? "border-emerald-300/10 bg-emerald-300/[.025]" : "border-white/[.06] bg-black/10"}`}
                  >
                    <div className="flex items-center gap-2">
                      <span className={`grid h-6 w-6 place-items-center rounded-full border text-[10px] font-black ${active || complete ? "border-emerald-300/20 text-emerald-100" : "border-white/[.08] text-white/28"}`}>{complete ? "✓" : index + 1}</span>
                      <span className={`text-xs font-bold ${active ? "text-emerald-100" : complete ? "text-emerald-100/55" : "text-white/42"}`}>{phase.label}</span>
                    </div>
                    <div className="mt-2 text-[10px] leading-4 text-white/30">{phase.detail}</div>
                  </div>
                );
              })}
            </div>

            <div className="mt-5 rounded-2xl border border-amber-200/10 bg-amber-200/[.025] px-4 py-3 text-[11px] leading-5 text-amber-50/48">
              <strong className="text-amber-100/72">No extra lay timer:</strong> laying is a milestone at the end of Develop. The eggs enter Incubation immediately, and hatch occurs when Incubation completes.
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
