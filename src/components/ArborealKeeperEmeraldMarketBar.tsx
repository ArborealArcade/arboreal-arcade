"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ARBOREAL_KEEPER_ENCLOSURES,
  enclosureSupportsAnimal,
  type KeeperEnclosureId,
} from "@/lib/arboreal-keeper-enclosures";
import {
  EMPTY_EMERALD_KEEPER_SAVE,
  EMERALD_KEEPER_SAVE_KEY,
  EMERALD_MARKET_DAY_MS,
  EMERALD_TRAIT_LABELS,
  availableHousingUnit,
  emeraldMarketForEpoch,
  emeraldSpeciesDisplayName,
  sanitizeEmeraldKeeperSave,
  type EmeraldAnimal,
  type EmeraldKeeperSave,
} from "@/lib/arboreal-keeper-emerald-engine";
import { keeperLevelFromReputation } from "@/lib/arboreal-keeper-progression";
import { emeraldArtStyleForAnimal } from "@/lib/arboreal-keeper-emerald-art";
import { ARBOREAL_KEEPER_SPECIES_BY_ID } from "@/lib/arboreal-keeper-species";

const CHONDRO_SAVE_KEY = "arboreal_chondro_breeder_v2";
const SAVE_EVENT = "arboreal-keeper-emerald-save-updated";
const LOAD_EVENT = "arboreal-keeper-emerald-cloud-loaded";
const ECONOMY_EVENT = "arboreal-keeper-economy-action";
const ECONOMY_UPDATED_EVENT = "arboreal-keeper-economy-updated";

const HOUSING_IDS: KeeperEnclosureId[] = [
  "chondro-dojo-bin",
  "pvc-arboreal-medium",
];

type EconomyAction = {
  action: "spend" | "credit" | "reputation";
  amount: number;
  reason: string;
  approved: boolean;
  balance?: number;
};

function money(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

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
  window.dispatchEvent(new CustomEvent<EconomyAction>(ECONOMY_EVENT, { detail }));
  return detail;
}

function readEmeraldSave() {
  try {
    const raw = window.localStorage.getItem(EMERALD_KEEPER_SAVE_KEY);
    return raw ? sanitizeEmeraldKeeperSave(JSON.parse(raw)) : EMPTY_EMERALD_KEEPER_SAVE;
  } catch {
    return EMPTY_EMERALD_KEEPER_SAVE;
  }
}

function persistEmeraldSave(save: EmeraldKeeperSave) {
  const snapshot = { ...save, updatedAt: Date.now() };
  window.localStorage.setItem(EMERALD_KEEPER_SAVE_KEY, JSON.stringify(snapshot));
  window.dispatchEvent(new CustomEvent(SAVE_EVENT, { detail: { save: snapshot } }));
  return snapshot;
}

