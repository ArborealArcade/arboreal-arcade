"use client";

import { useEffect, useMemo, useState } from "react";

const LOCAL_SAVE_KEY = "arboreal_chondro_breeder_v2";

type SnakeRecord = {
  id: string;
  name?: string;
  sex?: string;
  lifeStage?: string;
  subspecies?: string;
  locality?: string;
  generation?: number;
  breederInitials?: string | null;
  geneticsTested?: boolean;
};

type RetiredBreeder = {
  animal: SnakeRecord;
  retiredSeason: number;
  retiredAt: string;
};

type SaveState = Record<string, unknown> & {
  colony?: SnakeRecord[];
  season?: number;
  damId?: string;
  sireId?: string;
  breedingCycle?: { damId?: string; sireId?: string } | null;
  geneticTestsPending?: Array<{ snakeId?: string; completesAt?: number }>;
  femaleRecovery?: Record<string, number>;
  favoriteIds?: string[];
  retiredBreeders?: RetiredBreeder[];
};

function readLocalSave(): SaveState | null {
  try {
    const raw = window.localStorage.getItem(LOCAL_SAVE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as SaveState : null;
  } catch {
    return null;
  }
}

export function ChondroRetiredBreedersPanel() {
  const [save, setSave] = useState<SaveState | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [status, setStatus] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      let chosen = readLocalSave();
      try {
        const response = await fetch("/api/hatchery/chondro-breeder/save", { cache: "no-store" });
        if (response.ok) {
          const data = await response.json();
          const state = data?.save?.state;
          if (state && typeof state === "object" && !Array.isArray(state)) chosen = state as SaveState;
        }
      } catch {}
      if (!cancelled) {
        setSave(chosen);
        setLoading(false);
      }
    }
    void load();
    const refresh = () => void load();
    window.addEventListener("arboreal-chondro-breeder-save-change", refresh);
    return () => {
      cancelled = true;
      window.removeEventListener("arboreal-chondro-breeder-save-change", refresh);
    };
  }, []);

  const adults = useMemo(
    () => (save?.colony ?? []).filter((animal) => animal.lifeStage === "Adult"),
    [save],
  );
  const retired = save?.retiredBreeders ?? [];
  const activeCycleIds = new Set([
    save?.breedingCycle?.damId,
    save?.breedingCycle?.sireId,
  ].filter((id): id is string => !!id));

  async function retireBreeder(animal: SnakeRecord) {
    if (!save || busyId) return;
    if (activeCycleIds.has(animal.id)) {
      setStatus(`${animal.name || animal.id} is in an active breeding cycle and cannot be retired yet.`);
      return;
    }
    const confirmed = window.confirm(
      `Retire ${animal.name || animal.id}? The animal will leave the active colony and move to your permanent breeder archive. No sale income is generated.`,
    );
    if (!confirmed) return;

    setBusyId(animal.id);
    setStatus("");
    const nextRecovery = { ...(save.femaleRecovery ?? {}) };
    delete nextRecovery[animal.id];
    const retiredAt = new Date();
    const next: SaveState = {
      ...save,
      updatedAt: retiredAt.getTime(),
      colony: (save.colony ?? []).filter((item) => item.id !== animal.id),
      damId: save.damId === animal.id ? "" : save.damId,
      sireId: save.sireId === animal.id ? "" : save.sireId,
      geneticTestsPending: (save.geneticTestsPending ?? []).filter((job) => job.snakeId !== animal.id),
      femaleRecovery: nextRecovery,
      favoriteIds: (save.favoriteIds ?? []).filter((id) => id !== animal.id),
      retiredBreeders: [
        {
          animal,
          retiredSeason: Math.max(1, Number(save.season ?? 1)),
          retiredAt: retiredAt.toISOString(),
        },
        ...retired.filter((record) => record.animal.id !== animal.id),
      ].slice(0, 250),
    };

    try {
      // Local-first: guests have no cloud save, so a 401 must not block the
      // retirement. The cloud PUT below is best-effort sync.
      window.localStorage.setItem(LOCAL_SAVE_KEY, JSON.stringify(next));
      window.dispatchEvent(new Event("arboreal-chondro-breeder-save-change"));
      try {
        const response = await fetch("/api/hatchery/chondro-breeder/save", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(next),
        });
        if (!response.ok && response.status !== 401) throw new Error("save failed");
      } catch {
        // Cloud sync is best-effort; the local save above already applied.
      }
      setSave(next);
      setStatus(`${animal.name || animal.id} retired. The enclosure slot is now open and the breeder remains in your legacy archive.`);
    } catch {
      setStatus("Retirement could not be saved. Nothing was changed locally.");
    } finally {
      setBusyId(null);
    }
  }

  if (loading) {
    return <section className="panel rounded-[28px] p-6 text-sm text-white/40">Loading breeder archive…</section>;
  }

  if (!save) {
    return <section className="panel rounded-[28px] p-6 text-sm text-white/40">Start an Arboreal Keeper save before managing retired breeders.</section>;
  }

  return (
    <section className="panel rounded-[28px] p-6">
      <div className="section-kicker">Breeder legacy</div>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold">Retire established breeders</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-white/38">
            Retirement frees an active enclosure without selling the animal. Retired breeders stay preserved here as permanent line-history records.
          </p>
        </div>
        <div className="rounded-full border border-white/[.08] px-3 py-2 text-[10px] font-black uppercase tracking-[.12em] text-white/40">
          {retired.length} retired · {adults.length} active adults
        </div>
      </div>

      {status ? <div role="status" className="mt-4 rounded-2xl border border-amber-200/10 bg-amber-200/[.03] p-3 text-xs text-amber-100/65">{status}</div> : null}

      <div className="mt-6">
        <div className="text-xs font-black uppercase tracking-[.14em] text-white/35">Eligible active breeders</div>
        {adults.length ? (
          <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {adults.map((animal) => {
              const locked = activeCycleIds.has(animal.id);
              return (
                <article key={animal.id} className="rounded-2xl border border-white/[.06] bg-black/10 p-4">
                  <div className="font-semibold text-white/75">{animal.name || "Unnamed breeder"}</div>
                  <div className="mt-1 text-[10px] text-white/30">{animal.sex ?? "Unknown sex"} · Gen {animal.generation ?? 1}</div>
                  <div className="mt-2 text-xs text-white/38">{animal.subspecies ?? "Green tree python"}</div>
                  <div className="mt-1 text-xs text-amber-100/45">{animal.locality ?? "Unknown locality"}</div>
                  <button
                    type="button"
                    disabled={locked || !!busyId}
                    onClick={() => void retireBreeder(animal)}
                    className="mt-4 rounded-xl border border-amber-200/15 bg-amber-200/[.04] px-4 py-2 text-xs font-bold text-amber-100/65 disabled:opacity-30"
                  >
                    {busyId === animal.id ? "Retiring…" : locked ? "Breeding cycle active" : "Retire breeder"}
                  </button>
                </article>
              );
            })}
          </div>
        ) : <div className="mt-3 rounded-2xl border border-white/[.05] p-4 text-sm text-white/30">No adult breeders are currently eligible for retirement.</div>}
      </div>

      <div className="mt-7 border-t border-white/[.06] pt-6">
        <div className="text-xs font-black uppercase tracking-[.14em] text-white/35">Legacy archive</div>
        {retired.length ? (
          <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {retired.map((record) => (
              <article key={`${record.animal.id}-${record.retiredAt}`} className="rounded-2xl border border-emerald-300/10 bg-emerald-300/[.025] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold text-white/75">{record.animal.name || "Unnamed breeder"}</div>
                    <div className="mt-1 text-[10px] text-white/30">{record.animal.sex ?? "Unknown sex"} · Gen {record.animal.generation ?? 1}</div>
                  </div>
                  <span className="rounded-full border border-emerald-300/10 px-2 py-1 text-[9px] font-black uppercase tracking-[.1em] text-emerald-100/45">Retired S{record.retiredSeason}</span>
                </div>
                <div className="mt-3 text-xs text-white/38">{record.animal.subspecies ?? "Green tree python"}</div>
                <div className="mt-1 text-xs text-amber-100/45">{record.animal.locality ?? "Unknown locality"}</div>
                <div className="mt-3 text-[10px] text-white/28">ID {record.animal.id}{record.animal.breederInitials ? ` · ${record.animal.breederInitials}` : ""}</div>
              </article>
            ))}
          </div>
        ) : <div className="mt-3 rounded-2xl border border-white/[.05] p-4 text-sm text-white/30">Your retired breeder history will appear here.</div>}
      </div>
    </section>
  );
}
