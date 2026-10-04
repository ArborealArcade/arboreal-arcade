"use client";

import { useEffect, useMemo, useState } from "react";

type Snake = {
  id?: string;
  name?: string;
  parentIds?: string[];
  generation?: number;
  locality?: string;
  classification?: string;
  phenotypeScore?: number;
  geneticsTested?: boolean;
  highBlack?: number;
  highWhite?: number;
  blueStripe?: number;
  yellowRetention?: number;
  blotches?: number;
};

type BreederLine = {
  id: string;
  name: string;
  focus: string;
  founder_snake_id: string;
};

function strongestTrait(snake: Snake) {
  return Math.max(snake.highBlack ?? 0, snake.highWhite ?? 0, snake.blueStripe ?? 0, snake.yellowRetention ?? 0, snake.blotches ?? 0);
}

function phenotypeGrade(score: number) {
  if (score >= 95) return "A+";
  if (score >= 90) return "A";
  if (score >= 85) return "A-";
  if (score >= 80) return "B+";
  if (score >= 74) return "B";
  if (score >= 68) return "B-";
  if (score >= 62) return "C+";
  return "C";
}

export function ChondroBreederLines() {
  const [lines, setLines] = useState<BreederLine[]>([]);
  const [animals, setAnimals] = useState<Snake[]>([]);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [focus, setFocus] = useState("");
  const [founderId, setFounderId] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const response = await fetch("/api/hatchery/chondro-breeder/lines", { cache: "no-store" });
      if (!response.ok) return;
      const data = await response.json();
      setLines(data.lines ?? []);
      setAnimals(data.animals ?? []);
    } catch {}
  }

  useEffect(() => { void load(); }, []);

  const animalMap = useMemo(() => new Map(animals.map((snake) => [String(snake.id ?? ""), snake])), [animals]);

  const lineMembers = useMemo(() => {
    const result = new Map<string, Set<string>>();
    for (const line of lines) {
      const members = new Set<string>([line.founder_snake_id]);
      let changed = true;
      while (changed) {
        changed = false;
        for (const snake of animals) {
          const id = String(snake.id ?? "");
          if (!id || members.has(id)) continue;
          if ((snake.parentIds ?? []).some((parent) => members.has(parent))) {
            members.add(id);
            changed = true;
          }
        }
      }
      result.set(line.id, members);
    }
    return result;
  }, [animals, lines]);

  useEffect(() => {
    const decorate = () => {
      const memberships = new Map<string, string[]>();
      for (const line of lines) {
        for (const id of lineMembers.get(line.id) ?? []) {
          const list = memberships.get(id) ?? [];
          list.push(line.name);
          memberships.set(id, list);
        }
      }
      for (const article of document.querySelectorAll<HTMLElement>("article.panel")) {
        const text = article.textContent || "";
        const matched = [...memberships.entries()].filter(([id]) => text.includes(id));
        if (!matched.length) continue;
        let badge = article.querySelector<HTMLElement>("[data-breeder-line-badge]");
        if (!badge) {
          badge = document.createElement("div");
          badge.dataset.breederLineBadge = "true";
          badge.className = "mt-2 text-[10px] font-black uppercase tracking-[.11em] text-violet-200/55";
          article.children[1]?.insertAdjacentElement("afterend", badge);
        }
        badge.textContent = matched.flatMap(([, names]) => names).join(" · ");
      }
    };
    decorate();
    const observer = new MutationObserver(decorate);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [lineMembers, lines]);

  async function createLine() {
    if (busy) return;
    setBusy(true);
    setStatus("");
    try {
      const response = await fetch("/api/hatchery/chondro-breeder/lines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, focus, founderSnakeId: founderId }),
      });
      const data = await response.json();
      if (!response.ok) {
        setStatus(data.error ?? "Could not create that breeder line.");
        return;
      }
      setName("");
      setFocus("");
      setFounderId("");
      setStatus("Breeder line created. Descendants will be recognized from pedigree automatically.");
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function removeLine(lineId: string) {
    const response = await fetch("/api/hatchery/chondro-breeder/lines", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", lineId }),
    });
    if (response.ok) await load();
  }

  return (
    <section className="mx-auto mt-6 max-w-7xl px-5 sm:px-6">
      <div className="overflow-hidden rounded-[28px] border border-violet-300/10 bg-violet-300/[.02]">
        <button type="button" onClick={() => setOpen((value) => !value)} className="flex w-full items-center justify-between gap-4 p-5 text-left sm:p-6">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[.16em] text-violet-100/45">Named breeder lines</div>
            <div className="mt-2 text-xl font-semibold text-white/80">{lines.length ? `${lines.length} active line${lines.length === 1 ? "" : "s"}` : "Build a recognizable program"}</div>
            <div className="mt-1 text-xs text-white/34">Choose a founder once. Descendants are recognized through recorded parentage.</div>
          </div>
          <div className="rounded-full border border-white/[.08] px-3 py-2 text-xs font-bold text-white/45">{open ? "Collapse ▴" : "Manage lines ▾"}</div>
        </button>

        {open ? (
          <div className="border-t border-white/[.06] p-5 sm:p-6">
            <div className="grid gap-4 lg:grid-cols-[.9fr_1.1fr]">
              <div className="rounded-2xl border border-white/[.06] p-4">
                <div className="text-sm font-semibold text-white/70">Create a breeder line</div>
                <input value={name} onChange={(event) => setName(event.target.value)} maxLength={60} placeholder="Hank Blue Line" className="mt-4 h-11 w-full rounded-xl border border-white/[.08] bg-black/20 px-3 text-sm text-white/75 outline-none" />
                <input value={focus} onChange={(event) => setFocus(event.target.value)} maxLength={160} placeholder="Focus: blue expression + Cyclops phenotype" className="mt-2 h-11 w-full rounded-xl border border-white/[.08] bg-black/20 px-3 text-sm text-white/75 outline-none" />
                <select value={founderId} onChange={(event) => setFounderId(event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-white/[.08] bg-black/30 px-3 text-sm text-white/70 outline-none">
                  <option value="">Choose founder animal</option>
                  {animals.map((snake) => <option key={String(snake.id)} value={String(snake.id)}>{snake.name || snake.id} · {snake.locality || "Unknown"} · Gen {snake.generation ?? 1}</option>)}
                </select>
                <button type="button" disabled={busy || name.trim().length < 2 || !founderId} onClick={() => void createLine()} className="mt-3 rounded-xl bg-violet-200 px-4 py-2.5 text-xs font-black text-[#120b18] disabled:opacity-30">Create line</button>
                {status ? <div role="status" className="mt-3 text-xs leading-5 text-violet-100/60">{status}</div> : null}
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {lines.map((line) => {
                  const members = [...(lineMembers.get(line.id) ?? [])].map((id) => animalMap.get(id)).filter((snake): snake is Snake => Boolean(snake));
                  const founder = animalMap.get(line.founder_snake_id);
                  const maxGeneration = members.reduce((best, snake) => Math.max(best, snake.generation ?? 1), 1);
                  const strongestTested = members.filter((snake) => snake.geneticsTested).reduce((best, snake) => Math.max(best, strongestTrait(snake)), 0);
                  const bestPhenotype = members.reduce((best, snake) => Math.max(best, snake.phenotypeScore ?? 0), 0);
                  return (
                    <article key={line.id} className="rounded-2xl border border-violet-300/10 bg-violet-300/[.025] p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div><div className="font-semibold text-white/75">{line.name}</div><div className="mt-1 text-[10px] text-white/30">Founder: {founder?.name || line.founder_snake_id}</div></div>
                        <button type="button" onClick={() => void removeLine(line.id)} className="text-[10px] font-bold text-red-200/45">Remove</button>
                      </div>
                      {line.focus ? <div className="mt-3 text-xs leading-5 text-violet-100/50">{line.focus}</div> : null}
                      <div className="mt-4 grid grid-cols-2 gap-2 text-[10px] text-white/38">
                        <div className="rounded-xl border border-white/[.05] p-2">Members <strong className="block text-white/65">{members.length}</strong></div>
                        <div className="rounded-xl border border-white/[.05] p-2">Generation <strong className="block text-white/65">F{maxGeneration}</strong></div>
                        <div className="rounded-xl border border-white/[.05] p-2">Best tested trait <strong className="block text-white/65">{strongestTested ? `${strongestTested}%` : "—"}</strong></div>
                        <div className="rounded-xl border border-white/[.05] p-2">Best phenotype <strong className="block text-white/65">{bestPhenotype ? phenotypeGrade(bestPhenotype) : "—"}</strong></div>
                      </div>
                    </article>
                  );
                })}
                {!lines.length ? <div className="rounded-2xl border border-dashed border-white/[.07] p-5 text-sm text-white/28 sm:col-span-2">Create your first named line to start tracking its descendants automatically.</div> : null}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
