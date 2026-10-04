"use client";

import { ArborealKeeperEmeraldAnimalRecord } from "@/components/ArborealKeeperEmeraldAnimalRecord";
import { useEffect, useMemo, useState } from "react";
import {
  ARBOREAL_KEEPER_ENCLOSURES,
  enclosureSupportsAnimal,
  type KeeperEnclosureId,
} from "@/lib/arboreal-keeper-enclosures";
import {
  EMPTY_EMERALD_KEEPER_SAVE,
  EMERALD_BREEDING_STAGES,
  EMERALD_KEEPER_SAVE_KEY,
  EMERALD_MARKET_DAY_MS,
  EMERALD_TRAIT_LABELS,
  advanceEmeraldBreedingJob,
  availableHousingUnit,
  breedingStageLabel,
  eligibleEmeraldEnclosures,
  emeraldMarketForEpoch,
  emeraldMarketValue,
  emeraldSpeciesDisplayName,
  generateEmeraldLitter,
  growEmeraldAnimal,
  growthCostForEmerald,
  sanitizeEmeraldKeeperSave,
  startEmeraldBreedingJob,
  type EmeraldAnimal,
  type EmeraldBreedingJob,
  type EmeraldKeeperSave,
  type EmeraldSpeciesId,
} from "@/lib/arboreal-keeper-emerald-engine";
import { ARBOREAL_KEEPER_SPECIES_BY_ID } from "@/lib/arboreal-keeper-species";
import { keeperLevelFromReputation } from "@/lib/arboreal-keeper-progression";
import { emeraldArtStyleForAnimal } from "@/lib/arboreal-keeper-emerald-art";

type EmeraldWorkspaceMode = "breeding" | "colony" | "clutches" | "market";

type EconomyAction = {
  action: "spend" | "credit" | "reputation";
  amount: number;
  reason: string;
  approved: boolean;
  balance?: number;
};

const CHONDRO_SAVE_KEY = "arboreal_chondro_breeder_v2";
const SPECIES: EmeraldSpeciesId[] = [
  "northern_emerald_tree_boa",
  "amazon_basin_emerald_tree_boa",
];

const HOUSING_SHOP_IDS: KeeperEnclosureId[] = [
  "chondro-dojo-bin",
  "pvc-arboreal-medium",
];

const money = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);

function readSharedProgress() {
  if (typeof window === "undefined") return { cash: 30000, reputation: 0 };
  try {
    const raw = window.localStorage.getItem(CHONDRO_SAVE_KEY);
    if (!raw) return { cash: 30000, reputation: 0 };
    const parsed = JSON.parse(raw) as { cash?: unknown; careerReputation?: unknown };
    return {
      cash: Number.isFinite(Number(parsed.cash)) ? Number(parsed.cash) : 30000,
      reputation: Number.isFinite(Number(parsed.careerReputation)) ? Number(parsed.careerReputation) : 0,
    };
  } catch {
    return { cash: 30000, reputation: 0 };
  }
}

function requestEconomyAction(action: EconomyAction["action"], amount: number, reason: string) {
  const detail: EconomyAction = { action, amount, reason, approved: false };
  window.dispatchEvent(new CustomEvent<EconomyAction>("arboreal-keeper-economy-action", { detail }));
  return detail;
}

