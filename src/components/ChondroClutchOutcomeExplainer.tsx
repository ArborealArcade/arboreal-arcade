"use client";

import { useEffect, useMemo, useState } from "react";
import { loadChondroSaveState } from "@/lib/chondro-save";
import { ChondroSnakeIcon } from "@/components/ChondroSnakeIcon";

type Subspecies = "Morelia azurea azurea" | "Morelia azurea pulcher" | "Morelia azurea utaraensis" | "Morelia viridis";
type TraitKey = "highBlack" | "highWhite" | "blueStripe" | "yellowRetention" | "blotches";
type Snake = {
  id: string;
  name: string;
  subspecies: Subspecies;
  locality: string;
  classification: "Pure" | "Hybrid" | "Designer";
  neonateColor: "Red" | "Yellow";
  geneticsTested?: boolean;
  phenotypeScore?: number;
  highBlack: number;
  highWhite: number;
  blueStripe: number;
  yellowRetention: number;
  blotches: number;
};
type Clutch = { id: string; dam: Snake; sire: Snake; offspring: Snake[] };
type Save = { clutch?: Clutch | null };

const traits: Array<{ key: TraitKey; label: string }> = [
  { key: "highBlack", label: "High Black" },
  { key: "highWhite", label: "High White" },
  { key: "blueStripe", label: "Blue" },
  { key: "yellowRetention", label: "Yellow Retention" },
  { key: "blotches", label: "Blotches" },
];

const preferredTraits: Record<Subspecies, TraitKey[]> = {
  "Morelia azurea azurea": ["highBlack", "yellowRetention"],
  "Morelia azurea pulcher": ["yellowRetention", "blueStripe"],
  "Morelia azurea utaraensis": ["blueStripe", "highWhite"],
  "Morelia viridis": ["highWhite", "highBlack"],
};

function traitValue(snake: Snake, key: TraitKey) {
  return Number(snake[key] ?? 0);
}

function strengthLabel(value: number) {
  if (value >= 85) return "exceptional";
  if (value >= 70) return "very strong";
  if (value >= 50) return "strong";
  if (value >= 25) return "moderate";
  if (value >= 10) return "light";
  return "minimal";
}

function strongestTrait(snake: Snake) {
  return traits.reduce((best, current) => traitValue(snake, current.key) > traitValue(snake, best.key) ? current : best, traits[0]);
}

function portraitTraits(snake: Snake) {
  return {
    highBlack: snake.highBlack,
    highWhite: snake.highWhite,
    blueStripe: snake.blueStripe,
    yellowRetention: snake.yellowRetention,
    blotches: snake.blotches,
  };
}

function explainBaby(baby: Snake, dam: Snake, sire: Snake) {
  const strongest = strongestTrait(baby);
  const babyValue = traitValue(baby, strongest.key);
  const damValue = traitValue(dam, strongest.key);
  const sireValue = traitValue(sire, strongest.key);
  const parentAverage = (damValue + sireValue) / 2;
  const favoredBySubspecies = preferredTraits[baby.subspecies]?.includes(strongest.key) ?? false;
  const delta = babyValue - parentAverage;
  const reasons: string[] = [];

  if (damValue >= sireValue && damValue >= 25) reasons.push(`${dam.name} supplied the stronger visible ${strongest.label.toLowerCase()} direction.`);
  else if (sireValue > damValue && sireValue >= 25) reasons.push(`${sire.name} supplied the stronger visible ${strongest.label.toLowerCase()} direction.`);
  else reasons.push(`Neither parent is extreme for ${strongest.label.toLowerCase()}, so this result came mostly from normal inherited variation.`);

  if (favoredBySubspecies) reasons.push(`${baby.subspecies} has elevated in-game odds for this trait, which helped push the outcome in that direction.`);
  else reasons.push(`This is not one of the higher-probability traits for ${baby.subspecies}, so stronger expression is less common.`);

  if (delta >= 20) reasons.push(`This baby landed well above the parental midpoint—a genuine breakthrough roll for this pairing.`);
  else if (delta >= 8) reasons.push(`This baby improved on the parental midpoint and is a useful selective-breeding result.`);
  else if (delta <= -15) reasons.push(`This baby regressed below the parental midpoint, which is normal in a polygenic-style breeding system.`);
  else reasons.push(`This baby stayed close to the parental midpoint, which is the most common outcome.`);

  if (baby.classification === "Pure" && baby.locality !== "Mixed Locality" && baby.locality !== "Designer") {
    reasons.push(`Because both parents preserved the same named-locality line, its locality phenotype can still be evaluated separately from trait expression.`);
  } else if (baby.classification === "Pure") {
    reasons.push(`The subspecies remains pure, but mixed locality ancestry means it no longer receives a named-locality phenotype grade.`);
  } else {
    reasons.push(`${baby.classification} ancestry changes how lineage is recorded, but the visible trait outcome is still inherited from both parents.`);
  }

  return {
    headline: `${strengthLabel(babyValue)} ${strongest.label}`,
    rare: babyValue >= 85 || delta >= 20,
    reasons,
  };
}

