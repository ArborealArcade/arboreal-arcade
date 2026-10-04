"use client";

import { useEffect, useMemo, useState } from "react";
import { loadChondroSaveState } from "@/lib/chondro-save";
import { ChondroSnakeIcon } from "@/components/ChondroSnakeIcon";
import { animalHousingCapacity } from "@/lib/chondro-facility-limits";

type Snake = {
  id: string;
  name: string;
  sex?: string;
  subspecies: string;
  locality?: string;
  neonateColor?: "Red" | "Yellow";
  classification?: string;
  ancestry?: Record<string, number>;
  localityAncestry?: Record<string, number>;
  phenotypeScore?: number;
  highBlack?: number;
  highWhite?: number;
  blueStripe?: number;
  yellowRetention?: number;
  blotches?: number;
  geneticsTested?: boolean;
};
type Clutch = { id?: string; dam?: Snake; sire?: Snake; offspring?: Snake[] };
type Save = { clutch?: Clutch | null; clutchEstablished?: boolean; holdbacks?: string[]; colony?: Array<{ id?: string }>; enclosures?: Record<string, number> };
type ClutchAction = "establish" | "toggle-holdback" | "finish";

function strongestTrait(animal: Snake) {
  const rows = [
    ["Black", Number(animal.highBlack ?? 0)],
    ["White", Number(animal.highWhite ?? 0)],
    ["Blue", Number(animal.blueStripe ?? 0)],
    ["Yellow", Number(animal.yellowRetention ?? 0)],
    ["Blotches", Number(animal.blotches ?? 0)],
  ] as const;
  return rows.reduce((best, row) => row[1] > best[1] ? row : best, rows[0]);
}

function dispatchClutchAction(action: ClutchAction, snakeId?: string) {
  window.dispatchEvent(new CustomEvent("arboreal-chondro-clutch-action", { detail: { action, snakeId } }));
}

