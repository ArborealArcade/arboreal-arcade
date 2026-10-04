"use client";

import { useState } from "react";
import { geneticTestingUnlocked } from "@/lib/chondro-facility-limits";
import { CHONDRO_SPECIES_PROFILE, growthCostFor, growthRequirementFor } from "@/lib/breeder-species-profiles";

type Props = {
  animalId: string;
  initialName: string;
  initialNotes?: string;
  initialLifeStage: string;
  initialSex: string;
  favorite: boolean;
};

type PendingTest = { snakeId?: string; completesAt?: number };
type SaveAnimal = Record<string, unknown> & {
  id?: string;
  name?: string;
  notes?: string;
  source?: string;
  lifeStage?: string;
  sex?: string;
  condition?: string;
  nidoStatus?: string;
  geneticsTested?: boolean;
};
type RetiredBreeder = { animal: SaveAnimal; retiredSeason: number; retiredAt: string };
type SaveState = Record<string, unknown> & {
  cash?: number;
  colony?: SaveAnimal[];
  tested?: string[];
  geneticTestsPending?: PendingTest[];
  careerReputation?: number;
  facilityRooms?: Record<string, number>;
  season?: number;
  damId?: string;
  sireId?: string;
  breedingCycle?: { damId?: string; sireId?: string } | null;
  femaleRecovery?: Record<string, number>;
  favoriteIds?: string[];
  retiredBreeders?: RetiredBreeder[];
  enclosures?: Record<string, number>;
};

const LOCAL_SAVE_KEY = "arboreal_chondro_breeder_v2";
const NIDO_TEST_COST = 125;
const GENETIC_TEST_COST = 350;
const GENETIC_TEST_HOURS = 12;

async function loadSave() {
  let state: SaveState | null = null;
  let authenticated = false;
  try {
    const response = await fetch("/api/hatchery/chondro-breeder/save", { cache: "no-store" });
    const data = await response.json();
    authenticated = Boolean(data.authenticated);
    if (data.save?.state && typeof data.save.state === "object") state = data.save.state as SaveState;
  } catch {}
  if (!state) {
    try {
      const raw = window.localStorage.getItem(LOCAL_SAVE_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      if (parsed && typeof parsed === "object") state = parsed as SaveState;
    } catch {}
  }
  return { state, authenticated };
}

async function persistSave(state: SaveState, authenticated: boolean) {
  // Stamp updatedAt so the core game screen adopts this write through its
  // save-change listener instead of treating it as stale and overwriting it
  // with its own in-memory state (which silently reverted raises, renames,
  // and other record edits).
  const stamped = { ...state, updatedAt: Date.now() };
  try { window.localStorage.setItem(LOCAL_SAVE_KEY, JSON.stringify(stamped)); } catch {}
  if (authenticated) {
    const response = await fetch("/api/hatchery/chondro-breeder/save", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(stamped),
    });
    if (!response.ok) throw new Error("Cloud save failed");
  }
  window.dispatchEvent(new Event("arboreal-chondro-breeder-save-change"));
}

