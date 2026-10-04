"use client";

import { useEffect, useMemo, useState } from "react";
import { loadChondroSaveState } from "@/lib/chondro-save";

type Animal = { id?: string; name?: string; sex?: string; lifeStage?: string };
type Cycle = { damId?: string; sireId?: string; stage?: string; completesAt?: number };
type Clutch = { offspring?: unknown[] };
type Save = {
  colony?: Animal[];
  breedingCycle?: Cycle | null;
  clutch?: Clutch | null;
  clutchEstablished?: boolean;
  season?: number;
  seasonCarePaid?: number;
  damId?: string;
  sireId?: string;
};

type StageId = "cycling" | "pairing" | "development" | "incubation";

type ProcessGuide = {
  id: string;
  label: string;
  kicker: string;
  summary: string;
  body: string;
};

const stages: Array<{ id: StageId; label: string; short: string; detail: string }> = [
  { id: "cycling", label: "Cycle", short: "1", detail: "Prepare the female and bring the pair into breeding condition." },
  { id: "pairing", label: "Pair", short: "2", detail: "Run the pairing window until a successful breeding is confirmed." },
  { id: "development", label: "Develop", short: "3", detail: "The pair separates naturally while the female develops the clutch." },
  { id: "incubation", label: "Incubation", short: "4", detail: "Eggs are laid, moved directly into the incubator, and run to hatch." },
];

const processGuides: ProcessGuide[] = [
  {
    id: "cycling",
    label: "Cycling",
    kicker: "Prepare the female",
    summary: "Condition the female, reduce feeding, and gradually bring night temperatures into the low 70s °F.",
    body: "Once the female is at proper breeding size and condition, reduce food intake while gradually lowering nighttime temperatures until nights are in the low 70s °F. Maintain the reduced feeding and cooler-night cycle for roughly 2–3 weeks. At that point, the animals should be ready to begin pairing.",
  },
  {
    id: "pairing",
    label: "Pairing",
    kicker: "Introduce the pair",
    summary: "House the male and female together while maintaining the cooler cycle and reduced feeding schedule.",
    body: "Place the male and female together and continue the cooler nighttime temperatures and reduced food intake. A pairing may last anywhere from several weeks to several months depending on the animals. Continue observing the pair until successful breeding behavior is confirmed and the female begins moving into development.",
  },
  {
    id: "development",
    label: "Development",
    kicker: "Female develops the clutch",
    summary: "After successful breeding, the pair will often separate naturally while the female develops the eggs.",
    body: "Once the snakes have successfully bred, they will usually begin separating on their own while the female develops the clutch. At this point the male can be removed. The female then carries the developing eggs until she is ready to lay, which is treated as the milestone that moves the game directly into Incubation.",
  },
  {
    id: "incubation",
    label: "Incubation",
    kicker: "Eggs are laid",
    summary: "Candle the eggs, orient the embryos upward, and move the clutch into stable incubation conditions.",
    body: "After the female lays, candle the eggs and position each viable egg with the embryo facing upward. Place the clutch into the incubator and maintain roughly 86.3–87.5 °F. Green Tree Python eggs commonly run around 50 days to hatch, give or take, so the game treats hatch as the completion event for the Incubation stage.",
  },
  {
    id: "establish",
    label: "Establish the snakes",
    kicker: "Teach the neonates to feed",
    summary: "Work with the hatchlings until they reliably strike, eat, and continue feeding on their own.",
    body: "After hatch, the neonates still need to become reliable feeders. Work with each baby until it learns to strike prey and eat consistently on its own. A commonly used benchmark is about 15 successful independent meals before considering a young chondro established. In the game, establishment is the final clutch milestone before individual holdback or sale decisions.",
  },
];

function normalizeStage(stage?: string): StageId | null {
  if (!stage) return null;
  if (stage === "cycling" || stage === "pairing" || stage === "development" || stage === "incubation") return stage;
  if (stage === "hatch-day") return "incubation";
  if (stage === "gestation" || stage === "separate-pair" || stage === "pre-lay" || stage === "laying") return "development";
  return null;
}

