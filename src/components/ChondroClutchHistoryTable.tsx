"use client";

import { useEffect, useMemo, useState } from "react";
import { loadChondroSaveState } from "@/lib/chondro-save";
import { ChondroFocusOverlay } from "@/components/ChondroFocusOverlay";
import { ChondroSnakeIcon } from "@/components/ChondroSnakeIcon";

type Snake = {
  id: string;
  name: string;
  locality: string;
  subspecies: string;
  classification: string;
  generation: number;
  lifeStage?: string;
  neonateColor?: "Red" | "Yellow";
  ancestry?: Record<string, number>;
  localityAncestry?: Record<string, number>;
  phenotypeScore?: number;
  highBlack: number;
  highWhite: number;
  blueStripe: number;
  yellowRetention: number;
  blotches: number;
};
type ClutchRecord = { id: string; dam: Snake; sire: Snake; offspring: Snake[]; season: number; holdbackIds?: string[] };
type Sale = { id: string; value: number; season: number };
type Save = { clutchHistory?: ClutchRecord[]; sales?: Sale[]; favoriteIds?: string[] };

const money = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
const bestTrait = (a: Snake) => Math.max(a.highBlack ?? 0, a.highWhite ?? 0, a.blueStripe ?? 0, a.yellowRetention ?? 0, a.blotches ?? 0);

export function ChondroClutchHistoryTable() {
  const [save, setSave] = useState<Save>({});
  const [query, setQuery] = useState("");
  const [season, setSeason] = useState("All");
  const [selected, setSelected] = useState<ClutchRecord | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const { state } = await loadChondroSaveState();
        if (!cancelled && state) setSave(state);
      } catch {}
    }
    void load();
    return () => { cancelled = true; };
  }, []);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return [...(save.clutchHistory ?? [])]
      .filter((record) => season === "All" || String(record.season) === season)
      .filter((record) => !q || [record.id, record.dam?.name, record.sire?.name, record.dam?.locality, record.sire?.locality].some((value) => String(value ?? "").toLowerCase().includes(q)))
      .sort((a, b) => b.season - a.season);
  }, [save, query, season]);

  const seasons = Array.from(new Set((save.clutchHistory ?? []).map((r) => r.season))).sort((a, b) => b - a);
  const favoriteSet = new Set(save.favoriteIds ?? []);

  return (
    <>
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><div className="text-sm font-bold text-white/78">Clutch history</div><div className="mt-1 text-[10px] text-white/38">Select a clutch to open the full record.</div></div>
          <div className="flex flex-wrap gap-2">
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search pair or locality…" className="rounded-xl border border-white/[.08] bg-black/20 px-3 py-2 text-[10px] text-white/68" />
            <select value={season} onChange={(e) => setSeason(e.target.value)} className="rounded-xl border border-white/[.08] bg-black/20 px-3 py-2 text-[10px] text-white/64"><option value="All">All seasons</option>{seasons.map((s) => <option key={s} value={s}>Season {s}</option>)}</select>
          </div>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-white/[.06]">
          <table className="w-full min-w-[820px] text-left text-[10px]">
            <thead className="bg-white/[.025] text-white/34"><tr><th className="px-3 py-2">Season</th><th className="px-3 py-2">Pair</th><th className="px-3 py-2">Class</th><th className="px-3 py-2">Clutch</th><th className="px-3 py-2">Holdbacks</th><th className="px-3 py-2">Best trait</th><th className="px-3 py-2">Sales</th></tr></thead>
            <tbody>
              {rows.map((record) => {
                const offspring = record.offspring ?? [];
                const holdbacks = record.holdbackIds ?? [];
                const best = offspring.reduce<Snake | null>((top, baby) => !top || bestTrait(baby) > bestTrait(top) ? baby : top, null);
                const sales = clutchSales(record, save.sales ?? []);
                const classification = offspring[0]?.classification ?? (record.dam.subspecies === record.sire.subspecies ? "Pure" : "Hybrid");
                return <tr key={record.id} onClick={() => setSelected(record)} tabIndex={0} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelected(record); } }} className="cursor-pointer border-t border-white/[.05] text-white/50 outline-none transition hover:bg-white/[.025] focus:bg-white/[.035]"><td className="px-3 py-3 font-bold text-white/60">{record.season}</td><td className="px-3 py-3"><div className="font-bold text-white/72">{favoriteSet.has(record.dam.id) ? "★ " : ""}{record.dam.name} × {favoriteSet.has(record.sire.id) ? "★ " : ""}{record.sire.name}</div><div className="mt-1 text-white/32">{record.dam.locality} × {record.sire.locality}</div></td><td className="px-3 py-3">{classification}</td><td className="px-3 py-3 text-white/70">{offspring.length}</td><td className="px-3 py-3">{holdbacks.length}</td><td className="px-3 py-3">{best ? `${best.name} · ${bestTrait(best)}%` : "—"}</td><td className="px-3 py-3 text-emerald-100/65">{sales ? money(sales) : "—"}</td></tr>;
              })}
              {!rows.length ? <tr><td colSpan={7} className="px-4 py-8 text-center text-white/30">No clutch records match these filters.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </div>

      <ChondroFocusOverlay open={Boolean(selected)} onClose={() => setSelected(null)} title={selected ? `${selected.dam.name} × ${selected.sire.name}` : "Clutch record"} eyebrow={selected ? `Season ${selected.season} clutch` : "Clutch record"} mode="modal">
        {selected ? <ClutchDetail record={selected} sales={save.sales ?? []} favoriteSet={favoriteSet} /> : null}
      </ChondroFocusOverlay>
    </>
  );
}