export function ChondroActiveClutchShowcase() {
  const [save, setSave] = useState<Save>({});
  // Founder/testing allowlist: unlimited snake housing spaces, checked
  // server-side via /api/canopy-hunter/status so it follows the account.
  const [unlimitedSpaces, setUnlimitedSpaces] = useState(false);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/canopy-hunter/status", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && data?.unlimitedSpaces === true) setUnlimitedSpaces(true);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const { state } = await loadChondroSaveState();
        if (active && state) setSave(state);
      } catch {}
    }
    void load();
    const refresh = () => void load();
    const timer = window.setInterval(load, 5000);
    window.addEventListener("arboreal-chondro-breeder-save-change", refresh);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener("arboreal-chondro-breeder-save-change", refresh);
    };
  }, []);

  const clutch = save.clutch ?? null;
  const offspring = clutch?.offspring ?? [];
  const holdbacks = useMemo(() => new Set(save.holdbacks ?? []), [save.holdbacks]);
  if (!clutch || !offspring.length) return null;

  const establishmentCost = 150 + offspring.length * 75;
  const holdbackCount = holdbacks.size;
  const marketCount = Math.max(0, offspring.length - holdbackCount);
  const animalCapacity = unlimitedSpaces ? Number.POSITIVE_INFINITY : animalHousingCapacity(save.enclosures);
  const colonyCount = save.colony?.length ?? 0;
  const holdbackCapacity = Math.max(0, animalCapacity - colonyCount);
  const holdbackSpacesLeft = Math.max(0, holdbackCapacity - holdbackCount);
  const overCapacity = holdbackCount > holdbackCapacity;
  const excessHoldbacks = Math.max(0, holdbackCount - holdbackCapacity);

  return (
    <section className="mx-auto max-w-7xl px-5 pt-5 sm:px-6">
      <div className="overflow-hidden rounded-[30px] border border-amber-200/12 bg-[radial-gradient(circle_at_25%_0%,rgba(251,191,36,.08),transparent_38%),#07100c]">
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-white/[.055] p-5 sm:p-6">
          <div>
            <div className="text-[9px] font-black uppercase tracking-[.17em] text-amber-100/50">Active clutch · Virtual animals</div>
            <h2 className="mt-2 text-2xl font-semibold tracking-[-.035em] text-white/90">{clutch.dam?.name ?? "Dam"} × {clutch.sire?.name ?? "Sire"}</h2>
            <p className="mt-2 text-sm text-white/44">{offspring.length} virtual offspring · {save.clutchEstablished ? `${holdbackCount} holdback${holdbackCount === 1 ? "" : "s"} · ${marketCount} headed to market` : "establish the clutch before individual decisions"}</p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <div className="rounded-full border border-emerald-300/12 bg-emerald-300/[.035] px-3 py-1.5 text-[9px] font-black uppercase tracking-[.1em] text-emerald-100/60">Virtual only</div>
            {save.clutchEstablished ? <div className={`rounded-full border px-3 py-1.5 text-[9px] font-black uppercase tracking-[.1em] ${overCapacity ? "border-red-300/20 bg-red-300/[.05] text-red-100/75" : "border-white/[.08] text-white/42"}`}>{unlimitedSpaces ? "Unlimited holdback spaces" : overCapacity ? `${excessHoldbacks} over capacity` : `${holdbackSpacesLeft} holdback space${holdbackSpacesLeft === 1 ? "" : "s"} left`}</div> : null}
            <div className={`rounded-full border px-3 py-1.5 text-[9px] font-black uppercase tracking-[.13em] ${save.clutchEstablished ? "border-emerald-300/18 bg-emerald-300/[.045] text-emerald-100/70" : "border-amber-200/18 bg-amber-200/[.045] text-amber-100/70"}`}>
              {save.clutchEstablished ? "Established" : "Establishment pending"}
            </div>
          </div>
        </div>

        {!save.clutchEstablished ? (
          <div className="border-b border-white/[.055] bg-amber-200/[.025] p-4 sm:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-sm font-bold text-amber-100/80">Establish the clutch together</div>
                <div className="mt-1 text-xs leading-5 text-white/40">One payment covers the shared establishment period before you choose individual virtual holdbacks or sales.</div>
              </div>
              <button type="button" onClick={() => dispatchClutchAction("establish")} className="rounded-2xl bg-amber-200 px-5 py-3 text-xs font-black text-[#17130a] transition hover:bg-amber-100">
                Establish clutch · ${establishmentCost.toLocaleString()}
              </button>
            </div>
          </div>
        ) : null}

        <div className="p-4 sm:p-5">
          {save.clutchEstablished ? <div className="mb-4 rounded-2xl border border-emerald-300/10 bg-emerald-300/[.025] px-4 py-3 text-[11px] leading-5 text-white/42">Your current housing has room for {holdbackCapacity} clutch holdback{holdbackCapacity === 1 ? "" : "s"}. Chondro Dojo Pairs count as two animal spaces while using one facility slot.</div> : null}
          {save.clutchEstablished && overCapacity ? <div className="mb-4 rounded-2xl border border-red-300/16 bg-red-300/[.04] px-4 py-3 text-[11px] leading-5 text-red-50/72">Housing conflict: remove {excessHoldbacks} holdback{excessHoldbacks === 1 ? "" : "s"} before closing this clutch. The season cannot advance while your selected holdbacks exceed available animal spaces.</div> : null}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {offspring.map((baby) => {
              const strongest = strongestTrait(baby);
              const isHoldback = holdbacks.has(baby.id);
              const holdbackFull = !isHoldback && holdbackCount >= holdbackCapacity;
              return (
                <article key={baby.id} className={`rounded-[22px] border p-3 transition ${isHoldback ? "border-emerald-300/22 bg-emerald-300/[.035]" : "border-white/[.065] bg-black/14"}`}>
                  <div className="rounded-[18px] border border-white/[.045] bg-black/18 p-2">
                    <ChondroSnakeIcon
                      subspecies={baby.subspecies as never}
                      name={baby.name}
                      traits={{ highBlack: Number(baby.highBlack ?? 0), highWhite: Number(baby.highWhite ?? 0), blueStripe: Number(baby.blueStripe ?? 0), yellowRetention: Number(baby.yellowRetention ?? 0), blotches: Number(baby.blotches ?? 0) }}
                      lifeStage={save.clutchEstablished ? "Neonate" : "Hatchling"}
                      neonateColor={baby.neonateColor}
                      locality={baby.locality}
                      classification={baby.classification as never}
                      ancestry={baby.ancestry as never}
                      localityAncestry={baby.localityAncestry}
                      phenotypeScore={baby.phenotypeScore}
                      spriteSeed={baby.id}
                    />
                  </div>
                  <div className="mt-3 flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <div className="truncate text-sm font-bold text-white/80">{baby.name}</div>
                        <span className="shrink-0 rounded-full border border-emerald-300/14 px-2 py-0.5 text-[7px] font-black uppercase tracking-[.1em] text-emerald-100/58">Virtual</span>
                      </div>
                      <div className="mt-1 truncate text-[10px] text-white/36">{baby.sex ?? "Unsexed"} · {baby.locality ?? baby.subspecies}</div>
                    </div>
                    {isHoldback ? <span className="shrink-0 rounded-full border border-emerald-300/18 px-2 py-1 text-[8px] font-black uppercase tracking-[.1em] text-emerald-100/70">Holdback</span> : null}
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-2 border-t border-white/[.05] pt-3 text-[10px]">
                    <span className={baby.neonateColor === "Red" ? "text-red-100/62" : "text-amber-100/62"}>{baby.neonateColor ?? "Yellow"} neonate</span>
                    <span className="text-white/34">{baby.geneticsTested ? `${strongest[0]} ${strongest[1]}%` : "Traits untested"}</span>
                  </div>
                  <button
                    type="button"
                    disabled={!save.clutchEstablished || holdbackFull}
                    onClick={() => dispatchClutchAction("toggle-holdback", baby.id)}
                    className={`mt-3 w-full rounded-xl border px-3 py-2.5 text-[10px] font-black uppercase tracking-[.08em] transition disabled:cursor-not-allowed disabled:opacity-30 ${isHoldback ? "border-emerald-300/20 bg-emerald-300/[.07] text-emerald-100/78" : "border-white/[.08] bg-white/[.025] text-white/52 hover:border-emerald-300/16 hover:text-white/78"}`}
                  >
                    {!save.clutchEstablished ? "Establish first" : isHoldback ? "Keep as holdback" : holdbackFull ? "Housing full" : "Mark as holdback"}
                  </button>
                </article>
              );
            })}
          </div>

          {save.clutchEstablished ? (
            <div className={`mt-5 flex flex-col gap-3 rounded-[22px] border p-4 sm:flex-row sm:items-center sm:justify-between ${overCapacity ? "border-red-300/14 bg-red-300/[.025]" : "border-emerald-300/10 bg-emerald-300/[.025]"}`}>
              <div>
                <div className="text-sm font-bold text-white/72">{overCapacity ? "Resolve housing before closing" : "Ready to close this clutch?"}</div>
                <div className="mt-1 text-xs text-white/38">{overCapacity ? `${excessHoldbacks} selected holdback${excessHoldbacks === 1 ? "" : "s"} exceed current housing capacity.` : `${holdbackCount} stay in your colony · ${marketCount} will be listed · then the season advances.`}</div>
              </div>
              <button type="button" disabled={overCapacity} onClick={() => dispatchClutchAction("finish")} className="rounded-2xl bg-emerald-300 px-5 py-3 text-xs font-black text-[#06100c] transition hover:bg-emerald-200 disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-white/30">
                {overCapacity ? "Housing capacity exceeded" : "List unheld & advance season"}
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
