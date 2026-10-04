"use client";

import { useEffect, useMemo, useState } from "react";
import { loadChondroSaveState } from "@/lib/chondro-save";

type Snake = { id: string; name: string; classification: string; locality: string; highBlack: number; highWhite: number; blueStripe: number; yellowRetention: number; blotches: number };
type Clutch = { season: number; offspring: Snake[]; holdbackIds?: string[] };
type Sale = { id: string; value: number; season: number };
type Save = { season?: number; clutchHistory?: Clutch[]; sales?: Sale[]; colony?: Snake[]; careerReputation?: number; claimedContractIds?: string[]; claimedProjectIds?: string[] };
const money = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
const bestTrait = (a: Snake) => Math.max(a.highBlack ?? 0, a.highWhite ?? 0, a.blueStripe ?? 0, a.yellowRetention ?? 0, a.blotches ?? 0);

export function ChondroSeasonSummaryPanel() {
  const [save, setSave] = useState<Save>({});
  const [selectedSeason, setSelectedSeason] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const { state: loaded } = await loadChondroSaveState();
        if (!cancelled && loaded) {
          const state = loaded as Save;
          setSave(state);
          const lastCompleted = Math.max(1, Number(state.season ?? 1) - 1);
          setSelectedSeason((current) => current ?? lastCompleted);
        }
      } catch {}
    }
    void load();
    return () => { cancelled = true; };
  }, []);

  const seasons = useMemo(() => Array.from(new Set((save.clutchHistory ?? []).map((r) => r.season))).sort((a, b) => b - a), [save.clutchHistory]);
  const summary = useMemo(() => {
    if (selectedSeason == null) return null;
    const clutches = (save.clutchHistory ?? []).filter((r) => r.season === selectedSeason);
    const offspring = clutches.flatMap((r) => r.offspring ?? []);
    const sales = (save.sales ?? []).filter((r) => r.season === selectedSeason);
    const income = sales.reduce((sum, sale) => sum + sale.value, 0);
    const holdbacks = clutches.reduce((sum, clutch) => sum + (clutch.holdbackIds?.length ?? 0), 0);
    const largest = clutches.reduce((max, clutch) => Math.max(max, clutch.offspring?.length ?? 0), 0);
    const best = offspring.reduce<Snake | null>((top, baby) => !top || bestTrait(baby) > bestTrait(top) ? baby : top, null);
    return { clutches: clutches.length, offspring: offspring.length, sales: sales.length, income, holdbacks, largest, best };
  }, [save, selectedSeason]);

  if (!seasons.length) return <div className="rounded-2xl border border-white/[.06] p-4 text-xs text-white/30">Season summaries will appear after your first completed clutch.</div>;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><div className="text-sm font-bold text-white/70">Season summary</div><div className="mt-1 text-[10px] text-white/30">A quick look at what your breeding program accomplished each season.</div></div><select value={selectedSeason ?? ""} onChange={(e) => setSelectedSeason(Number(e.target.value))} className="rounded-xl border border-white/[.08] bg-black/20 px-3 py-2 text-[10px] text-white/60">{seasons.map((s) => <option key={s} value={s}>Season {s}</option>)}</select></div>
      {summary ? <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4"><Stat label="Clutches" value={String(summary.clutches)} detail={`${summary.offspring} offspring`} /><Stat label="Largest clutch" value={String(summary.largest)} detail={`${summary.holdbacks} holdbacks`} /><Stat label="Animal sales" value={money(summary.income)} detail={`${summary.sales} sold`} /><Stat label="Best offspring" value={summary.best ? summary.best.name : "—"} detail={summary.best ? `${summary.best.locality} · ${bestTrait(summary.best)}% strongest trait` : "No offspring"} /></div> : null}
    </div>
  );
}
function Stat({ label, value, detail }: { label: string; value: string; detail: string }) { return <div className="rounded-2xl border border-white/[.06] bg-black/10 p-4"><div className="text-[9px] uppercase tracking-[.14em] text-white/25">{label}</div><div className="mt-1 text-lg font-black text-white/70">{value}</div><div className="mt-1 text-[10px] text-white/30">{detail}</div></div>; }