function strongestTraits(animal: EmeraldAnimal) {
  return Object.entries(animal.traits)
    .map(([key, value]) => ({
      label: EMERALD_TRAIT_LABELS[key as keyof typeof EMERALD_TRAIT_LABELS] ?? key,
      value: Number(value ?? 0),
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 3);
}

function compatibleEmptyHousingCount(save: EmeraldKeeperSave, animal: EmeraldAnimal) {
  return save.housingUnits.filter(
    (unit) =>
      unit.occupantId === null &&
      enclosureSupportsAnimal(unit.enclosureId, animal.speciesId, animal.lifeStage),
  ).length;
}

export function ArborealKeeperEmeraldMarketBar() {
  const [save, setSave] = useState<EmeraldKeeperSave>(EMPTY_EMERALD_KEEPER_SAVE);
  const [cash, setCash] = useState(30000);
  const [reputation, setReputation] = useState(0);
  const [now, setNow] = useState(0);
  const [hydrated, setHydrated] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSave(readEmeraldSave());
      const progress = readSharedProgress();
      setCash(progress.cash);
      setReputation(progress.reputation);
      setNow(Date.now());
      setHydrated(true);
    }, 0);

    const clock = window.setInterval(() => setNow(Date.now()), 60_000);

    function handleCloudLoad(event: Event) {
      const detail = (event as CustomEvent<{ save?: unknown }>).detail;
      if (!detail?.save) return;
      setSave(sanitizeEmeraldKeeperSave(detail.save));
    }

    function handleEconomyUpdate(event: Event) {
      const detail = (event as CustomEvent<{ cash?: number; reputation?: number }>).detail;
      if (typeof detail?.cash === "number") setCash(detail.cash);
      if (typeof detail?.reputation === "number") setReputation(detail.reputation);
      if (typeof detail?.cash !== "number" || typeof detail?.reputation !== "number") {
        const progress = readSharedProgress();
        if (typeof detail?.cash !== "number") setCash(progress.cash);
        if (typeof detail?.reputation !== "number") setReputation(progress.reputation);
      }
    }

    window.addEventListener(LOAD_EVENT, handleCloudLoad);
    window.addEventListener(ECONOMY_UPDATED_EVENT, handleEconomyUpdate);
    return () => {
      window.clearTimeout(timer);
      window.clearInterval(clock);
      window.removeEventListener(LOAD_EVENT, handleCloudLoad);
      window.removeEventListener(ECONOMY_UPDATED_EVENT, handleEconomyUpdate);
    };
  }, []);

  const keeperLevel = keeperLevelFromReputation(reputation);
  const marketEpoch = Math.floor(now / EMERALD_MARKET_DAY_MS);
  const offers = useMemo(
    () => emeraldMarketForEpoch(marketEpoch, keeperLevel),
    [keeperLevel, marketEpoch],
  );
  const purchased = useMemo(() => new Set(save.purchasedOfferIds), [save.purchasedOfferIds]);

  function spend(amount: number, reason: string) {
    const result = requestEconomyAction("spend", amount, reason);
    if (!result.approved) {
      setStatus(`You need ${money(amount)} available in the shared facility budget.`);
      return false;
    }
    if (typeof result.balance === "number") setCash(result.balance);
    return true;
  }

  function buyHousing(enclosureId: KeeperEnclosureId) {
    const enclosure = ARBOREAL_KEEPER_ENCLOSURES.find((item) => item.id === enclosureId);
    if (!enclosure || busy) return;
    setBusy(`housing:${enclosureId}`);
    try {
      if (!spend(enclosure.price, `Purchase ${enclosure.displayName}`)) return;
      const next = persistEmeraldSave({
        ...save,
        housingUnits: [
          ...save.housingUnits,
          {
            id: `keeper-housing-${enclosureId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            enclosureId,
            occupantId: null,
          },
        ],
      });
      setSave(next);
      setStatus(`${enclosure.displayName} added. It can house one compatible animal.`);
    } finally {
      setBusy(null);
    }
  }

  function buyAnimal(offerId: string) {
    const offer = offers.find((item) => item.id === offerId);
    if (!offer || purchased.has(offer.id) || busy) return;
    const unit = availableHousingUnit(save, offer.animal);
    if (!unit) {
      setStatus(`This ${offer.animal.lifeStage} needs its own empty compatible enclosure first.`);
      return;
    }

    setBusy(offer.id);
    try {
      if (!spend(offer.price, `Purchase ${emeraldSpeciesDisplayName(offer.animal.speciesId)}`)) return;
      const next = persistEmeraldSave({
        ...save,
        animals: [...save.animals, offer.animal],
        purchasedOfferIds: [...save.purchasedOfferIds, offer.id],
        housingUnits: save.housingUnits.map((housing) =>
          housing.id === unit.id ? { ...housing, occupantId: offer.animal.id } : housing,
        ),
      });
      setSave(next);
      requestEconomyAction("reputation", 8, "Emerald Tree Boa acquisition");
      setStatus(`${offer.animal.sex} ${emeraldSpeciesDisplayName(offer.animal.speciesId)} added to My Animals.`);
    } finally {
      setBusy(null);
    }
  }

  if (!hydrated) {
    return (
      <div className="mx-auto max-w-7xl px-5 pt-4 sm:px-6">
        <div className="rounded-[24px] border border-white/[.06] bg-white/[.02] p-5 text-sm text-white/40">
          Loading Emerald Tree Boa market…
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-5 pt-4 sm:px-6">
      <section className="rounded-[24px] border border-emerald-300/15 bg-[radial-gradient(circle_at_top_left,rgba(52,211,153,.07),transparent_36%),rgba(52,211,153,.025)] p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[.16em] text-emerald-100/55">Emerald Tree Boas</div>
            <h3 className="mt-2 text-xl font-semibold text-white/82">Northern + Amazon Basin listings</h3>
            <p className="mt-1 text-xs leading-5 text-white/38">
              A separate horizontal market directly beneath the Green Tree Python store. Every Emerald Tree Boa requires its own enclosure.
            </p>
          </div>
          <div className="rounded-xl border border-emerald-300/12 bg-black/15 px-4 py-2 text-right">
            <div className="text-[9px] font-black uppercase tracking-[.13em] text-emerald-100/40">Keeper level</div>
            <div className="mt-1 text-sm font-black text-emerald-100/75">Level {keeperLevel} · {money(cash)}</div>
          </div>
        </div>

        {offers.length ? (
          <>
            <div className="mt-4 flex items-center justify-between gap-3 text-[10px] text-white/32">
              <span>Swipe to browse {offers.length} Emerald listings</span>
              <span>Northern unlock L8 · Basin unlock L18</span>
            </div>

            <div
              aria-label="Scrollable Emerald Tree Boa store listings"
              className="mt-4 flex snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain pb-3 [scrollbar-width:thin] [scrollbar-color:rgba(110,231,183,.28)_transparent]"
            >
              {offers.map((offer) => {
                const sold = purchased.has(offer.id);
                const housing = compatibleEmptyHousingCount(save, offer.animal);
                const traits = strongestTraits(offer.animal);
                const spriteStyle = emeraldArtStyleForAnimal(offer.animal.speciesId, offer.animal.lifeStage, offer.animal.phase, offer.animal.neonateColor, offer.animal.assetId);
                const requiredLevel = ARBOREAL_KEEPER_SPECIES_BY_ID[offer.animal.speciesId].unlockLevel;
                const locked = !offer.available;
                const showImage = Boolean(spriteStyle);
                return (
                  <article
                    key={offer.id}
                    className="w-[82%] shrink-0 snap-start overflow-hidden rounded-2xl border border-white/[.06] bg-black/10 sm:w-[48%] lg:w-[calc((100%-1.5rem)/3)]"
                  >
                    <div className="relative aspect-square overflow-hidden border-b border-white/[.055] bg-[radial-gradient(circle_at_50%_35%,rgba(110,231,183,.09),transparent_46%),#06100c]">
                      {showImage ? (
                        <>
{spriteStyle ? (
                            <div
                              role="img"
                              aria-label={emeraldSpeciesDisplayName(offer.animal.speciesId) + " " + offer.animal.lifeStage}
                              className="absolute inset-0"
                              style={spriteStyle}
                            />
                          ) : null}
                        </>
                      ) : (
                        <div className="absolute inset-0 grid place-items-center p-7 text-center">
                          <div>
                            <div className="text-5xl text-emerald-200/30">◒</div>
                            <div className="mt-3 text-[10px] font-black uppercase tracking-[.14em] text-emerald-100/35">Emerald asset slot</div>
                            <div className="mt-1 text-xs text-white/25">{offer.animal.assetId ?? "Artwork pending"}</div>
                          </div>
                        </div>
                      )}
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/45 to-transparent px-3 pb-3 pt-10">
                        <div className="text-sm font-semibold text-white/90">{emeraldSpeciesDisplayName(offer.animal.speciesId)}</div>
                        <div className="mt-0.5 text-[10px] text-white/45">{offer.animal.sex} · {offer.animal.lifeStage} · {offer.animal.condition}</div>
                      </div>
                    </div>

                    <div className="p-3">
                      <div className="flex flex-wrap gap-1.5">
                        {locked ? <span className="rounded-full border border-amber-200/15 bg-amber-200/[.05] px-2 py-1 text-[9px] font-black uppercase tracking-[.08em] text-amber-100/70">Unlocks Level {requiredLevel}</span> : null}
                        {offer.animal.phase === "anaconda" ? (
                          <span className="rounded-full border border-lime-200/15 bg-lime-200/[.05] px-2 py-1 text-[9px] font-black uppercase tracking-[.08em] text-lime-100/70">Anaconda Phase</span>
                        ) : null}
                        {offer.animal.neonateColor ? (
                          <span className="rounded-full border border-white/[.07] bg-white/[.025] px-2 py-1 text-[9px] font-semibold capitalize text-white/50">{offer.animal.neonateColor} neonate</span>
                        ) : null}
                      </div>

                      <div className="mt-3 rounded-xl border border-white/[.055] bg-black/15 p-2 text-[10px] leading-5 text-white/42">
                        {traits.map((trait) => (
                          <div key={trait.label} className="flex justify-between gap-2">
                            <span>{trait.label}</span>
                            <span className="font-semibold text-white/65">{trait.value}%</span>
                          </div>
                        ))}
                      </div>

                      <div className="mt-3 flex items-center justify-between gap-2">
                        <div>
                          <div className="text-base font-semibold text-emerald-200/80">{money(offer.price)}</div>
                          <div className="mt-0.5 text-[9px] text-white/28">{housing} compatible enclosure{housing === 1 ? "" : "s"} open</div>
                        </div>
                        <button
                          type="button"
                          disabled={locked || sold || busy !== null || cash < offer.price || housing <= 0}
                          onClick={() => buyAnimal(offer.id)}
                          className="rounded-lg bg-amber-200 px-3 py-2 text-[10px] font-black text-[#17130a] disabled:opacity-30"
                        >
                          {locked ? "Level " + requiredLevel : sold ? "Purchased" : housing <= 0 ? "Need space" : cash < offer.price ? "Need cash" : busy === offer.id ? "Buying…" : "Buy"}
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </>
        ) : (
          <div className="mt-4 rounded-2xl border border-emerald-300/10 bg-black/15 p-4 text-sm text-white/42">
            Emerald Tree Boas are visible as a market program, but your next species unlock has not been reached yet. Northern Emeralds unlock at Keeper Level 8; Amazon Basins unlock at Level 18.
          </div>
        )}

        <div className="mt-4 border-t border-white/[.055] pt-4">
          <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
            <div>
              <div className="text-[9px] font-black uppercase tracking-[.14em] text-white/28">Emerald housing</div>
              <div className="mt-1 text-xs text-white/42">Quick-buy an individual compatible enclosure without leaving the shop.</div>
            </div>
            <div className="text-[10px] text-white/28">Owned: {save.housingUnits.length}</div>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-2 [scrollbar-width:thin]">
            {HOUSING_IDS.map((id) => {
              const enclosure = ARBOREAL_KEEPER_ENCLOSURES.find((item) => item.id === id);
              if (!enclosure) return null;
              const compatibleNames = Object.keys(enclosure.compatibleSpecies).filter((key) => key.includes("emerald_tree_boa"));
              if (!compatibleNames.length) return null;
              return (
                <button
                  key={id}
                  type="button"
                  disabled={busy !== null || cash < enclosure.price}
                  onClick={() => buyHousing(id)}
                  className="min-w-[210px] rounded-2xl border border-white/[.06] bg-white/[.02] p-3 text-left transition hover:border-emerald-300/15 hover:bg-white/[.035] disabled:opacity-35"
                >
                  <div className="text-xs font-semibold text-white/70">{enclosure.displayName}</div>
                  <div className="mt-1 text-[10px] text-white/30">{enclosure.sizeClass} · one animal</div>
                  <div className="mt-2 text-sm font-semibold text-emerald-200/70">{money(enclosure.price)}</div>
                </button>
              );
            })}
          </div>
        </div>

        {status ? <div role="status" className="mt-3 text-xs text-emerald-100/65">{status}</div> : null}
      </section>
    </div>
  );
}
