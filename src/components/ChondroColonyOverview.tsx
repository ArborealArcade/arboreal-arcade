"use client";

import { useEffect, useMemo, useState } from "react";
import { loadChondroSaveState } from "@/lib/chondro-save";
import { animalHousingCapacity, enclosureFootprint, roomCapacityFromSave, type FacilityRoomState } from "@/lib/chondro-facility-limits";

type Animal = {
  id: string;
  name: string;
  sex: "Male" | "Female";
  lifeStage: "Hatchling" | "Neonate" | "Subadult" | "Adult";
  condition?: "Excellent" | "Good" | "Fair";
  nidoStatus?: "Unknown" | "Negative" | "Positive";
  geneticsTested?: boolean;
  subspecies?: string;
  locality?: string;
};

type Save = {
  colony?: Animal[];
  enclosures?: Record<string, number>;
  facilityRooms?: FacilityRoomState;
  facilityId?: string | null;
  femaleRecovery?: Record<string, number>;
  breedingCycle?: { damId?: string; sireId?: string } | null;
};

type Filter = "all" | "adult" | "ready" | "testing" | "attention";

const filters: Array<{ id: Filter; label: string }> = [
  { id: "all", label: "All" },
  { id: "adult", label: "Adults" },
  { id: "ready", label: "Breeding ready" },
  { id: "testing", label: "Needs testing" },
  { id: "attention", label: "Needs attention" },
];

function animalReady(animal: Animal, save: Save) {
  if (animal.lifeStage !== "Adult") return false;
  if (animal.condition === "Fair") return false;
  if (animal.nidoStatus === "Positive") return false;
  if (animal.sex === "Female" && Number(save.femaleRecovery?.[animal.id] ?? 0) > 0) return false;
  if (save.breedingCycle?.damId === animal.id || save.breedingCycle?.sireId === animal.id) return false;
  return true;
}

function needsAttention(animal: Animal) {
  return animal.condition === "Fair" || animal.nidoStatus === "Positive";
}

