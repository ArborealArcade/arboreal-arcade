"use client";

import { useEffect, useMemo, useState } from "react";
import { achievementReputation } from "@/lib/chondro-achievements";
import {
  SHOW_CATEGORIES,
  SHOW_TIERS,
  showPlacement,
  showRewards,
  showScore,
  type ShowAnimal,
} from "@/lib/chondro-shows";

type Snake = ShowAnimal & {
  locality?: string;
  lifeStage?: string;
  geneticsTested?: boolean;
};

type ShowHistoryEntry = {
  id: string;
  season: number;
  animalId: string;
  animalName: string;
  showId: string;
  showName: string;
  categoryId: string;
  categoryName: string;
  placement: ReturnType<typeof showPlacement>;
  score: number;
  entryFee: number;
  cashAward: number;
  reputationAward: number;
};

type Save = {
  cash: number;
  colony: Snake[];
  season: number;
  careerReputation?: number;
  showHistory?: ShowHistoryEntry[];
  [key: string]: unknown;
};

const LOCAL_SAVE_KEY = "arboreal_chondro_breeder_v2";
const money = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);

export function ChondroShowsPanel() {
  const [save, setSave] = useState<Save | null>(null);
  const [animalId, setAnimalId] = useState("");
  const [tierId, setTierId] = useState(SHOW_TIERS[0].id);
  const [categoryId, setCategoryId] = useState(SHOW_CATEGORIES[0].id);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    let local: Save | null = null;
    try {
      local = JSON.parse(window.localStorage.getItem(LOCAL_SAVE_KEY) || "null") as Save | null;
    } catch {}
    try {
      const response = await fetch("/api/hatchery/chondro-breeder/save", { cache: "no-store" });
      const data = await response.json();
      const next = response.ok && data.save?.state ? (data.save.state as Save) : local;
      if (next) setSave(next);
    } catch {
      if (local) setSave(local);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const eligibleAnimals = useMemo(
    () =>
      (save?.colony ?? [])
        .filter((animal) => animal.lifeStage === "Adult" && animal.nidoStatus !== "Positive")
        .sort((a, b) => showScore(b) - showScore(a)),
    [save],
  );
  const animal = eligibleAnimals.find((item) => item.id === animalId) ?? eligibleAnimals[0] ?? null;
  const tier = SHOW_TIERS.find((item) => item.id === tierId) ?? SHOW_TIERS[0];
  const category = SHOW_CATEGORIES.find((item) => item.id === categoryId) ?? SHOW_CATEGORIES[0];
  const achievementRep = save ? achievementReputation(save) : 0;
  const reputation = Number(save?.careerReputation ?? 0) + achievementRep;
  const placement = animal ? showPlacement(animal, tier, Number(save?.season ?? 1)) : null;
  const enteredKey = animal ? `${save?.season}:${tier.id}:${category.id}:${animal.id}` : "";
  const alreadyEntered = Boolean(
    animal &&
      (save?.showHistory ?? []).some(
        (entry) => `${entry.season}:${entry.showId}:${entry.categoryId}:${entry.animalId}` === enteredKey,
      ),
  );

  async function enterShow() {
    if (!save || !animal || busy || alreadyEntered) return;
    if (save.cash < tier.entryFee || reputation < tier.reputationRequired) return;
    setBusy(true);
    setStatus("");
    try {
      const actualPlacement = showPlacement(animal, tier, save.season);
      const actualRewards = showRewards(tier, actualPlacement);
      const result: ShowHistoryEntry = {
        id: `SHOW-${Date.now().toString(36)}`,
        season: save.season,
        animalId: animal.id,
        animalName: animal.name,
        showId: tier.id,
        showName: tier.name,
        categoryId: category.id,
        categoryName: category.name,
        placement: actualPlacement,
        score: showScore(animal),
        entryFee: tier.entryFee,
        cashAward: actualRewards.cash,
        reputationAward: actualRewards.reputation,
      };
      const next: Save = {
        ...save,
        cash: save.cash - tier.entryFee + actualRewards.cash,
        careerReputation: Number(save.careerReputation ?? 0) + actualRewards.reputation,
        showHistory: [result, ...(save.showHistory ?? [])].slice(0, 100),
      };
      window.localStorage.setItem(LOCAL_SAVE_KEY, JSON.stringify(next));
      const response = await fetch("/api/hatchery/chondro-breeder/save", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      if (!response.ok) throw new Error("save failed");
      setSave(next);
      setStatus(
        actualPlacement === "No Placement"
          ? `${animal.name} did not place at ${tier.name}. Entry fee: ${money(tier.entryFee)}.`
          : `${animal.name} earned ${actualPlacement} · +${money(actualRewards.cash)} · +${actualRewards.reputation} reputation.`,
      );
    } catch {
      setStatus("That show entry could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  if (!save) {
    return <div className="rounded-2xl border border-white/[.06] p-4 text-xs text-white/35">Loading virtual show circuit…</div>;
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-emerald-300/10 bg-emerald-300/[.025] px-4 py-3 text-[10px] text-white/38">
        <span className="rounded-full border border-emerald-300/14 bg-emerald-300/[.04] px-2.5 py-1 text-[8px] font-black uppercase tracking-[.1em] text-emerald-100/62">Virtual show circuit</span>
        <span>Entries, prizes, reputation and animals in this section are part of the Arboreal Keeper game.</span>
      </div>
      <div className="grid gap-3 lg:grid-cols-[1fr_1fr]">
        <section className="rounded-2xl border border-white/[.07] bg-black/10 p-4">
          <div className="text-[10px] font-black uppercase tracking-[.15em] text-white/30">Virtual show entry</div>
          <select
            value={animal?.id ?? ""}
            onChange={(event) => setAnimalId(event.target.value)}
            className="mt-3 w-full rounded-xl border border-white/[.08] bg-black/30 px-3 py-2 text-xs text-white/65"
          >
            {!eligibleAnimals.length ? <option value="">No eligible virtual adults</option> : null}
            {eligibleAnimals.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} · score {showScore(item)} · {item.classification}
              </option>
            ))}
          </select>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <select value={tierId} onChange={(event) => setTierId(event.target.value)} className="rounded-xl border border-white/[.08] bg-black/30 px-3 py-2 text-xs text-white/65">
              {SHOW_TIERS.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
            <select value={categoryId} onChange={(event) => setCategoryId(event.target.value)} className="rounded-xl border border-white/[.08] bg-black/30 px-3 py-2 text-xs text-white/65">
              {SHOW_CATEGORIES.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-[10px] text-white/38">
            <Mini label="Game entry fee" value={money(tier.entryFee)} />
            <Mini label="Rep required" value={tier.reputationRequired.toLocaleString()} />
            <Mini label="Animal score" value={animal ? String(showScore(animal)) : "—"} />
            <Mini label="Current rep" value={reputation.toLocaleString()} />
          </div>
          <button
            type="button"
            disabled={!animal || busy || alreadyEntered || save.cash < tier.entryFee || reputation < tier.reputationRequired}
            onClick={() => void enterShow()}
            className="mt-3 rounded-xl bg-amber-200 px-4 py-2 text-xs font-black text-[#17130a] disabled:opacity-30"
          >
            {alreadyEntered ? "Already entered this season" : `Enter virtual show · ${money(tier.entryFee)}`}
          </button>
          {placement && !alreadyEntered ? (
            <div className="mt-2 text-[9px] leading-4 text-white/25">
              Preview uses the current virtual animal, show tier, and season. Results are deterministic for that entry.
            </div>
          ) : null}
          {status ? <div role="status" className="mt-3 text-xs text-amber-100/65">{status}</div> : null}
        </section>

        <section className="rounded-2xl border border-white/[.07] bg-black/10 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[10px] font-black uppercase tracking-[.15em] text-white/30">Virtual show history</div>
              <div className="mt-1 text-xs text-white/35">Placings build game cash and breeder reputation.</div>
            </div>
            <div className="text-[10px] text-white/25">{save.showHistory?.length ?? 0} entries</div>
          </div>
          <div className="mt-3 max-h-64 space-y-2 overflow-y-auto pr-1">
            {(save.showHistory ?? []).slice(0, 20).map((entry) => (
              <div key={entry.id} className="rounded-xl border border-white/[.06] p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-xs font-bold text-white/68">{entry.animalName}</div>
                    <div className="mt-1 text-[9px] text-white/28">{entry.showName} · {entry.categoryName} · Season {entry.season}</div>
                  </div>
                  <div className={`text-[10px] font-black ${entry.placement === "No Placement" ? "text-white/35" : "text-amber-100/70"}`}>{entry.placement}</div>
                </div>
                <div className="mt-2 text-[9px] text-emerald-100/50">{entry.cashAward ? `+${money(entry.cashAward)}` : "No game cash prize"} · +{entry.reputationAward} rep</div>
              </div>
            ))}
            {!save.showHistory?.length ? <div className="rounded-xl border border-dashed border-white/[.07] p-4 text-xs text-white/25">No virtual show entries yet.</div> : null}
          </div>
        </section>
      </div>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-white/[.06] p-2"><div className="text-[8px] uppercase tracking-[.12em] text-white/25">{label}</div><div className="mt-1 font-bold text-white/62">{value}</div></div>;
}