function clutchSales(record: ClutchRecord, sales: Sale[]) {
  const ids = new Set((record.offspring ?? []).map((baby) => baby.id));
  return sales.filter((sale) => ids.has(sale.id)).reduce((sum, sale) => sum + sale.value, 0);
}

function ClutchDetail({ record, sales, favoriteSet }: { record: ClutchRecord; sales: Sale[]; favoriteSet: Set<string> }) {
  const offspring = record.offspring ?? [];
  const holdbacks = new Set(record.holdbackIds ?? []);
  const revenue = clutchSales(record, sales);
  const best = offspring.reduce<Snake | null>((top, baby) => !top || bestTrait(baby) > bestTrait(top) ? baby : top, null);
  const classification = offspring[0]?.classification ?? (record.dam.subspecies === record.sire.subspecies ? "Pure" : "Hybrid");
  const averages = offspring.length ? {
    black: Math.round(offspring.reduce((sum, baby) => sum + Number(baby.highBlack ?? 0), 0) / offspring.length),
    white: Math.round(offspring.reduce((sum, baby) => sum + Number(baby.highWhite ?? 0), 0) / offspring.length),
    blue: Math.round(offspring.reduce((sum, baby) => sum + Number(baby.blueStripe ?? 0), 0) / offspring.length),
    yellow: Math.round(offspring.reduce((sum, baby) => sum + Number(baby.yellowRetention ?? 0), 0) / offspring.length),
  } : { black: 0, white: 0, blue: 0, yellow: 0 };

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Offspring" value={String(offspring.length)} />
        <Metric label="Holdbacks" value={String(holdbacks.size)} />
        <Metric label="Classification" value={classification} />
        <Metric label="Recorded sales" value={revenue ? money(revenue) : "—"} />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <ParentCard role="Dam" animal={record.dam} favorite={favoriteSet.has(record.dam.id)} />
        <ParentCard role="Sire" animal={record.sire} favorite={favoriteSet.has(record.sire.id)} />
      </div>

      <div className="rounded-2xl border border-white/[.07] bg-black/10 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3"><div className="section-kicker">Clutch phenotype</div>{best ? <div className="text-xs text-white/48">Top recorded animal: <span className="font-semibold text-white/72">{best.name} · {bestTrait(best)}%</span></div> : null}</div>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Metric label="Avg. high black" value={`${averages.black}%`} compact />
          <Metric label="Avg. high white" value={`${averages.white}%`} compact />
          <Metric label="Avg. blue" value={`${averages.blue}%`} compact />
          <Metric label="Avg. yellow" value={`${averages.yellow}%`} compact />
        </div>
      </div>

      <div>
        <div className="mb-3 flex items-center justify-between gap-3"><div className="section-kicker">Offspring</div><div className="text-[10px] text-white/36">{offspring.length} total</div></div>
        {offspring.length ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{offspring.map((baby) => <div key={baby.id} className="rounded-2xl border border-white/[.065] bg-white/[.02] p-3"><div className="flex items-start gap-3"><ChondroSnakeIcon subspecies={baby.subspecies as never} name={baby.name} traits={{ highBlack: baby.highBlack, highWhite: baby.highWhite, blueStripe: baby.blueStripe, yellowRetention: baby.yellowRetention, blotches: baby.blotches }} lifeStage={(baby.lifeStage ?? "Neonate") as never} neonateColor={baby.neonateColor} locality={baby.locality} classification={baby.classification as never} ancestry={baby.ancestry as never} localityAncestry={baby.localityAncestry} phenotypeScore={baby.phenotypeScore} spriteSeed={baby.id} compact /><div className="min-w-0 flex-1"><div className="truncate text-xs font-bold text-white/72">{holdbacks.has(baby.id) ? "★ " : ""}{baby.name}</div><div className="mt-1 text-[9px] text-white/34">{baby.locality} · Gen {baby.generation}</div><div className="mt-2 text-[9px] leading-4 text-white/42">HB {baby.highBlack}% · HW {baby.highWhite}% · Blue {baby.blueStripe}% · Yellow {baby.yellowRetention}%</div></div></div></div>)}</div> : <div className="rounded-2xl border border-white/[.06] p-8 text-center text-sm text-white/34">No offspring were recorded for this clutch.</div>}
      </div>
    </div>
  );
}