export function ChondroAnimalRecordActions({ animalId, initialName, initialNotes = "", initialLifeStage, initialSex, favorite }: Props) {
  const [name, setName] = useState(initialName);
  const [notes, setNotes] = useState(initialNotes);
  const [currentLifeStage, setCurrentLifeStage] = useState(initialLifeStage);
  const [isFavorite, setIsFavorite] = useState(favorite);
  const [listingPrice, setListingPrice] = useState(1500);
  const [busy, setBusy] = useState<"record" | "favorite" | "grow" | "nido" | "genetic" | "market" | "retire" | null>(null);
  const [status, setStatus] = useState("");

  const growthRequirement = growthRequirementFor(
    CHONDRO_SPECIES_PROFILE,
    currentLifeStage as never,
    initialSex as never,
  );
  const displayedGrowthCost = growthCostFor(
    CHONDRO_SPECIES_PROFILE,
    currentLifeStage as never,
    initialSex as never,
  );

  async function saveRecord() {
    const cleanName = name.trim();
    if (!cleanName || busy) return;
    setBusy("record");
    setStatus("");
    try {
      const { state, authenticated } = await loadSave();
      if (!state || !Array.isArray(state.colony)) throw new Error("No breeder save loaded");
      const next: SaveState = {
        ...state,
        colony: state.colony.map((animal) => String(animal.id ?? "") === animalId ? { ...animal, name: cleanName, notes } : animal),
      };
      await persistSave(next, authenticated);
      setStatus("Animal record saved.");
    } catch {
      setStatus("That record could not be saved.");
    } finally {
      setBusy(null);
    }
  }

  async function toggleFavorite() {
    if (busy) return;
    const nextFavorite = !isFavorite;
    setBusy("favorite");
    setStatus("");
    try {
      const response = await fetch("/api/hatchery/chondro-breeder/favorites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ snakeId: animalId, favorite: nextFavorite }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Favorite failed");
      setIsFavorite(nextFavorite);
      window.dispatchEvent(new Event("arboreal-chondro-favorites-change"));
      setStatus(nextFavorite ? "Protected as a favorite." : "Removed from favorites.");
    } catch {
      setStatus("Favorite status could not be changed.");
    } finally {
      setBusy(null);
    }
  }

  async function raiseAnimal() {
    if (busy) return;
    setBusy("grow");
    setStatus("");
    try {
      const { state, authenticated } = await loadSave();
      if (!state || !Array.isArray(state.colony)) throw new Error("No breeder save loaded");
      const animal = state.colony.find((item) => String(item.id ?? "") === animalId);
      if (!animal) throw new Error("Animal not found");

      const lifeStage = String(animal.lifeStage ?? currentLifeStage);
      const sex = String(animal.sex ?? initialSex);
      const requirement = growthRequirementFor(
        CHONDRO_SPECIES_PROFILE,
        lifeStage as never,
        sex as never,
      );
      if (!requirement) {
        setCurrentLifeStage(lifeStage);
        setStatus("This animal is already an adult and breeding eligible.");
        return;
      }

      const cost = growthCostFor(
        CHONDRO_SPECIES_PROFILE,
        lifeStage as never,
        sex as never,
      );

      const nextStage = String(requirement.next);
      if (nextStage === "Adult") {
        const dojoCapacity = Math.max(0, Number(state.enclosures?.["Chondro Dojo Bin"] ?? 0) || 0) * 2;
        const pvcCapacity = Math.max(0, Number(state.enclosures?.["PVC Arboreal"] ?? 0) || 0);
        const otherAnimals = state.colony.filter((item) => String(item.id ?? "") !== animalId);
        const olderAnimals = otherAnimals.filter((item) => item.lifeStage === "Adult").length;
        const juveniles = Math.max(0, otherAnimals.length - olderAnimals);
        const juvenileOverflowIntoPvc = Math.max(0, juveniles - dojoCapacity);
        const requiredPvc = olderAnimals + juvenileOverflowIntoPvc;

        if (pvcCapacity <= requiredPvc) {
          setStatus("An open PVC Arboreal Enclosure is required before this animal can be raised to adult.");
          return;
        }
      }

      const cash = Number(state.cash ?? 0);
      if (cash < cost) {
        setStatus(`Raising this animal costs ${cost.toLocaleString()}. You currently have ${cash.toLocaleString()}.`);
        return;
      }

      const next: SaveState = {
        ...state,
        cash: cash - cost,
        colony: state.colony.map((item) =>
          String(item.id ?? "") === animalId
            ? {
                ...item,
                lifeStage: nextStage,
                condition: item.condition === "Fair" ? "Good" : item.condition,
              }
            : item,
        ),
      };
      await persistSave(next, authenticated);
      setCurrentLifeStage(nextStage);
      setStatus(`Raised to ${nextStage}. The updated sprite and breeding eligibility will follow this life stage.`);
    } catch {
      setStatus("This animal could not be raised right now.");
    } finally {
      setBusy(null);
    }
  }

  async function runNidoTest() {
    if (busy) return;
    setBusy("nido");
    setStatus("");
    try {
      const { state, authenticated } = await loadSave();
      if (!state || !Array.isArray(state.colony)) throw new Error("No breeder save loaded");
      const animal = state.colony.find((item) => String(item.id ?? "") === animalId);
      if (!animal) throw new Error("Animal not found");
      if ((state.tested ?? []).includes(animalId) || animal.nidoStatus === "Negative" || animal.nidoStatus === "Positive") {
        setStatus(`Nido result: ${String(animal.nidoStatus ?? "already tested")}.`);
        return;
      }
      const cash = Number(state.cash ?? 0);
      if (cash < NIDO_TEST_COST) {
        setStatus(`Nido testing costs $${NIDO_TEST_COST}.`);
        return;
      }
      const positiveChance = animal.source === "Import" ? 0.12 : 0.018;
      const result = Math.random() < positiveChance ? "Positive" : "Negative";
      const next: SaveState = {
        ...state,
        cash: cash - NIDO_TEST_COST,
        tested: [...new Set([...(state.tested ?? []), animalId])],
        colony: state.colony.map((item) => String(item.id ?? "") === animalId ? { ...item, nidoStatus: result } : item),
      };
      await persistSave(next, authenticated);
      setStatus(`Nido test complete: ${result}.`);
    } catch {
      setStatus("Nido testing could not be completed.");
    } finally {
      setBusy(null);
    }
  }

  async function submitGeneticTest() {
    if (busy) return;
    setBusy("genetic");
    setStatus("");
    try {
      const { state, authenticated } = await loadSave();
      if (!state || !Array.isArray(state.colony)) throw new Error("No breeder save loaded");
      const animal = state.colony.find((item) => String(item.id ?? "") === animalId);
      if (!animal) throw new Error("Animal not found");
      if (animal.geneticsTested) {
        setStatus("Genetic panel is already complete.");
        return;
      }
      if ((state.geneticTestsPending ?? []).some((job) => job.snakeId === animalId)) {
        setStatus("Genetic panel is already pending.");
        return;
      }
      const unlocked = geneticTestingUnlocked({
        careerReputation: Number(state.careerReputation ?? 0),
        facilityRooms: state.facilityRooms ?? { "starter-room": 1 },
      });
      if (!unlocked) {
        setStatus("Genetic testing unlocks through breeder career/facility progression.");
        return;
      }
      const cash = Number(state.cash ?? 0);
      if (cash < GENETIC_TEST_COST) {
        setStatus(`Genetic testing costs $${GENETIC_TEST_COST}.`);
        return;
      }
      const next: SaveState = {
        ...state,
        cash: cash - GENETIC_TEST_COST,
        geneticTestsPending: [
          ...(state.geneticTestsPending ?? []),
          { snakeId: animalId, completesAt: Date.now() + GENETIC_TEST_HOURS * 3_600_000 },
        ],
      };
      await persistSave(next, authenticated);
      setStatus(`Genetic panel submitted. Results in ${GENETIC_TEST_HOURS} hours.`);
    } catch {
      setStatus("Genetic testing could not be started.");
    } finally {
      setBusy(null);
    }
  }

  async function listForSale() {
    if (busy || !Number.isFinite(listingPrice) || listingPrice < 100) return;
    setBusy("market");
    setStatus("");
    try {
      const response = await fetch("/api/hatchery/chondro-breeder/player-market", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "list", snakeId: animalId, price: Math.round(listingPrice) }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Listing failed");
      window.dispatchEvent(new Event("arboreal-chondro-breeder-save-change"));
      setStatus(`Listed for $${Math.round(listingPrice).toLocaleString()}. The 48-hour fallback applies if it remains unsold.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "The animal could not be listed.");
    } finally {
      setBusy(null);
    }
  }

  async function retireAnimal() {
    if (busy) return;
    const { state, authenticated } = await loadSave();
    if (!state || !Array.isArray(state.colony)) {
      setStatus("No breeder save is loaded.");
      return;
    }
    const animal = state.colony.find((item) => String(item.id ?? "") === animalId);
    if (!animal) {
      setStatus("This animal is no longer in the active colony.");
      return;
    }
    if (animal.lifeStage !== "Adult") {
      setStatus("Only adult animals can be retired to the breeder archive.");
      return;
    }
    if (state.breedingCycle?.damId === animalId || state.breedingCycle?.sireId === animalId) {
      setStatus("This animal is in an active breeding cycle and cannot be retired yet.");
      return;
    }
    if (!window.confirm(`Retire ${String(animal.name ?? animalId)} to the breeder archive?`)) return;
    setBusy("retire");
    setStatus("");
    try {
      const recovery = { ...(state.femaleRecovery ?? {}) };
      delete recovery[animalId];
      const next: SaveState = {
        ...state,
        colony: state.colony.filter((item) => String(item.id ?? "") !== animalId),
        damId: state.damId === animalId ? "" : state.damId,
        sireId: state.sireId === animalId ? "" : state.sireId,
        geneticTestsPending: (state.geneticTestsPending ?? []).filter((job) => job.snakeId !== animalId),
        femaleRecovery: recovery,
        favoriteIds: (state.favoriteIds ?? []).filter((id) => id !== animalId),
        retiredBreeders: [
          { animal, retiredSeason: Math.max(1, Number(state.season ?? 1)), retiredAt: new Date().toISOString() },
          ...(state.retiredBreeders ?? []).filter((record) => String(record.animal.id ?? "") !== animalId),
        ].slice(0, 250),
      };
      await persistSave(next, authenticated);
      setStatus("Breeder retired. Its enclosure slot is now open.");
    } catch {
      setStatus("Retirement could not be saved.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="rounded-2xl border border-emerald-300/10 bg-emerald-300/[.025] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="section-kicker">Animal record</div>
          <p className="mt-2 text-xs leading-5 text-white/40">Name, test, sell and manage this snake here instead of cluttering the Colony screen.</p>
        </div>
        <button type="button" disabled={busy !== null} onClick={() => void toggleFavorite()} className={`rounded-xl border px-3 py-2 text-[10px] font-black uppercase tracking-[.08em] transition disabled:opacity-40 ${isFavorite ? "border-amber-200/22 bg-amber-200/[.05] text-amber-100/80" : "border-white/[.08] text-white/48 hover:text-white/75"}`}>
          {isFavorite ? "★ Favorite" : "☆ Favorite"}
        </button>
      </div>

      <label className="mt-4 block">
        <span className="text-[9px] font-black uppercase tracking-[.12em] text-white/34">Name</span>
        <input value={name} maxLength={80} onChange={(event) => setName(event.target.value)} className="mt-2 w-full rounded-xl border border-white/[.08] bg-black/20 px-3 py-2.5 text-sm text-white/76 outline-none transition focus:border-emerald-300/25" />
      </label>
      <label className="mt-3 block">
        <span className="text-[9px] font-black uppercase tracking-[.12em] text-white/34">Notes</span>
        <textarea value={notes} maxLength={1200} rows={4} onChange={(event) => setNotes(event.target.value)} placeholder="Breeding notes, behavior, project goals, lineage reminders…" className="mt-2 w-full resize-y rounded-xl border border-white/[.08] bg-black/20 px-3 py-2.5 text-sm leading-6 text-white/70 outline-none transition placeholder:text-white/20 focus:border-emerald-300/25" />
      </label>
      <div className="mt-3 flex justify-end">
        <button type="button" disabled={busy !== null || !name.trim()} onClick={() => void saveRecord()} className="rounded-xl border border-emerald-300/18 bg-emerald-300/[.055] px-4 py-2 text-[10px] font-black uppercase tracking-[.08em] text-emerald-100/80 transition hover:bg-emerald-300/[.09] disabled:opacity-35">{busy === "record" ? "Saving…" : "Save record"}</button>
      </div>

      <div className="mt-5 border-t border-white/[.06] pt-4">
        <div className="text-[9px] font-black uppercase tracking-[.12em] text-white/34">Care & growth</div>
        {growthRequirement ? (
          <div className="mt-3 rounded-2xl border border-amber-200/15 bg-amber-200/[.035] p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-amber-50/82">{currentLifeStage} → {String(growthRequirement.next)}</div>
                <div className="mt-1 text-[10px] leading-5 text-white/40">{growthRequirement.feederUnits} feeder units · {growthRequirement.months} months of care</div>
              </div>
              <div className="text-sm font-semibold text-amber-100/75">{"$" + displayedGrowthCost.toLocaleString()}</div>
            </div>
            <button type="button" disabled={busy !== null} onClick={() => void raiseAnimal()} className="mt-3 w-full rounded-xl border border-amber-200/20 bg-amber-200/[.08] px-4 py-3 text-xs font-black uppercase tracking-[.06em] text-amber-50/85 transition hover:bg-amber-200/[.13] disabled:opacity-35">
              {busy === "grow" ? "Raising…" : `Raise to ${String(growthRequirement.next)}`}
            </button>
          </div>
        ) : (
          <div className="mt-3 rounded-2xl border border-emerald-300/12 bg-emerald-300/[.03] p-4 text-xs leading-5 text-emerald-100/65">
            Adult · breeding eligible. Use the <strong>Breed</strong> tab when you are ready to pair this animal.
          </div>
        )}
      </div>

      <div className="mt-5 border-t border-white/[.06] pt-4">
        <div className="text-[9px] font-black uppercase tracking-[.12em] text-white/34">Health & genetics</div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button type="button" disabled={busy !== null} onClick={() => void runNidoTest()} className="rounded-xl border border-white/[.08] bg-white/[.02] px-3 py-3 text-left text-[10px] font-bold text-white/58 transition hover:border-emerald-300/16 disabled:opacity-35">Nido test <span className="block pt-1 text-[9px] font-normal text-white/28">$125 · instant</span></button>
          <button type="button" disabled={busy !== null} onClick={() => void submitGeneticTest()} className="rounded-xl border border-white/[.08] bg-white/[.02] px-3 py-3 text-left text-[10px] font-bold text-white/58 transition hover:border-emerald-300/16 disabled:opacity-35">Genetic panel <span className="block pt-1 text-[9px] font-normal text-white/28">$350 · 12 hours</span></button>
        </div>
      </div>

      <div className="mt-5 border-t border-white/[.06] pt-4">
        <div className="text-[9px] font-black uppercase tracking-[.12em] text-white/34">Disposition</div>
        <div className="mt-3 flex gap-2">
          <label className="min-w-0 flex-1">
            <span className="sr-only">Listing price</span>
            <div className="flex rounded-xl border border-white/[.08] bg-black/20 focus-within:border-emerald-300/20"><span className="px-3 py-2.5 text-sm text-white/28">$</span><input type="number" min={100} step={25} value={listingPrice} onChange={(event) => setListingPrice(Number(event.target.value))} className="min-w-0 flex-1 bg-transparent py-2.5 pr-3 text-sm text-white/72 outline-none" /></div>
          </label>
          <button type="button" disabled={busy !== null || listingPrice < 100} onClick={() => void listForSale()} className="rounded-xl border border-emerald-300/18 bg-emerald-300/[.05] px-4 py-2 text-[10px] font-black uppercase tracking-[.06em] text-emerald-100/72 disabled:opacity-35">{busy === "market" ? "Listing…" : "List"}</button>
        </div>
        <button type="button" disabled={busy !== null} onClick={() => void retireAnimal()} className="mt-2 w-full rounded-xl border border-amber-200/12 bg-amber-200/[.025] px-4 py-2.5 text-[10px] font-black uppercase tracking-[.06em] text-amber-100/55 transition hover:bg-amber-200/[.045] disabled:opacity-35">{busy === "retire" ? "Retiring…" : "Retire adult breeder"}</button>
      </div>

      <div role="status" aria-live="polite" className="mt-4 min-h-5 text-[10px] leading-5 text-emerald-100/60">{status}</div>
    </section>
  );
}
