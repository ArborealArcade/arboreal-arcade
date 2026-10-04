"use client";

import { useEffect, useMemo, useState } from "react";
import { loadChondroSaveState } from "@/lib/chondro-save";

type Snake = { id: string; name: string; locality: string; classification: string; lifeStage: string };
type ProjectTagMap = Record<string, string[]>;
type Save = { colony?: Snake[]; projectTags?: ProjectTagMap; [key: string]: unknown };

const PRESETS = ["Blue Utaraensis", "High Black Azurea", "High White Viridis", "Yellow Pulcher", "Blotches", "Locality Line", "Designer Project"];
const LOCAL_SAVE_KEY = "arboreal_chondro_breeder_v2";

export function ChondroProjectTagsPanel() {
  const [save, setSave] = useState<Save>({});
  const [selected, setSelected] = useState("");
  const [custom, setCustom] = useState("");
  const [status, setStatus] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const { state: loaded } = await loadChondroSaveState();
        if (!cancelled && loaded) {
          const state = loaded as Save;
          setSave(state);
          if (!selected && state.colony?.[0]?.id) setSelected(state.colony[0].id);
        }
      } catch {}
    }
    void load();
    return () => { cancelled = true; };
  }, [selected]);

  const animal = (save.colony ?? []).find((a) => a.id === selected) ?? null;
  const tags = animal ? (save.projectTags?.[animal.id] ?? []) : [];
  const allTags = useMemo(() => Array.from(new Set([...PRESETS, ...Object.values(save.projectTags ?? {}).flat()])), [save.projectTags]);

  async function persist(next: Save, message: string) {
    setSave(next);
    setStatus(message);
    try {
      window.localStorage.setItem(LOCAL_SAVE_KEY, JSON.stringify(next));
      const response = await fetch("/api/hatchery/chondro-breeder/save", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(next) });
      if (!response.ok) throw new Error("save failed");
    } catch { setStatus("Project tags could not be saved."); }
  }

  function toggle(tag: string) {
    if (!animal || !tag.trim()) return;
    const current = new Set(tags);
    if (current.has(tag)) current.delete(tag); else current.add(tag);
    const nextTags = { ...(save.projectTags ?? {}), [animal.id]: [...current].slice(0, 12) };
    void persist({ ...save, projectTags: nextTags }, current.has(tag) ? `${tag} added.` : `${tag} removed.`);
  }

  function addCustom() {
    const tag = custom.trim().slice(0, 40);
    if (!tag) return;
    setCustom("");
    if (!tags.includes(tag)) toggle(tag);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><div className="text-sm font-bold text-white/70">Project tags</div><div className="mt-1 text-[10px] text-white/30">Assign animals to named breeding goals without changing their genetics or pedigree.</div></div><div className="text-[10px] text-white/25">{allTags.length} tags in use</div></div>
      <div className="grid gap-3 lg:grid-cols-[1fr_1.5fr]">
        <div className="rounded-2xl border border-white/[.06] bg-black/10 p-4">
          <select value={selected} onChange={(e) => setSelected(e.target.value)} className="w-full rounded-xl border border-white/[.08] bg-black/25 px-3 py-2 text-xs text-white/65"><option value="">Choose an animal…</option>{(save.colony ?? []).map((a) => <option key={a.id} value={a.id}>{a.name} · {a.locality}</option>)}</select>
          {animal ? <div className="mt-3 text-[10px] leading-5 text-white/35">{animal.locality} · {animal.classification} · {animal.lifeStage}<br />{tags.length} active project tag{tags.length === 1 ? "" : "s"}</div> : null}
        </div>
        <div className="rounded-2xl border border-white/[.06] bg-black/10 p-4">
          <div className="flex flex-wrap gap-2">{allTags.map((tag) => <button key={tag} type="button" disabled={!animal} onClick={() => toggle(tag)} className={`rounded-full border px-3 py-1.5 text-[10px] font-bold disabled:opacity-25 ${tags.includes(tag) ? "border-emerald-300/25 bg-emerald-300/[.05] text-emerald-100/70" : "border-white/[.08] text-white/40"}`}>{tags.includes(tag) ? "✓ " : ""}{tag}</button>)}</div>
          <div className="mt-3 flex gap-2"><input value={custom} onChange={(e) => setCustom(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addCustom(); }} placeholder="Custom project name…" className="min-w-0 flex-1 rounded-xl border border-white/[.08] bg-black/25 px-3 py-2 text-[10px] text-white/65" /><button type="button" disabled={!animal || !custom.trim()} onClick={addCustom} className="rounded-xl border border-white/[.08] px-3 py-2 text-[10px] font-bold text-white/55 disabled:opacity-25">Add tag</button></div>
        </div>
      </div>
      {status ? <div role="status" className="text-[10px] text-emerald-100/60">{status}</div> : null}
    </div>
  );
}