function ParentCard({ role, animal, favorite }: { role: string; animal: Snake | undefined; favorite: boolean }) {     if (!animal) return <div className="rounded-2xl border border-white/[.07] bg-white/[.02] p-4"><div className="text-[9px] font-bold uppercase tracking-[.12em] text-white/34">{role}</div><div className="mt-2 text-lg font-semibold text-white/76">No longer in colony</div></div>;
  return animal ? <div className="rounded-2xl border border-white/[.07] bg-white/[.02] p-4"><div className="text-[9px] font-bold uppercase tracking-[.12em] text-white/34">{role}</div><div className="mt-2 text-lg font-semibold text-white/76">{favorite ? "★ " : ""}{animal.name || "Unnamed animal"}</div><div className="mt-1 text-xs text-white/42">{animal.subspecies || "Unknown subspecies"}</div><div className="mt-1 text-xs text-white/38">{animal.locality || "Unknown locality"} · Gen {animal.generation ?? "—"}</div></div> : <div className="rounded-2xl border border-white/[.07] bg-white/[.02] p-4"><div className="text-[9px] font-bold uppercase tracking-[.12em] text-white/34">{role}</div><div className="mt-2 text-sm text-white/42">No longer in colony</div></div>;
}

function Metric({ label, value, compact = false }: { label: string; value: string; compact?: boolean }) {
  return <div className={`rounded-2xl border border-white/[.065] bg-white/[.02] ${compact ? "p-3" : "p-4"}`}><div className="text-[9px] font-bold uppercase tracking-[.11em] text-white/34">{label}</div><div className={`${compact ? "mt-1 text-lg" : "mt-2 text-xl"} font-semibold text-white/74`}>{value}</div></div>;
}