export function ChondroClutchOutcomeExplainer() {
  const [save, setSave] = useState<Save | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const { state } = await loadChondroSaveState();
        if (!cancelled && state) setSave(state as Save);
      } catch {}
    }
    void load();
    const timer = window.setInterval(load, 2500);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  const clutch = save?.clutch ?? null;
  const analyses = useMemo(() => clutch ? clutch.offspring.map((baby) => ({ baby, analysis: explainBaby(baby, clutch.dam, clutch.sire) })) : [], [clutch]);

  if (!clutch) return null;

  return (
    <section className="mx-auto mt-5 max-w-7xl px-5 sm:px-6">
      <details open className="rounded-[28px] border border-amber-200/10 bg-amber-200/[.025]">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 [&::-webkit-details-marker]:hidden">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[.16em] text-amber-100/50">Why did they hatch this way?</div>
            <div className="mt-1 text-sm font-bold text-white/70">Clutch outcome breakdown · {clutch.id}</div>
            <div className="mt-1 text-[10px] text-white/30">Educational explanation only · exact hidden percentages stay hidden until genetic testing.</div>
          </div>
          <span className="rounded-full border border-white/[.08] px-3 py-1 text-[9px] font-black uppercase tracking-[.12em] text-white/40">Virtual clutch</span>
        </summary>
        <div className="border-t border-white/[.05] p-5">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {analyses.map(({ baby, analysis }) => (
              <article key={baby.id} className={`rounded-2xl border p-4 ${analysis.rare ? "border-amber-200/25 bg-amber-200/[.04]" : "border-white/[.06] bg-black/10"}`}>
                <ChondroSnakeIcon
                  subspecies={baby.subspecies}
                  name={baby.name}
                  traits={portraitTraits(baby)}
                  lifeStage="Hatchling"
                  neonateColor={baby.neonateColor}
                  compact
                />
                <div className="mt-3 flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-black text-white/75">{baby.name}</div>
                    <div className="mt-1 text-[10px] text-white/30">{baby.subspecies} · {baby.locality}</div>
                    <div className={`mt-1 text-[10px] font-bold ${baby.neonateColor === "Red" ? "text-red-100/55" : "text-amber-100/55"}`}>{baby.neonateColor} neonate</div>
                  </div>
                  <span className={`rounded-full border px-2.5 py-1 text-[9px] font-black uppercase tracking-[.1em] ${analysis.rare ? "border-amber-100/20 text-amber-100/70" : "border-white/[.08] text-white/35"}`}>
                    {analysis.rare ? "Breakthrough" : analysis.headline}
                  </span>
                </div>
                <div className="mt-3 text-[11px] font-bold text-emerald-100/60">Visible direction: {analysis.headline}</div>
                <div className="mt-3 space-y-2 text-[10px] leading-4 text-white/38">
                  {analysis.reasons.map((reason) => <p key={reason}>{reason}</p>)}
                </div>
              </article>
            ))}
          </div>
        </div>
      </details>
    </section>
  );
}
