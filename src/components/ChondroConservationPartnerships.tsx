"use client";

import { useEffect, useMemo, useState } from "react";

type Subspecies = "Morelia azurea azurea" | "Morelia azurea pulcher" | "Morelia azurea utaraensis" | "Morelia viridis";
type Snake = {
  id?: string;
  name?: string;
  subspecies?: Subspecies;
  classification?: string;
  ancestry?: Partial<Record<Subspecies, number>>;
  phenotypeScore?: number;
  generation?: number;
  locality?: string;
};
type GameSave = { colony?: Snake[] };
type StatusRow = {
  subspecies: Subspecies;
  contribution_count: number;
  stewardship_score: number;
  import_multiplier: number;
  phenotype_bonus: number;
};
type OwnContribution = {
  snake_id: string;
  subspecies: Subspecies;
  phenotype_score: number;
  generation: number;
  contributed_at: string;
};
type Payload = { authenticated: boolean; status: StatusRow[]; own: OwnContribution[] };

type RegionInfo = {
  short: string;
  full: string;
  range: string;
  focus: string;
  localityContext: string;
  tradeLabels: string[];
  mapLabel: string;
};

const LOCAL_SAVE_KEY = "arboreal_chondro_breeder_v2";
const labels: Record<Subspecies, { short: string; full: string }> = {
  "Morelia azurea azurea": { short: "M. a. azurea", full: "Morelia azurea azurea" },
  "Morelia azurea pulcher": { short: "M. a. pulcher", full: "Morelia azurea pulcher" },
  "Morelia azurea utaraensis": { short: "M. a. utaraensis", full: "Morelia azurea utaraensis" },
  "Morelia viridis": { short: "M. viridis", full: "Morelia viridis" },
};

const regionInfo: Record<Subspecies, RegionInfo> = {
  "Morelia azurea azurea": {
    short: "M. a. azurea",
    full: "Morelia azurea azurea",
    range: "Cenderawasih Bay / Schouten Islands region of Indonesian New Guinea, including Biak, Numfor and Supiori.",
    focus: "Island populations separated from mainland New Guinea can preserve distinctive population histories. Conservation work here is best understood at the population and habitat level, not as a license to treat a hobby locality label as an exact collection coordinate.",
    localityContext: "Biak and Numfor are useful husbandry/pedigree labels in the game. They point toward island population history, but a label alone does not prove a snake's exact capture site or complete ancestry.",
    tradeLabels: ["Biak", "Numfor", "Supiori"],
    mapLabel: "Cenderawasih Bay islands",
  },
  "Morelia azurea pulcher": {
    short: "M. a. pulcher",
    full: "Morelia azurea pulcher",
    range: "Vogelkop / Bird's Head Peninsula region of western New Guinea, Indonesia; the taxon's type locality is near Manokwari.",
    focus: "This region is geographically complex. In-game stewardship treats pure subspecies ancestry as the biological unit while still preserving locality/trade names as historical context.",
    localityContext: "Manokwari, Sorong and other hobby locality names can be valuable pedigree clues, but they should not be interpreted as GPS-level provenance. Formal taxonomic range and hobby trade labels do not always line up perfectly.",
    tradeLabels: ["Manokwari", "Sorong", "Timika*"],
    mapLabel: "Bird's Head / Vogelkop",
  },
  "Morelia azurea utaraensis": {
    short: "M. a. utaraensis",
    full: "Morelia azurea utaraensis",
    range: "Northern New Guinea, from Papua in Indonesia eastward across northern Papua New Guinea toward the Huon Peninsula/Lae region.",
    focus: "A broad northern-New-Guinea subspecies means animals represented by different locality labels can still belong to the same subspecies. That is why the game rewards healthy pure-subspecies pairings instead of penalizing every locality cross.",
    localityContext: "Cyclops, Jayapura, Lereh and Wamena are retained as hobby/pedigree references. They help tell a breeding-history story without claiming exact collection sites.",
    tradeLabels: ["Cyclops", "Jayapura", "Lereh", "Wamena*"],
    mapLabel: "Northern New Guinea",
  },
  "Morelia viridis": {
    short: "M. viridis",
    full: "Morelia viridis",
    range: "Southern and other parts of New Guinea plus nearby islands including Aru; the species also occurs in northeastern Cape York, Australia.",
    focus: "The southern green python occupies a wider regional system than any one hobby locality name suggests. Stewardship therefore follows species-level purity here while pedigree labels stay visible for breeding history.",
    localityContext: "Aru and Merauke are useful game pedigree labels. The species' natural distribution extends beyond those two labels, so the map shows the broader biological range rather than only the hobby market categories.",
    tradeLabels: ["Aru", "Merauke", "southern New Guinea", "Cape York"],
    mapLabel: "Southern New Guinea / Aru",
  },
};