function remaining(ms: number) {
  const totalMinutes = Math.max(0, Math.ceil(ms / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours >= 24) return `${Math.floor(hours / 24)}d ${hours % 24}h`;
  if (hours) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function breedingCost(speciesId: EmeraldSpeciesId) {
  return speciesId === "amazon_basin_emerald_tree_boa" ? 900 : 650;
}

function maxLitterSize(speciesId: EmeraldSpeciesId) {
  return speciesId === "amazon_basin_emerald_tree_boa" ? 9 : 11;
}

function resolveReadyJobs(save: EmeraldKeeperSave, now: number) {
  let animals = [...save.animals];
  const housingUnits = save.housingUnits.map((unit) => ({ ...unit }));
  const litters = [...save.litters];
  const jobs: EmeraldBreedingJob[] = [];
  let changed = false;
  let reputationEarned = 0;

  for (const original of save.breedingJobs) {
    let job: EmeraldBreedingJob | null = original;
    let guard = 0;

    while (job && now >= job.completesAt && guard < EMERALD_BREEDING_STAGES.length + 1) {
      guard += 1;
      const currentStage = job.stage;
      const result = advanceEmeraldBreedingJob(job, now);

      if (!result.completed) {
        job = result.job;
        changed = true;
        continue;
      }

      if (currentStage !== "birth") {
        job = result.job;
        changed = true;
        continue;
      }

      const dam = animals.find((animal) => animal.id === original.damId);
      const sire = animals.find((animal) => animal.id === original.sireId);
      if (!dam || !sire) {
        job = null;
        changed = true;
        break;
      }

      const offspring = generateEmeraldLitter({ dam, sire, seed: original.seed, bornAt: now });
      const availableUnits = housingUnits.filter(
        (unit) =>
          unit.occupantId === null &&
          enclosureSupportsAnimal(unit.enclosureId, original.speciesId, "neonate"),
      );

      if (availableUnits.length < offspring.length) {
        job = original;
        break;
      }

      offspring.forEach((animal, index) => {
        const unit = availableUnits[index];
        if (unit) {
          const target = housingUnits.find((item) => item.id === unit.id);
          if (target) target.occupantId = animal.id;
        }
      });

      animals = [...animals, ...offspring];
      litters.unshift({
        id: `litter-${original.seed}`,
        speciesId: original.speciesId,
        damId: original.damId,
        sireId: original.sireId,
        offspringIds: offspring.map((animal) => animal.id),
        bornAt: now,
        seasonLabel: `Keeper year ${new Date(now).getFullYear()}`,
      });
      reputationEarned += 35 + offspring.length * 4;
      job = null;
      changed = true;
    }

    if (job) jobs.push(job);
  }

  return {
    save: changed
      ? {
          ...save,
          animals,
          housingUnits,
          litters,
          breedingJobs: jobs,
          updatedAt: now,
        }
      : save,
    changed,
    reputationEarned,
  };
}

export function ArborealKeeperEmeraldWorkspace({ mode }: { mode: EmeraldWorkspaceMode }) {
  const [save, setSave] = useState<EmeraldKeeperSave>(EMPTY_EMERALD_KEEPER_SAVE);
  const [hydrated, setHydrated] = useState(false);
  const [now, setNow] = useState(0);
  const [cash, setCash] = useState(30000);
  const [reputation, setReputation] = useState(0);
  const [message, setMessage] = useState("");
  const [damId, setDamId] = useState("");
  const [sireId, setSireId] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const raw = window.localStorage.getItem(EMERALD_KEEPER_SAVE_KEY);
        setSave(raw ? sanitizeEmeraldKeeperSave(JSON.parse(raw)) : EMPTY_EMERALD_KEEPER_SAVE);
      } catch {
        setSave(EMPTY_EMERALD_KEEPER_SAVE);
      }
      const progress = readSharedProgress();
      setCash(progress.cash);
      setReputation(progress.reputation);
      setNow(Date.now());
      setHydrated(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(
      EMERALD_KEEPER_SAVE_KEY,
      JSON.stringify({ ...save, updatedAt: Date.now() }),
    );
  }, [hydrated, save]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const sync = () => {
      const progress = readSharedProgress();
      setCash(progress.cash);
      setReputation(progress.reputation);
    };
    window.addEventListener("arboreal-keeper-economy-updated", sync);
    window.addEventListener("focus", sync);
    return () => {
      window.removeEventListener("arboreal-keeper-economy-updated", sync);
      window.removeEventListener("focus", sync);
    };
  }, []);

  useEffect(() => {
    if (!hydrated || !save.breedingJobs.length || now <= 0) return;
    const timer = window.setTimeout(() => {
      const resolved = resolveReadyJobs(save, now);
      if (!resolved.changed) return;
      setSave(resolved.save);
      if (resolved.reputationEarned > 0) {
        requestEconomyAction("reputation", resolved.reputationEarned, "Emerald Tree Boa litter");
        setMessage(`Live litter produced. +${resolved.reputationEarned} keeper reputation.`);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [hydrated, now, save]);

  const keeperLevel = keeperLevelFromReputation(reputation);
  const speciesId = save.selectedSpecies;
  const species = ARBOREAL_KEEPER_SPECIES_BY_ID[speciesId];
  const unlocked = keeperLevel >= species.unlockLevel;
  const animalsForSpecies = save.animals.filter((animal) => animal.speciesId === speciesId);
  const currentJob = save.breedingJobs.find((job) => job.speciesId === speciesId) ?? null;
  const females = animalsForSpecies.filter(
    (animal) => animal.lifeStage === "adult" && animal.sex === "Female",
  );
  const males = animalsForSpecies.filter(
    (animal) => animal.lifeStage === "adult" && animal.sex === "Male",
  );
  const marketEpoch = Math.floor(now / EMERALD_MARKET_DAY_MS);
  const market = useMemo(
    () => emeraldMarketForEpoch(marketEpoch, keeperLevel).filter((offer) => offer.animal.speciesId === speciesId),
    [keeperLevel, marketEpoch, speciesId],
  );

  function chooseSpecies(next: EmeraldSpeciesId) {
    setSave((current) => ({ ...current, selectedSpecies: next }));
    setDamId("");
    setSireId("");
    setMessage("");
  }

  function spend(amount: number, reason: string) {
    const result = requestEconomyAction("spend", amount, reason);
    if (!result.approved) {
      setMessage(`You need ${money(amount)} available in the shared facility budget.`);
      return false;
    }
    if (typeof result.balance === "number") setCash(result.balance);
    return true;
  }

  function buyHousing(enclosureId: KeeperEnclosureId) {
    const enclosure = ARBOREAL_KEEPER_ENCLOSURES.find((item) => item.id === enclosureId);
    if (!enclosure) return;
    if (!spend(enclosure.price, enclosure.displayName)) return;
    const unit = {
      id: `keeper-housing-${enclosureId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      enclosureId,
      occupantId: null,
    };
    setSave((current) => ({ ...current, housingUnits: [...current.housingUnits, unit] }));
    setMessage(`${enclosure.displayName} added. This enclosure holds one animal.`);
  }

  function buyAnimal(offerId: string) {
    const offer = market.find((item) => item.id === offerId);
    if (!offer || save.purchasedOfferIds.includes(offer.id)) return;
    const unit = availableHousingUnit(save, offer.animal);
    if (!unit) {
      setMessage(`Buy an empty compatible enclosure before purchasing this ${offer.animal.lifeStage}.`);
      return;
    }
    if (!spend(offer.price, `Purchase ${emeraldSpeciesDisplayName(offer.animal.speciesId)}`)) return;

    setSave((current) => ({
      ...current,
      animals: [...current.animals, offer.animal],
      purchasedOfferIds: [...current.purchasedOfferIds, offer.id],
      housingUnits: current.housingUnits.map((housing) =>
        housing.id === unit.id ? { ...housing, occupantId: offer.animal.id } : housing,
      ),
    }));
    requestEconomyAction("reputation", 8, "Emerald Tree Boa acquisition");
    setMessage(`${offer.animal.sex} ${emeraldSpeciesDisplayName(offer.animal.speciesId)} added to My Animals.`);
  }

  function startPairing() {
    const dam = save.animals.find((animal) => animal.id === damId);
    const sire = save.animals.find((animal) => animal.id === sireId);
    if (!dam || !sire) {
      setMessage("Choose an adult female and adult male first.");
      return;
    }
    if (currentJob) {
      setMessage("This species already has an active reproductive cycle.");
      return;
    }
    const cost = breedingCost(speciesId);
    if (!spend(cost, `${emeraldSpeciesDisplayName(speciesId)} breeding cycle`)) return;
    try {
      const job = startEmeraldBreedingJob({ dam, sire, now: Date.now() });
      setSave((current) => ({ ...current, breedingJobs: [...current.breedingJobs, job] }));
      setMessage("Pairing started. The cycle will continue in real time while you are away.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to start this pairing.");
    }
  }

  function growAnimal(animalId: string) {
    const animal = save.animals.find((item) => item.id === animalId);
    if (!animal || animal.lifeStage === "adult") return;
    const cost = growthCostForEmerald(animal);
    const grown = growEmeraldAnimal(animal);
    const currentUnit = save.housingUnits.find((unit) => unit.occupantId === animal.id) ?? null;
    const currentStillWorks = currentUnit
      ? enclosureSupportsAnimal(currentUnit.enclosureId, animal.speciesId, grown.lifeStage)
      : false;
    const targetUnit = currentStillWorks
      ? currentUnit
      : availableHousingUnit(save, grown);

    if (!targetUnit) {
      setMessage(`A compatible empty enclosure is required before raising this animal to ${grown.lifeStage}.`);
      return;
    }
    if (!spend(cost, `Raise ${emeraldSpeciesDisplayName(animal.speciesId)} to ${grown.lifeStage}`)) return;

    setSave((current) => ({
      ...current,
      animals: current.animals.map((item) => (item.id === animal.id ? grown : item)),
      housingUnits: current.housingUnits.map((unit) => {
        if (currentUnit && unit.id === currentUnit.id && unit.id !== targetUnit.id) return { ...unit, occupantId: null };
        if (unit.id === targetUnit.id) return { ...unit, occupantId: animal.id };
        return unit;
      }),
    }));
    setMessage(`${animal.name} advanced to ${grown.lifeStage}.`);
  }

  function sellAnimal(animalId: string) {
    const animal = save.animals.find((item) => item.id === animalId);
    if (!animal) return;
    if (save.breedingJobs.some((job) => job.damId === animalId || job.sireId === animalId)) {
      setMessage("An animal in an active breeding cycle cannot be sold.");
      return;
    }
    const value = Math.round(emeraldMarketValue(animal) * 0.72 / 25) * 25;
    requestEconomyAction("credit", value, `Sold ${emeraldSpeciesDisplayName(animal.speciesId)}`);
    setSave((current) => ({
      ...current,
      animals: current.animals.filter((item) => item.id !== animalId),
      housingUnits: current.housingUnits.map((unit) =>
        unit.occupantId === animalId ? { ...unit, occupantId: null } : unit,
      ),
    }));
    setMessage(`${animal.name} sold for ${money(value)}. The enclosure is now empty.`);
  }

  if (!hydrated) return null;

  return (
    <section className="mx-auto mt-5 max-w-7xl px-4 sm:px-6">
      <div className="overflow-hidden rounded-[28px] border border-emerald-300/10 bg-[#05100b] shadow-[0_24px_70px_rgba(0,0,0,.22)]">
        <div className="border-b border-white/[.055] p-4 sm:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="text-[9px] font-black uppercase tracking-[.18em] text-emerald-200/48">Emerald Tree Boa programs</div>
              <h2 className="mt-2 text-xl font-semibold tracking-[-.035em] text-white sm:text-2xl">Live-bearing Corallus in Arboreal Keeper</h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-white/42">These animals use the shared facility budget and Keeper Level while keeping a separate live-bearing reproductive cycle. Every snake occupies its own enclosure.</p>
            </div>
            <div className="flex gap-2 text-[10px]">
              <span className="rounded-full border border-white/[.06] bg-black/20 px-3 py-1.5 text-white/45">Level {keeperLevel}</span>
              <span className="rounded-full border border-amber-200/10 bg-amber-200/[.035] px-3 py-1.5 text-amber-100/60">{money(cash)}</span>
            </div>
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {SPECIES.map((id) => {
              const definition = ARBOREAL_KEEPER_SPECIES_BY_ID[id];
              const isSelected = id === speciesId;
              const isUnlocked = keeperLevel >= definition.unlockLevel;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => chooseSpecies(id)}
                  className={`rounded-[20px] border px-4 py-3 text-left transition ${isSelected ? "border-emerald-300/20 bg-emerald-300/[.075]" : "border-white/[.055] bg-black/15 hover:bg-white/[.025]"}`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold text-white/78">{definition.displayName}</div>
                    <span className={`rounded-full px-2 py-1 text-[8px] font-black uppercase tracking-[.12em] ${isUnlocked ? "bg-emerald-300/[.08] text-emerald-100/55" : "bg-white/[.04] text-white/28"}`}>
                      {isUnlocked ? "Unlocked" : `Level ${definition.unlockLevel}`}
                    </span>
                  </div>
                  <div className="mt-1 text-[11px] italic text-white/30">{definition.scientificName}</div>
                </button>
              );
            })}
          </div>

          {message ? <div className="mt-4 rounded-2xl border border-white/[.055] bg-white/[.025] px-4 py-3 text-xs leading-5 text-white/55">{message}</div> : null}
        </div>

        {!unlocked ? (
          <div className="p-5 sm:p-6">
            <div className="rounded-[24px] border border-dashed border-white/[.08] bg-black/20 p-6 text-center">
              <div className="text-[10px] font-black uppercase tracking-[.16em] text-white/28">Program locked</div>
              <div className="mt-2 text-lg font-semibold text-white/70">Reach Keeper Level {species.unlockLevel}</div>
              <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-white/35">The species is already installed in the game data and will become available through normal progression.</p>
            </div>
          </div>
        ) : (
          <div className="p-4 sm:p-5">
            {mode === "market" ? (
              <MarketView
                market={market}
                purchasedOfferIds={save.purchasedOfferIds}
                save={save}
                onBuy={buyAnimal}
              />
            ) : null}
            {mode === "colony" ? (
              <ColonyView
                animals={animalsForSpecies}
                save={save}
                onGrow={growAnimal}
                onSell={sellAnimal}
              />
            ) : null}
            {mode === "breeding" ? (
              <BreedingView
                speciesId={speciesId}
                currentJob={currentJob}
                animals={save.animals}
                females={females}
                males={males}
                damId={damId}
                sireId={sireId}
                now={now}
                save={save}
                onDam={setDamId}
                onSire={setSireId}
                onStart={startPairing}
              />
            ) : null}
            {mode === "clutches" ? <LitterView save={save} speciesId={speciesId} /> : null}

            <HousingShop save={save} speciesId={speciesId} onBuy={buyHousing} />
          </div>
        )}
      </div>
    </section>
  );
}

function MarketView({
  market,
  purchasedOfferIds,
  save,
  onBuy,
}: {
  market: ReturnType<typeof emeraldMarketForEpoch>;
  purchasedOfferIds: string[];
  save: EmeraldKeeperSave;
  onBuy: (id: string) => void;
}) {
  return (
    <div>
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <div className="text-[9px] font-black uppercase tracking-[.16em] text-white/30">Animal Market</div>
          <h3 className="mt-1 text-lg font-semibold text-white/75">Rotating Emerald Tree Boa inventory</h3>
        </div>
        <div className="text-[10px] text-white/25">Daily rotation</div>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {market.map((offer) => {
          const sold = purchasedOfferIds.includes(offer.id);
          const housing = availableHousingUnit(save, offer.animal);
          return (
            <AnimalCard key={offer.id} animal={offer.animal}>
              <div className="mt-3 flex items-center justify-between gap-3">
                <div className="text-base font-semibold text-amber-100/75">{money(offer.price)}</div>
                <button
                  type="button"
                  disabled={sold || !housing}
                  onClick={() => onBuy(offer.id)}
                  className="rounded-xl border border-emerald-300/12 bg-emerald-300/[.07] px-3 py-2 text-[10px] font-bold text-emerald-100/65 disabled:cursor-not-allowed disabled:opacity-35"
                >
                  {sold ? "Purchased" : housing ? "Buy animal" : "Needs enclosure"}
                </button>
              </div>
            </AnimalCard>
          );
        })}
      </div>
    </div>
  );
}

function ColonyView({
  animals,
  save,
  onGrow,
  onSell,
}: {
  animals: EmeraldAnimal[];
  save: EmeraldKeeperSave;
  onGrow: (id: string) => void;
  onSell: (id: string) => void;
}) {
  if (!animals.length) {
    return <EmptyState title="No Emerald Tree Boas in this program yet." detail="Buy a compatible enclosure, then acquire an animal from the Animal Market." />;
  }
  return (
    <div>
      <div className="mb-3">
        <div className="text-[9px] font-black uppercase tracking-[.16em] text-white/30">My Animals</div>
        <h3 className="mt-1 text-lg font-semibold text-white/75">Individually housed Emerald Tree Boas</h3>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {animals.map((animal) => {
          const unit = save.housingUnits.find((item) => item.occupantId === animal.id);
          const enclosure = ARBOREAL_KEEPER_ENCLOSURES.find((item) => item.id === unit?.enclosureId);
          return (
            <AnimalCard key={animal.id} animal={animal}>
              <div className="mt-3 rounded-xl border border-white/[.05] bg-black/20 px-3 py-2 text-[10px] text-white/38">
                Housing · {enclosure?.displayName ?? "Unassigned"}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {animal.lifeStage !== "adult" ? (
                  <button type="button" onClick={() => onGrow(animal.id)} className="rounded-xl border border-emerald-300/12 bg-emerald-300/[.06] px-3 py-2 text-[10px] font-bold text-emerald-100/60">
                    Raise to next stage · {money(growthCostForEmerald(animal))}
                  </button>
                ) : null}
                <button type="button" onClick={() => onSell(animal.id)} className="rounded-xl border border-white/[.07] bg-white/[.025] px-3 py-2 text-[10px] font-bold text-white/45">
                  Sell to market
                </button>
              </div>
            </AnimalCard>
          );
        })}
      </div>
    </div>
  );
}

function BreedingView({
  speciesId,
  currentJob,
  animals,
  females,
  males,
  damId,
  sireId,
  now,
  save,
  onDam,
  onSire,
  onStart,
}: {
  speciesId: EmeraldSpeciesId;
  currentJob: EmeraldBreedingJob | null;
  animals: EmeraldAnimal[];
  females: EmeraldAnimal[];
  males: EmeraldAnimal[];
  damId: string;
  sireId: string;
  now: number;
  save: EmeraldKeeperSave;
  onDam: (id: string) => void;
  onSire: (id: string) => void;
  onStart: () => void;
}) {
  const stageIndex = currentJob ? EMERALD_BREEDING_STAGES.findIndex((stage) => stage.id === currentJob.stage) : -1;
  const birthPreview = currentJob
    ? (() => {
        const dam = animals.find((animal) => animal.id === currentJob.damId);
        const sire = animals.find((animal) => animal.id === currentJob.sireId);
        if (!dam || !sire) return null;
        return generateEmeraldLitter({ dam, sire, seed: currentJob.seed, bornAt: currentJob.completesAt });
      })()
    : null;
  const openNeonateHousing = save.housingUnits.filter(
    (unit) => unit.occupantId === null && enclosureSupportsAnimal(unit.enclosureId, speciesId, "neonate"),
  ).length;
  const housingNeeded = currentJob?.stage === "birth" && birthPreview
    ? Math.max(0, birthPreview.length - openNeonateHousing)
    : 0;

  return (
    <div>
      <div className="grid gap-3 lg:grid-cols-[1fr_.9fr]">
        <div className="rounded-[22px] border border-white/[.055] bg-black/20 p-4">
          <div className="text-[9px] font-black uppercase tracking-[.15em] text-white/30">Breeder selection</div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="text-xs text-white/45">
              Female
              <select value={damId} onChange={(event) => onDam(event.target.value)} className="mt-2 w-full rounded-xl border border-white/[.08] bg-[#07110d] px-3 py-2.5 text-sm text-white/70">
                <option value="">Choose female</option>
                {females.map((animal) => <option key={animal.id} value={animal.id}>{animal.name} · G{animal.generation}</option>)}
              </select>
            </label>
            <label className="text-xs text-white/45">
              Male
              <select value={sireId} onChange={(event) => onSire(event.target.value)} className="mt-2 w-full rounded-xl border border-white/[.08] bg-[#07110d] px-3 py-2.5 text-sm text-white/70">
                <option value="">Choose male</option>
                {males.map((animal) => <option key={animal.id} value={animal.id}>{animal.name} · G{animal.generation}</option>)}
              </select>
            </label>
          </div>
          <button type="button" disabled={Boolean(currentJob) || !damId || !sireId} onClick={onStart} className="mt-4 rounded-xl border border-emerald-300/12 bg-emerald-300/[.075] px-4 py-2.5 text-[11px] font-bold text-emerald-100/65 disabled:cursor-not-allowed disabled:opacity-35">
            Start live-bearing cycle · {money(breedingCost(speciesId))}
          </button>
          {!females.length || !males.length ? <div className="mt-3 text-[11px] leading-5 text-white/30">You need at least one adult female and one adult male of this species.</div> : null}
        </div>

        <div className="rounded-[22px] border border-white/[.055] bg-black/20 p-4">
          <div className="text-[9px] font-black uppercase tracking-[.15em] text-white/30">Reproductive cycle</div>
          {currentJob ? (
            <>
              <div className="mt-2 flex items-center justify-between gap-3">
                <div className="text-base font-semibold text-white/72">{breedingStageLabel(currentJob.stage)}</div>
                <div className="text-xs text-emerald-100/45">{currentJob.completesAt <= now ? "Ready" : remaining(currentJob.completesAt - now)}</div>
              </div>
              <div className="mt-4 grid grid-cols-4 gap-1.5">
                {EMERALD_BREEDING_STAGES.map((stage, index) => (
                  <div key={stage.id} className={`rounded-xl border px-2 py-2 text-center text-[9px] ${index <= stageIndex ? "border-emerald-300/14 bg-emerald-300/[.06] text-emerald-100/55" : "border-white/[.05] bg-white/[.018] text-white/22"}`}>{stage.label}</div>
                ))}
              </div>
              {housingNeeded > 0 ? (
                <div className="mt-3 rounded-xl border border-amber-200/12 bg-amber-200/[.035] px-3 py-2 text-[11px] leading-5 text-amber-100/55">
                  Birth is ready, but this litter needs {housingNeeded} more individual neonate enclosure{housingNeeded === 1 ? "" : "s"}. No neonates will be cohabitated.
                </div>
              ) : null}
            </>
          ) : (
            <div className="mt-3 text-sm leading-6 text-white/34">No active cycle for this species. Pairing, ovulation, gestation and birth progress on real-time timers.</div>
          )}
        </div>
      </div>
      <div className="mt-3 rounded-2xl border border-white/[.05] bg-white/[.018] px-4 py-3 text-[10px] leading-5 text-white/30">
        Anaconda Phase inheritance is currently a gameplay placeholder while the final project inheritance rules are being locked. Anaconda neonates are always generated green.
      </div>
    </div>
  );
}

function LitterView({ save, speciesId }: { save: EmeraldKeeperSave; speciesId: EmeraldSpeciesId }) {
  const litters = save.litters.filter((litter) => litter.speciesId === speciesId);
  if (!litters.length) {
    return <EmptyState title="No live litters recorded yet." detail="Completed Emerald Tree Boa breeding cycles will appear here with offspring retained in My Animals." />;
  }
  return (
    <div>
      <div className="text-[9px] font-black uppercase tracking-[.16em] text-white/30">Litter history</div>
      <h3 className="mt-1 text-lg font-semibold text-white/75">Live-born offspring records</h3>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        {litters.slice(0, 8).map((litter) => {
          const offspring = save.animals.filter((animal) => litter.offspringIds.includes(animal.id));
          return (
            <div key={litter.id} className="rounded-[20px] border border-white/[.055] bg-black/20 p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-semibold text-white/70">{offspring.length} offspring</div>
                <div className="text-[10px] text-white/28">{new Date(litter.bornAt).toLocaleDateString()}</div>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {offspring.map((animal) => (
                  <span key={animal.id} className="rounded-full border border-white/[.05] bg-white/[.02] px-2 py-1 text-[9px] text-white/42">
                    {animal.sex} · {animal.neonateColor ?? "neo"}{animal.phase === "anaconda" ? " · Anaconda" : ""}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function HousingShop({
  save,
  speciesId,
  onBuy,
}: {
  save: EmeraldKeeperSave;
  speciesId: EmeraldSpeciesId;
  onBuy: (id: KeeperEnclosureId) => void;
}) {
  return (
    <div className="mt-5 border-t border-white/[.055] pt-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <div className="text-[9px] font-black uppercase tracking-[.16em] text-white/28">Housing</div>
          <h3 className="mt-1 text-base font-semibold text-white/68">Individual enclosure inventory</h3>
        </div>
        <div className="text-[10px] text-white/25">{save.housingUnits.filter((unit) => unit.occupantId === null).length} empty</div>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {HOUSING_SHOP_IDS.map((id) => {
          const enclosure = ARBOREAL_KEEPER_ENCLOSURES.find((item) => item.id === id);
          if (!enclosure) return null;
          const compatible = Boolean(enclosure.compatibleSpecies[speciesId]);
          const count = save.housingUnits.filter((unit) => unit.enclosureId === id).length;
          return (
            <div key={id} className={`rounded-[18px] border p-3 ${compatible ? "border-white/[.055] bg-black/20" : "border-white/[.035] bg-black/10 opacity-45"}`}>
              <div className="text-xs font-semibold text-white/62">{enclosure.displayName}</div>
              <div className="mt-1 text-[10px] text-white/28">Owned {count} · Capacity 1</div>
              <div className="mt-3 flex items-center justify-between gap-2">
                <span className="text-xs text-amber-100/55">{money(enclosure.price)}</span>
                <button type="button" disabled={!compatible} onClick={() => onBuy(id)} className="rounded-lg border border-white/[.065] bg-white/[.025] px-2.5 py-1.5 text-[9px] font-bold text-white/48 disabled:cursor-not-allowed disabled:opacity-30">Buy</button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AnimalCard({ animal, children }: { animal: EmeraldAnimal; children?: React.ReactNode }) {
  const [imageFailed, setImageFailed] = useState(false);
  const strongestTraits = Object.entries(animal.traits)
    .sort(([, a], [, b]) => Number(b ?? 0) - Number(a ?? 0))
    .slice(0, 3);

  return (
    <article className="overflow-hidden rounded-[22px] border border-white/[.06] bg-[#07110d] p-3">
      <EmeraldPortrait animal={animal} failed={imageFailed} onFail={() => setImageFailed(true)} />
      <div className="mt-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-white/78">{animal.name}</div>
            <div className="mt-1 text-[10px] text-white/30">{animal.sex} · {animal.lifeStage} · G{animal.generation}</div>
          </div>
          {animal.phase === "anaconda" ? <span className="rounded-full border border-lime-300/12 bg-lime-300/[.05] px-2 py-1 text-[8px] font-black uppercase tracking-[.1em] text-lime-100/60">Anaconda</span> : null}
        </div>
        {animal.neonateColor ? <div className="mt-2 text-[10px] uppercase tracking-[.12em] text-white/28">Neonate · {animal.neonateColor}</div> : null}
        <div className="mt-3 flex flex-wrap gap-1.5">
          {strongestTraits.map(([key, value]) => (
            <span key={key} className="rounded-full border border-white/[.05] bg-black/20 px-2 py-1 text-[9px] text-white/38">
              {EMERALD_TRAIT_LABELS[key as keyof typeof EMERALD_TRAIT_LABELS] ?? key} {Math.round(Number(value ?? 0))}%
            </span>
          ))}
        </div>
      </div>
      {children}
    </article>
  );
}

function EmeraldPortrait({ animal, failed }: { animal: EmeraldAnimal; failed: boolean; onFail: () => void }) {
  const spriteStyle = emeraldArtStyleForAnimal(animal.speciesId, animal.lifeStage, animal.phase, animal.neonateColor, animal.assetId);

  return (
    <div className="relative aspect-square overflow-hidden rounded-[18px] border border-white/[.055] bg-[radial-gradient(circle_at_50%_38%,rgba(52,211,153,.12),transparent_42%),#020605]">
      {spriteStyle && !failed ? (
        <>
{spriteStyle ? (
            <div
              role="img"
              aria-label={emeraldSpeciesDisplayName(animal.speciesId) + " game asset"}
              className="absolute inset-0"
              style={spriteStyle}
            />
          ) : null}
        </>
      ) : (
        <div className="absolute inset-0 grid place-items-center p-5 text-center">
          <div>
            <div className="mx-auto grid h-16 w-16 place-items-center rounded-full border border-emerald-300/10 bg-emerald-300/[.04] text-2xl text-emerald-100/40">◆</div>
            <div className="mt-3 text-[10px] font-black uppercase tracking-[.15em] text-white/30">Asset unavailable</div>
            <div className="mt-1 text-xs text-white/22">{animal.assetId ?? "Emerald artwork unavailable"}</div>
          </div>
        </div>
      )}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/55 to-transparent" />
    </div>
  );
}

function EmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="rounded-[22px] border border-dashed border-white/[.07] bg-black/15 px-5 py-8 text-center">
      <div className="text-sm font-semibold text-white/60">{title}</div>
      <div className="mx-auto mt-2 max-w-xl text-xs leading-5 text-white/30">{detail}</div>
    </div>
  );
}
