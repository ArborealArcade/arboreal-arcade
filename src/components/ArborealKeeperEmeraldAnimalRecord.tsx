"use client";

import type { EmeraldAnimal } from "@/lib/arboreal-keeper-emerald-engine";

const RECORD_EVENT = "arboreal-keeper-emerald-animal-record-action";

function emitUpdate(animalId: string, field: "name" | "notes", value: string) {
  window.dispatchEvent(
    new CustomEvent(RECORD_EVENT, {
      detail: { animalId, field, value },
    }),
  );
}

function shortId(value: string) {
  if (value.length <= 18) return value;
  return `${value.slice(0, 9)}…${value.slice(-6)}`;
}

export function ArborealKeeperEmeraldAnimalRecord({
  animal,
  parents,
}: {
  animal: EmeraldAnimal;
  parents: EmeraldAnimal[];
}) {
  return (
    <details className="mt-3 overflow-hidden rounded-[16px] border border-white/[.055] bg-black/15">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2.5 text-[10px] font-bold text-white/46 [&::-webkit-details-marker]:hidden">
        <span>Animal record</span>
        <span className="text-white/24">G{animal.generation} · {animal.condition}</span>
      </summary>

      <div className="border-t border-white/[.05] p-3">
        <label className="block text-[9px] font-black uppercase tracking-[.13em] text-white/25">
          Name
          <input
            key={`${animal.id}-name-${animal.name}`}
            defaultValue={animal.name}
            maxLength={60}
            onBlur={(event) => emitUpdate(animal.id, "name", event.currentTarget.value)}
            className="mt-2 w-full rounded-xl border border-white/[.07] bg-[#050b08] px-3 py-2 text-sm font-medium normal-case tracking-normal text-white/70 outline-none transition focus:border-emerald-300/25"
          />
        </label>

        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <div className="rounded-xl border border-white/[.045] bg-white/[.018] px-3 py-2">
            <div className="text-[8px] font-black uppercase tracking-[.12em] text-white/20">Specimen ID</div>
            <div className="mt-1 font-mono text-[10px] text-white/42" title={animal.id}>{shortId(animal.id)}</div>
          </div>
          <div className="rounded-xl border border-white/[.045] bg-white/[.018] px-3 py-2">
            <div className="text-[8px] font-black uppercase tracking-[.12em] text-white/20">Lineage</div>
            <div className="mt-1 text-[10px] text-white/42">
              {animal.parentIds.length ? `${animal.parentIds.length} recorded parents · G${animal.generation}` : "Foundation animal · G1"}
            </div>
          </div>
        </div>

        {animal.parentIds.length ? (
          <div className="mt-3">
            <div className="text-[8px] font-black uppercase tracking-[.12em] text-white/20">Parents</div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {animal.parentIds.map((parentId) => {
                const parent = parents.find((item) => item.id === parentId);
                return (
                  <span key={parentId} title={parentId} className="rounded-full border border-white/[.05] bg-white/[.02] px-2 py-1 text-[9px] text-white/40">
                    {parent?.name ?? shortId(parentId)}
                  </span>
                );
              })}
            </div>
          </div>
        ) : null}

        <label className="mt-3 block text-[9px] font-black uppercase tracking-[.13em] text-white/25">
          Keeper notes
          <textarea
            key={`${animal.id}-notes-${animal.notes}`}
            defaultValue={animal.notes}
            maxLength={1000}
            rows={3}
            placeholder="Breeding observations, lineage goals, color development, holdback notes…"
            onBlur={(event) => emitUpdate(animal.id, "notes", event.currentTarget.value)}
            className="mt-2 w-full resize-y rounded-xl border border-white/[.07] bg-[#050b08] px-3 py-2 text-xs font-normal normal-case leading-5 tracking-normal text-white/60 outline-none transition placeholder:text-white/18 focus:border-emerald-300/25"
          />
        </label>
      </div>
    </details>
  );
}