export function ChondroBreedingFocusHeader() {
  const [save, setSave] = useState<Save>({});
  const [now, setNow] = useState(0);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const { state } = await loadChondroSaveState();
        if (active && state) setSave(state);
      } catch {}
    }
    void load();
    const refresh = () => void load();
    const tick = () => setNow(Date.now());
    const firstTick = window.setTimeout(tick, 0);
    const timer = window.setInterval(tick, 30_000);
    window.addEventListener("chondro-conservation-updated", refresh);
    window.addEventListener("arboreal-chondro-favorites-change", refresh);
    window.addEventListener("arboreal-chondro-breeder-save-change", refresh);
    return () => {
      active = false;
      window.clearTimeout(firstTick);
      window.clearInterval(timer);
      window.removeEventListener("chondro-conservation-updated", refresh);
      window.removeEventListener("arboreal-chondro-favorites-change", refresh);
      window.removeEventListener("arboreal-chondro-breeder-save-change", refresh);
    };
  }, []);

  const cycle = save.breedingCycle ?? null;
  const normalizedStage = normalizeStage(cycle?.stage);
  const currentIndex = normalizedStage ? stages.findIndex((stage) => stage.id === normalizedStage) : -1;
  const colony = save.colony ?? [];
  const pair = useMemo(() => {
    const dam = colony.find((animal) => animal.id === cycle?.damId)?.name;
    const sire = colony.find((animal) => animal.id === cycle?.sireId)?.name;
    return dam && sire ? `${dam} × ${sire}` : null;
  }, [colony, cycle?.damId, cycle?.sireId]);
  const remaining = cycle?.completesAt && now ? Math.max(0, cycle.completesAt - now) : 0;
  const hours = Math.floor(remaining / 3_600_000);
  const minutes = Math.ceil((remaining % 3_600_000) / 60_000);
  const clutchCount = Array.isArray(save.clutch?.offspring) ? save.clutch!.offspring!.length : 0;
  const season = save.season ?? 1;
  const careReady = save.seasonCarePaid === season;
  const adultFemales = colony.filter((animal) => animal.sex === "Female" && animal.lifeStage === "Adult").length;
  const adultMales = colony.filter((animal) => animal.sex === "Male" && animal.lifeStage === "Adult").length;
  const pairSelected = Boolean(save.damId && save.sireId);
  const currentLabel = currentIndex >= 0 ? stages[currentIndex].label : null;

  return (
    <section className="mx-auto max-w-7xl px-5 pt-5 sm:px-6">
      <div className="overflow-hidden rounded-[30px] border border-emerald-300/12 bg-[radial-gradient(circle_at_top_left,rgba(52,211,153,.08),transparent_36%),#07110d] shadow-[0_24px_80px_rgba(0,0,0,.24)]">
        <div className="grid gap-5 border-b border-white/[.06] p-5 lg:grid-cols-[1fr_auto] lg:items-center sm:p-6">
          <div>
            <div className="section-kicker">Breeding program</div>
            <h2 className="mt-2 text-2xl font-semibold tracking-[-.035em] text-white sm:text-3xl">{cycle ? pair || "Breeding cycle in progress" : clutchCount ? `${clutchCount} offspring in the current clutch` : "Cycle → Pair → Develop → Incubation"}</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-white/46">
              {cycle
                ? `${currentLabel ?? "Breeding"} is active. ${remaining > 0 ? `${hours ? `${hours}h ` : ""}${minutes}m remaining.` : "Ready to advance."}`
                : clutchCount
                  ? (save.clutchEstablished ? "The clutch is established and ready for individual management." : "The clutch has hatched. Establish the whole clutch before choosing holdbacks or selling offspring.")
                  : "Only four parts of the breeding process use timers. Separation, laying and hatch are milestone events inside the flow rather than extra waiting stages."}
            </p>
          </div>
          <div className="flex gap-2 lg:flex-col lg:items-end">
            <div className="rounded-2xl border border-white/[.07] bg-black/15 px-4 py-3 text-left lg:text-right">
              <div className="text-[9px] font-bold uppercase tracking-[.13em] text-white/34">Season</div>
              <div className="mt-1 text-2xl font-semibold text-white/72">{season}</div>
            </div>
            {cycle ? <div className="rounded-full border border-amber-200/16 bg-amber-200/[.04] px-3 py-2 text-[9px] font-black uppercase tracking-[.12em] text-amber-100/70">Active breeding cycle</div> : null}
          </div>
        </div>

        {!cycle && !clutchCount ? (
          <div className="grid gap-2 border-b border-white/[.06] p-4 sm:grid-cols-3 sm:p-5">
            <PrepStep done={careReady} label="Season care" detail={careReady ? "Food and care are covered." : "Pay this season's care below."} />
            <PrepStep done={adultFemales > 0 && adultMales > 0} label="Breeding adults" detail={`${adultFemales} female · ${adultMales} male`} />
            <PrepStep done={pairSelected} label="Pair selected" detail={pairSelected ? "Dam and sire are selected." : "Choose the dam and sire below."} />
          </div>
        ) : null}

        <div className="p-4 sm:p-5">
          <div className="grid gap-3 md:grid-cols-4">
            {stages.map((stage, index) => {
              const complete = currentIndex > index || Boolean(clutchCount);
              const active = currentIndex === index;
              return (
                <div key={stage.id} className={`relative rounded-[22px] border p-4 transition ${active ? "border-emerald-300/30 bg-emerald-300/[.08] shadow-[0_14px_36px_rgba(16,185,129,.08)]" : complete ? "border-emerald-300/12 bg-emerald-300/[.03]" : "border-white/[.06] bg-black/12"}`}>
                  <div className="flex items-center gap-3">
                    <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full border text-xs font-black ${active ? "border-emerald-200/30 bg-emerald-300/[.12] text-emerald-100" : complete ? "border-emerald-300/14 text-emerald-100/60" : "border-white/[.08] text-white/28"}`}>{complete ? "✓" : stage.short}</span>
                    <div>
                      <div className={`text-sm font-black uppercase tracking-[.08em] ${active ? "text-emerald-100" : complete ? "text-emerald-100/60" : "text-white/42"}`}>{stage.label}</div>
                      {active && remaining > 0 ? <div className="mt-1 text-[10px] font-bold text-emerald-100/45">{hours ? `${hours}h ` : ""}{minutes}m left</div> : null}
                    </div>
                  </div>
                  <p className="mt-3 text-[11px] leading-5 text-white/34">{stage.detail}</p>
                  {index < stages.length - 1 ? <div className="absolute -right-2 top-1/2 z-10 hidden -translate-y-1/2 text-white/18 md:block">→</div> : null}
                </div>
              );
            })}
          </div>

          <div className="mt-4 rounded-[22px] border border-white/[.06] bg-black/15 p-4">
            <div className="text-[9px] font-black uppercase tracking-[.14em] text-white/36">Milestones inside the timers</div>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-[10px] font-semibold text-white/44">
              <span className="rounded-full border border-white/[.07] px-3 py-2">Successful pairing</span>
              <span className="text-white/18">→</span>
              <span className="rounded-full border border-white/[.07] px-3 py-2">Pair separates naturally</span>
              <span className="text-white/18">→</span>
              <span className="rounded-full border border-white/[.07] px-3 py-2">Female develops clutch</span>
              <span className="text-white/18">→</span>
              <span className="rounded-full border border-white/[.07] px-3 py-2">Eggs laid + incubated</span>
              <span className="text-white/18">→</span>
              <span className="rounded-full border border-white/[.07] px-3 py-2">Hatch</span>
              <span className="text-white/18">→</span>
              <span className="rounded-full border border-amber-200/12 bg-amber-200/[.03] px-3 py-2 text-amber-100/60">Establish clutch</span>
            </div>
          </div>

          <div className="mt-4 space-y-2">
            <div className="px-1 pb-1">
              <div className="text-[9px] font-black uppercase tracking-[.14em] text-emerald-100/42">Breeding process guide</div>
              <p className="mt-1 text-[11px] leading-5 text-white/30">Open any section for a more detailed explanation of what is happening during that part of the program.</p>
            </div>
            {processGuides.map((guide, index) => (
              <details key={guide.id} className="group overflow-hidden rounded-[18px] border border-white/[.06] bg-black/12 open:border-emerald-300/14 open:bg-emerald-300/[.025]">
                <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3.5 [&::-webkit-details-marker]:hidden">
                  <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full border text-[10px] font-black ${guide.id === "establish" ? "border-amber-200/15 text-amber-100/62" : "border-emerald-300/12 text-emerald-100/55"}`}>{index < 4 ? index + 1 : "✓"}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                      <span className="text-xs font-black uppercase tracking-[.08em] text-white/68">{guide.label}</span>
                      <span className="text-[9px] font-bold uppercase tracking-[.11em] text-white/24">{guide.kicker}</span>
                    </div>
                    <p className="mt-1 text-[10px] leading-4 text-white/34">{guide.summary}</p>
                  </div>
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-white/[.07] text-sm text-white/30 transition group-open:rotate-45 group-open:border-emerald-300/15 group-open:text-emerald-100/55">+</span>
                </summary>
                <div className="border-t border-white/[.05] px-4 py-4 pl-[3.75rem] text-xs leading-6 text-white/46">
                  {guide.body}
                </div>
              </details>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function PrepStep({ done, label, detail }: { done: boolean; label: string; detail: string }) {
  return (
    <div className={`rounded-2xl border p-3 ${done ? "border-emerald-300/13 bg-emerald-300/[.035]" : "border-white/[.06] bg-black/10"}`}>
      <div className="flex items-center gap-2">
        <span className={`grid h-6 w-6 place-items-center rounded-full border text-[10px] font-black ${done ? "border-emerald-300/22 bg-emerald-300/[.09] text-emerald-100" : "border-white/[.08] text-white/28"}`}>{done ? "✓" : "·"}</span>
        <span className="text-xs font-bold text-white/68">{label}</span>
      </div>
      <div className="mt-2 text-[10px] leading-4 text-white/34">{detail}</div>
    </div>
  );
}