export function ChondroColonyOverview() {
  const [save, setSave] = useState<Save>({});
  const [filter, setFilter] = useState<Filter>("all");
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
        if (active && state) setSave(state as Save);
      } catch {}
    }
    void load();
    const refresh = () => void load();
    const timer = window.setInterval(refresh, 15_000);
    window.addEventListener("arboreal-chondro-breeder-save-change", refresh);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener("arboreal-chondro-breeder-save-change", refresh);
    };
  }, []);

  const colony = useMemo(() => save.colony ?? [], [save.colony]);
  const facilityCapacity = roomCapacityFromSave(save);
  const footprint = enclosureFootprint(save.enclosures);
  const animalCapacity = unlimitedSpaces ? Number.POSITIVE_INFINITY : animalHousingCapacity(save.enclosures);
  const adults = colony.filter((animal) => animal.lifeStage === "Adult");
  const ready = adults.filter((animal) => animalReady(animal, save));
  const attention = colony.filter(needsAttention);
  const untested = colony.filter((animal) => !animal.geneticsTested);

  const visible = colony.filter((animal) => {
    if (filter === "adult") return animal.lifeStage === "Adult";
    if (filter === "ready") return animalReady(animal, save);
    if (filter === "testing") return !animal.geneticsTested;
    if (filter === "attention") return needsAttention(animal);
    return true;
  });

  return (
    <section className="mx-auto max-w-7xl px-5 pt-5 sm:px-6">
      <div className="overflow-hidden rounded-[28px] border border-emerald-300/10 bg-[#06100c] shadow-[0_18px_60px_rgba(0,0,0,.18)]">
        <div className="flex flex-wrap items-center gap-2 border-b border-white/[.055] px-4 py-3 sm:px-5">
          <span className="rounded-full border border-emerald-300/14 bg-emerald-300/[.035] px-2.5 py-1 text-[8px] font-black uppercase tracking-[.1em] text-emerald-100/62">Virtual colony</span>
          <span className="text-[10px] text-white/32">Every animal shown here exists only inside the Arboreal Keeper game.</span>
        </div>
        <div className="grid gap-3 border-b border-white/[.055] p-4 sm:grid-cols-2 lg:grid-cols-5 sm:p-5">
          <Metric label="Virtual colony" value={colony.length} detail={`${adults.length} virtual adult${adults.length === 1 ? "" : "s"}`} />
          <Metric label="Breeding ready" value={ready.length} detail="Adult, healthy and available" good />
          <Metric label="Needs testing" value={untested.length} detail="Game genetics still hidden" />
          <Metric label="Needs attention" value={attention.length} detail="Fair condition or Nido positive" warn={attention.length > 0} />
          <Metric label="Virtual housing" value={`${colony.length}/${unlimitedSpaces ? "∞" : animalCapacity}`} detail={`${footprint}/${facilityCapacity} facility slots used · ${unlimitedSpaces ? "unlimited virtual animal spaces" : `${Math.max(0, animalCapacity - colony.length)} virtual animal spaces open`}`} />
        </div>

        <div className="p-4 sm:p-5">
          <div className="flex flex-wrap gap-2">
            {filters.map((item) => {
              const active = filter === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setFilter(item.id)}
                  className={`rounded-full border px-3 py-2 text-[10px] font-black uppercase tracking-[.08em] transition ${active ? "border-emerald-300/30 bg-emerald-300/[.10] text-emerald-100" : "border-white/[.07] bg-white/[.02] text-white/38 hover:border-white/[.13] hover:text-white/65"}`}
                >
                  {item.label}
                </button>
              );
            })}
          </div>

          <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {visible.slice(0, 9).map((animal) => {
              const readyNow = animalReady(animal, save);
              const attentionNow = needsAttention(animal);
              return (
                <div key={animal.id} className={`rounded-2xl border p-3 ${attentionNow ? "border-amber-200/18 bg-amber-200/[.035]" : "border-white/[.055] bg-black/10"}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <div className="truncate text-sm font-bold text-white/76">{animal.name}</div>
                        <span className="shrink-0 rounded-full border border-emerald-300/12 px-2 py-0.5 text-[7px] font-black uppercase tracking-[.09em] text-emerald-100/55">Virtual</span>
                      </div>
                      <div className="mt-1 truncate text-[10px] text-white/32">{animal.subspecies ?? "Chondro"} · {animal.locality ?? "Unknown locality"}</div>
                    </div>
                    <span className={`shrink-0 rounded-full border px-2 py-1 text-[9px] font-black uppercase tracking-[.08em] ${attentionNow ? "border-amber-200/20 text-amber-100/70" : readyNow ? "border-emerald-300/20 text-emerald-100/70" : "border-white/[.08] text-white/34"}`}>
                      {attentionNow ? "Attention" : readyNow ? "Ready" : animal.lifeStage}
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5 text-[9px] text-white/40">
                    <span className="rounded-full border border-white/[.06] px-2 py-1">{animal.sex}</span>
                    <span className="rounded-full border border-white/[.06] px-2 py-1">{animal.condition ?? "Good"}</span>
                    <span className="rounded-full border border-white/[.06] px-2 py-1">Nido {animal.nidoStatus ?? "Unknown"}</span>
                    <span className="rounded-full border border-white/[.06] px-2 py-1">{animal.geneticsTested ? "Tested" : "Untested"}</span>
                  </div>
                </div>
              );
            })}
          </div>

          {visible.length > 9 ? <div className="mt-3 text-[10px] text-white/28">Showing 9 of {visible.length}. Full virtual animal controls remain directly below.</div> : null}
          {!visible.length ? <div className="mt-4 rounded-2xl border border-white/[.06] bg-black/10 p-4 text-sm text-white/38">No virtual animals match this filter.</div> : null}
        </div>
      </div>
    </section>
  );
}

function Metric({ label, value, detail, good = false, warn = false }: { label: string; value: number | string; detail: string; good?: boolean; warn?: boolean }) {
  return (
    <div className="rounded-2xl border border-white/[.055] bg-black/10 p-3">
      <div className="text-[9px] font-black uppercase tracking-[.12em] text-white/30">{label}</div>
      <div className={`mt-1 text-xl font-semibold ${warn ? "text-amber-100/80" : good ? "text-emerald-100/80" : "text-white/75"}`}>{value}</div>
      <div className="mt-1 text-[9px] leading-4 text-white/28">{detail}</div>
    </div>
  );
}