const mapSpotlight: Record<Subspecies, { x: number; y: number; radius: number }> = {
  "Morelia azurea azurea": { x: 34, y: 33, radius: 25 },
  "Morelia azurea pulcher": { x: 23, y: 48, radius: 28 },
  "Morelia azurea utaraensis": { x: 58, y: 38, radius: 38 },
  "Morelia viridis": { x: 58, y: 66, radius: 42 },
};

function parseSave(value: unknown): GameSave | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as GameSave;
}

function eligible(snake: Snake) {
  if (!snake.id || snake.classification !== "Pure" || !snake.subspecies) return false;
  return Number(snake.ancestry?.[snake.subspecies] ?? 0) >= 99.9;
}

function statusFor(payload: Payload | null, subspecies: Subspecies) {
  return payload?.status.find((row) => row.subspecies === subspecies) ?? null;
}

function OriginMap({ selected, onSelect }: { selected: Subspecies; onSelect: (value: Subspecies) => void }) {
  const active = (value: Subspecies) => selected === value;
  const spotlight = mapSpotlight[selected];
  const dimStyle = {
    background: `radial-gradient(circle at ${spotlight.x}% ${spotlight.y}%, transparent 0%, transparent ${spotlight.radius}%, rgba(0, 0, 0, 0.18) calc(${spotlight.radius}% + 8%), rgba(0, 0, 0, 0.58) 100%)`,
  };

  return (
    <div className="overflow-hidden rounded-[24px] border border-white/[.07] bg-[#071510] p-3 sm:p-5">
      <div className="relative overflow-hidden rounded-[18px]">
        <img
          src="/hatchery/chondro-subspecies-map-art.webp"
          alt="Green Tree Python subspecies distribution map showing Morelia azurea azurea, Morelia azurea pulcher, Morelia azurea utaraensis, and Morelia viridis across New Guinea and nearby islands"
          className="block h-auto w-full object-contain"
        />
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 transition-[background] duration-300 ease-out" style={dimStyle} />
        <div className="pointer-events-none absolute left-3 top-3 rounded-full border border-white/10 bg-black/55 px-3 py-1.5 text-[9px] font-black uppercase tracking-[.12em] text-white/72 backdrop-blur-sm sm:left-4 sm:top-4">
          {regionInfo[selected].short} · {regionInfo[selected].mapLabel}
        </div>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {(Object.keys(regionInfo) as Subspecies[]).map((subspecies) => (
          <button
            key={subspecies}
            type="button"
            onClick={() => onSelect(subspecies)}
            aria-pressed={active(subspecies)}
            className={`rounded-xl border px-3 py-2 text-left text-xs transition ${active(subspecies) ? "border-white/20 bg-white/[.07] text-white" : "border-white/[.06] bg-black/10 text-white/38 hover:border-white/[.12] hover:text-white/58"}`}
          >
            <div className="font-black">{regionInfo[subspecies].short}</div>
            <div className="mt-1 text-[9px] opacity-65">{regionInfo[subspecies].mapLabel}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

export function ChondroConservationPartnerships() {
  const [open, setOpen] = useState(false);
  const [payload, setPayload] = useState<Payload | null>(null);
  const [save, setSave] = useState<GameSave | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [mapSubspecies, setMapSubspecies] = useState<Subspecies>("Morelia azurea utaraensis");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    let local: GameSave | null = null;
    try { local = parseSave(JSON.parse(window.localStorage.getItem(LOCAL_SAVE_KEY) || "null")); } catch {}

    try {
      const [saveResponse, conservationResponse] = await Promise.all([
        fetch("/api/hatchery/chondro-breeder/save", { cache: "no-store" }),
        fetch("/api/hatchery/chondro-breeder/conservation", { cache: "no-store" }),
      ]);
      const saveData = await saveResponse.json();
      const conservationData = await conservationResponse.json();
      if (saveResponse.ok) setSave(parseSave(saveData.save?.state) ?? local);
      else setSave(local);
      if (conservationResponse.ok) setPayload(conservationData as Payload);
      else setPayload(null);
    } catch {
      setSave(local);
      setPayload(null);
    }
  }

  useEffect(() => { void load(); }, []);

  const eligibleAnimals = useMemo(() => {
    const list = (save?.colony ?? []).filter(eligible);
    // Animals matching the program highlighted on the map come first.
    return [...list.filter((s) => s.subspecies === mapSubspecies), ...list.filter((s) => s.subspecies !== mapSubspecies)];
  }, [save, mapSubspecies]);
  const selectedAnimals = useMemo(
    () => eligibleAnimals.filter((snake) => snake.id && selectedIds.has(snake.id)),
    [eligibleAnimals, selectedIds]
  );
  const mapInfo = regionInfo[mapSubspecies];
  const mapStatus = statusFor(payload, mapSubspecies);

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function contribute() {
    if (!selectedAnimals.length || busy) return;
    const total = selectedAnimals.length;
    const names = selectedAnimals.map((s) => s.name || s.id).join(", ");
    if (!window.confirm(`Transfer ${total} animal${total === 1 ? "" : "s"} to the in-country conservation partnership? This permanently removes them from your active colony.\n\n${names}`)) return;
    setBusy(true);
    const done: { name: string; subspecies?: Subspecies }[] = [];
    const failed: string[] = [];
    for (const snake of selectedAnimals) {
      setStatus(`Transferring ${done.length + failed.length + 1} of ${total}: ${snake.name || snake.id}…`);
      try {
        const response = await fetch("/api/hatchery/chondro-breeder/conservation", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ snakeId: snake.id }),
        });
        const result = await response.json().catch(() => null);
        if (!response.ok) failed.push(`${snake.name || snake.id} (${result?.error ?? "transfer failed"})`);
        else done.push({ name: snake.name || String(snake.id), subspecies: snake.subspecies });
      } catch {
        failed.push(snake.name || String(snake.id));
      }
    }
    const parts: string[] = [];
    if (done.length) parts.push(`${done.length} animal${done.length === 1 ? "" : "s"} entered the conservation partnership: ${done.map((d) => d.name).join(", ")}. Community import odds have been recalculated.`);
    if (failed.length) parts.push(`Could not transfer: ${failed.join("; ")}.`);
    setStatus(parts.join(" "));
    if (done[0]?.subspecies) setMapSubspecies(done[0].subspecies);
    setSelectedIds(new Set());
    await load();
    window.dispatchEvent(new Event("chondro-conservation-updated"));
    setBusy(false);
  }

  return (
    <section className="mx-auto mt-6 max-w-7xl px-5 sm:px-6">
      <div className="overflow-hidden rounded-[28px] border border-emerald-300/12 bg-emerald-300/[.025]">
        <button type="button" onClick={() => setOpen((value) => !value)} className="flex w-full items-center justify-between gap-4 p-5 text-left sm:p-6">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[.16em] text-emerald-100/50">Conservation partnerships</div>
            <div className="mt-2 text-xl font-semibold text-white/82">Breed responsibly. Strengthen the regional program.</div>
            <div className="mt-1 max-w-3xl text-xs leading-5 text-white/36">Send pure-subspecies animals to in-country conservation and breeding partners. Community participation gradually improves that subspecies&apos; representation and phenotype quality in future import listings.</div>
          </div>
          <div className="rounded-full border border-white/[.08] px-3 py-2 text-xs font-bold text-white/45">{open ? "Collapse ▴" : "Open program ▾"}</div>
        </button>

        {open ? (
          <div className="border-t border-white/[.06] p-5 sm:p-6">
            <div className="rounded-2xl border border-amber-200/10 bg-amber-200/[.025] p-4 text-xs leading-5 text-white/42">
              This is an educational game abstraction. It represents coordinated transfers to qualified in-country conservation/breeding programs—not private release of captive reptiles into wild habitat. Locality names remain useful pedigree context, while eligibility is based on pure subspecies ancestry.
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {(payload?.status ?? []).map((row) => {
                const label = labels[row.subspecies];
                const availabilityGain = Math.round((Number(row.import_multiplier) - 1) * 100);
                return (
                  <button key={row.subspecies} type="button" onClick={() => setMapSubspecies(row.subspecies)} className={`rounded-2xl border p-4 text-left transition ${mapSubspecies === row.subspecies ? "border-emerald-200/25 bg-emerald-200/[.045]" : "border-white/[.06] bg-black/10 hover:border-white/[.12]"}`}>
                    <div className="text-[10px] font-black uppercase tracking-[.12em] text-emerald-100/50">{label?.short ?? row.subspecies}</div>
                    <div className="mt-1 text-xs italic text-white/30">{label?.full ?? row.subspecies}</div>
                    <div className="mt-4 flex items-end justify-between gap-3"><span className="text-2xl font-semibold text-white/72">{Number(row.stewardship_score).toFixed(1)}</span><span className="text-[9px] uppercase text-white/25">stewardship / 100</span></div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/[.05]"><div className="h-full rounded-full bg-emerald-300/55" style={{ width: `${Math.min(100, Number(row.stewardship_score))}%` }} /></div>
                    <div className="mt-4 space-y-1 text-[10px] text-white/38">
                      <div>{row.contribution_count} community animal{Number(row.contribution_count) === 1 ? "" : "s"} contributed</div>
                      <div>Import representation: +{availabilityGain}% weighting</div>
                      <div>Import phenotype shift: +{row.phenotype_bonus} points</div>
                    </div>
                    <div className="mt-3 text-[9px] font-black uppercase tracking-[.1em] text-emerald-100/45">View origin region →</div>
                  </button>
                );
              })}
            </div>

            <div className="mt-6 rounded-[28px] border border-sky-300/10 bg-sky-300/[.018] p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="text-[10px] font-black uppercase tracking-[.15em] text-sky-100/50">Subspecies distribution guide</div>
                  <h3 className="mt-2 text-2xl font-semibold text-white/80">Green Tree Python subspecies &amp; natural ranges</h3>
                  <p className="mt-2 max-w-3xl text-xs leading-5 text-white/36">Broad natural ranges are shown alongside familiar hobby locality labels for pedigree context.</p>
                </div>
                <div className="rounded-2xl border border-white/[.06] bg-black/10 px-4 py-3 text-right">
                  <div className="text-[9px] uppercase text-white/25">Selected program</div>
                  <div className="mt-1 font-semibold text-emerald-100/70">{mapInfo.short}</div>
                </div>
              </div>

              <div className="mt-5 grid gap-5 lg:grid-cols-[1.25fr_.75fr]">
                <OriginMap selected={mapSubspecies} onSelect={setMapSubspecies} />
                <div className="rounded-[24px] border border-white/[.07] bg-black/10 p-5">
                  <div className="text-[10px] font-black uppercase tracking-[.13em] text-emerald-100/50">{mapInfo.short}</div>
                  <div className="mt-1 text-sm italic text-white/38">{mapInfo.full}</div>
                  <div className="mt-5 text-[9px] font-black uppercase tracking-[.12em] text-white/25">Broad natural range</div>
                  <p className="mt-2 text-sm leading-6 text-white/48">{mapInfo.range}</p>
                  <div className="mt-5 text-[9px] font-black uppercase tracking-[.12em] text-white/25">Why this matters in the game</div>
                  <p className="mt-2 text-xs leading-5 text-white/38">{mapInfo.focus}</p>
                  <div className="mt-5 text-[9px] font-black uppercase tracking-[.12em] text-white/25">Locality / trade context</div>
                  <p className="mt-2 text-xs leading-5 text-white/38">{mapInfo.localityContext}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {mapInfo.tradeLabels.map((item) => <span key={item} className="rounded-full border border-white/[.07] px-2.5 py-1 text-[9px] text-white/38">{item}</span>)}
                  </div>
                  <div className="mt-5 grid grid-cols-2 gap-2">
                    <div className="rounded-xl border border-white/[.06] p-3"><div className="text-[9px] uppercase text-white/25">Community transfers</div><div className="mt-1 text-xl font-semibold text-white/65">{mapStatus?.contribution_count ?? 0}</div></div>
                    <div className="rounded-xl border border-white/[.06] p-3"><div className="text-[9px] uppercase text-white/25">Stewardship</div><div className="mt-1 text-xl font-semibold text-emerald-100/65">{Number(mapStatus?.stewardship_score ?? 0).toFixed(1)}</div></div>
                  </div>
                  <p className="mt-4 text-[10px] leading-4 text-white/25">* Some hobby locality labels do not map neatly onto formal taxonomic boundaries. They remain in the game as pedigree/trade history, not proof of exact provenance.</p>
                </div>
              </div>
            </div>

            <div className="mt-6 grid gap-5 lg:grid-cols-[1.1fr_.9fr]">
              <div className="rounded-2xl border border-white/[.06] p-5">
                <div className="text-[10px] font-black uppercase tracking-[.13em] text-white/30">Contribute animals</div>
                <p className="mt-2 text-sm leading-6 text-white/40">Eligible animals must be classified Pure and at least 99.9% of a single subspecies. Locality-mixed animals within that same subspecies still qualify. Tick any animals to send them together in one transfer — animals matching the program highlighted on the map are listed first.</p>
                {eligibleAnimals.length ? (
                  <>
                    <div className="mt-4 flex items-center justify-between gap-3 text-[10px] font-black uppercase tracking-[.1em] text-white/35">
                      <span>{selectedAnimals.length} of {eligibleAnimals.length} selected</span>
                      <span className="flex gap-2">
                        <button type="button" onClick={() => setSelectedIds(new Set(eligibleAnimals.map((s) => s.id!)))} className="rounded-full border border-white/10 px-2.5 py-1 transition hover:border-white/25 hover:text-white/70">Select all</button>
                        <button type="button" onClick={() => setSelectedIds(new Set())} className="rounded-full border border-white/10 px-2.5 py-1 transition hover:border-white/25 hover:text-white/70">Clear</button>
                      </span>
                    </div>
                    <div className="mt-2 max-h-64 overflow-y-auto rounded-xl border border-white/[.07]">
                      {eligibleAnimals.map((snake) => {
                        const checked = selectedIds.has(snake.id!);
                        return (
                          <label key={snake.id} className={`flex cursor-pointer items-center gap-3 border-b border-white/[.04] px-3 py-2.5 text-xs transition last:border-b-0 ${checked ? "bg-emerald-300/[.06] text-white/80" : "text-white/50 hover:bg-white/[.02]"}`}>
                            <input type="checkbox" checked={checked} onChange={() => toggleSelect(snake.id!)} className="h-4 w-4 shrink-0 accent-emerald-300" />
                            <span className="min-w-0 flex-1 truncate">{snake.name || snake.id} <span className="text-white/30">· {snake.locality ?? "pedigree unknown"} · Gen {snake.generation ?? 1}</span></span>
                            <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-black uppercase tracking-wide ${snake.subspecies === mapSubspecies ? "border-emerald-300/30 text-emerald-100/70" : "border-white/10 text-white/40"}`}>{labels[snake.subspecies!]?.short ?? snake.subspecies}</span>
                            <span className="shrink-0 text-white/40">✦ {Math.round(Number(snake.phenotypeScore ?? 0))}</span>
                          </label>
                        );
                      })}
                    </div>
                    {selectedAnimals.length ? (
                      <div className="mt-3 rounded-xl border border-emerald-300/10 bg-emerald-300/[.02] p-3 text-xs text-white/42">
                        {selectedAnimals.length} animal{selectedAnimals.length === 1 ? "" : "s"} ready · average phenotype {Math.round(selectedAnimals.reduce((sum, s) => sum + Number(s.phenotypeScore ?? 0), 0) / selectedAnimals.length)} · {(Object.keys(regionInfo) as Subspecies[]).filter((sub) => selectedAnimals.some((s) => s.subspecies === sub)).map((sub) => `${labels[sub].short} ×${selectedAnimals.filter((s) => s.subspecies === sub).length}`).join(" · ")}
                      </div>
                    ) : null}
                  </>
                ) : <div className="mt-3 text-xs text-white/28">No eligible pure-subspecies animals are currently available in your colony.</div>}
                <button type="button" disabled={!selectedAnimals.length || busy || !payload?.authenticated} onClick={() => void contribute()} className="mt-4 rounded-xl bg-emerald-200 px-5 py-3 text-xs font-black text-[#102016] disabled:opacity-30">{busy ? "Transferring…" : `Send ${selectedAnimals.length} animal${selectedAnimals.length === 1 ? "" : "s"} to conservation partnership`}</button>
                {status ? <div role="status" className="mt-3 text-xs text-emerald-100/65">{status}</div> : null}
              </div>

              <div className="rounded-2xl border border-white/[.06] p-5">
                <div className="text-[10px] font-black uppercase tracking-[.13em] text-white/30">Your conservation record</div>
                <div className="mt-3 text-3xl font-semibold text-white/72">{payload?.own.length ?? 0}</div>
                <div className="mt-1 text-xs text-white/30">animals contributed</div>
                <div className="mt-4 max-h-56 space-y-2 overflow-y-auto pr-1">
                  {(payload?.own ?? []).map((item) => <div key={item.snake_id} className="rounded-xl border border-white/[.05] px-3 py-2 text-xs text-white/40"><span className="font-semibold text-emerald-100/60">{labels[item.subspecies]?.short}</span> · phenotype {Math.round(Number(item.phenotype_score))} · Gen {item.generation}</div>)}
                  {payload && !payload.own.length ? <div className="text-xs text-white/28">Your first qualifying contribution will appear here.</div> : null}
                </div>
              </div>
            </div>

            <div className="mt-5 rounded-2xl border border-white/[.05] bg-black/10 p-4 text-xs leading-5 text-white/30">
              Educational range notes are based on modern green-python taxonomy and broad distribution summaries. The map is intentionally broad, not a field-collection map. Future versions can add sourced habitat, legal-trade and conservation-history lessons for each region.
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
