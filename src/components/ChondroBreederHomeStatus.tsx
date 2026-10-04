"use client";

import { useEffect, useMemo, useState } from "react";
import { loadChondroSaveState } from "@/lib/chondro-save";
import { animalHousingCapacity } from "@/lib/chondro-facility-limits"; import { claimMarketProceeds } from "@/lib/chondro-claim";

type CoreView = "breeding" | "colony" | "clutches" | "market" | "conservation";
type Animal = { id?: string; name?: string; sex?: string; lifeStage?: string; condition?: string };
type Cycle = { stage?: string; completesAt?: number; damId?: string; sireId?: string };
type Save = {
  cash?: number;
  season?: number;
  colony?: Animal[];
  enclosures?: Record<string, number>;
  clutch?: { offspring?: unknown[] } | null;
  clutchEstablished?: boolean;
  breedingCycle?: Cycle | null;
  geneticTestsPending?: Array<{ snakeId?: string; completesAt?: number }>;
  seasonCarePaid?: number;
  facilityConstruction?: { roomId?: string; completesAt?: number } | null;
};
type MarketListing = { listed_at?: string; isMine?: boolean };
type MarketPayload = {
  pendingProceeds?: number;
  pendingSaleCount?: number;
  fallbackSaleCount?: number;
  conservationSaleCount?: number;
  listings?: MarketListing[];
};
type ConservationRow = { contribution_count?: number };
type ConservationPayload = { status?: ConservationRow[] };

function money(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

function remaining(ms: number) {
  if (ms <= 0) return "ready";
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.max(1, Math.ceil((ms % 3_600_000) / 60_000));
  if (hours >= 24) return `${Math.floor(hours / 24)}d ${hours % 24}h`;
  return `${hours ? `${hours}h ` : ""}${minutes}m`;
}

function stageLabel(stage?: string) {
  const labels: Record<string, string> = {
    cycling: "Cycling",
    pairing: "Pairing",
    gestation: "Development",
    "separate-pair": "Separate pair",
    "pre-lay": "Pre-lay",
    laying: "Laying",
    incubation: "Incubation",
    "hatch-day": "Hatch day",
  };
  return stage ? labels[stage] ?? stage : "Breeding";
}

export function ChondroBreederHomeStatus({ onOpen }: { onOpen: (view: CoreView) => void }) {
  const [save, setSave] = useState<Save>({});
  const [loaded, setLoaded] = useState(false);
  const [market, setMarket] = useState<MarketPayload>({});
  const [conservation, setConservation] = useState<ConservationPayload>({});
  const [now, setNow] = useState(0); const [claiming, setClaiming] = useState(false); const [claimMessage, setClaimMessage] = useState("");
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
      const [saveState, marketResult, conservationResult] = await Promise.all([
        loadChondroSaveState(),
        fetch("/api/hatchery/chondro-breeder/player-market", { cache: "no-store" }).catch(() => null),
        fetch("/api/hatchery/chondro-breeder/conservation", { cache: "no-store" }).catch(() => null),
      ]);
      if (!active) return;
      if (saveState.state) setSave(saveState.state as Save);
      setLoaded(true);
      if (marketResult && marketResult.ok) setMarket(await marketResult.json());
      if (conservationResult && conservationResult.ok) setConservation(await conservationResult.json());
    }
    void load();
    const tick = () => setNow(Date.now());
    const first = window.setTimeout(tick, 0);
    const timer = window.setInterval(tick, 30_000);
    const refresh = () => void load();
    window.addEventListener("arboreal-chondro-breeder-save-change", refresh);
    window.addEventListener("chondro-conservation-updated", refresh);
    window.addEventListener("arboreal-chondro-favorites-change", refresh);
    return () => {
      active = false;
      window.clearTimeout(first);
      window.clearInterval(timer);
      window.removeEventListener("arboreal-chondro-breeder-save-change", refresh);
      window.removeEventListener("chondro-conservation-updated", refresh);
      window.removeEventListener("arboreal-chondro-favorites-change", refresh);
    };
  }, []);

  const colony = useMemo(() => save.colony ?? [], [save.colony]);
  const capacity = unlimitedSpaces ? Number.POSITIVE_INFINITY : animalHousingCapacity(save.enclosures);
  const activeClutch = Array.isArray(save.clutch?.offspring) ? save.clutch!.offspring!.length : 0;
  const cycle = save.breedingCycle ?? null;
  const pendingTests = save.geneticTestsPending ?? [];
  const ownListings = (market.listings ?? []).filter((listing) => listing.isMine);
  const oldestOwnListing = ownListings
    .map((listing) => new Date(listing.listed_at ?? "").getTime())
    .filter(Number.isFinite)
    .sort((a, b) => a - b)[0];
  const sweepRemaining = oldestOwnListing && now ? Math.max(0, oldestOwnListing + 48 * 3_600_000 - now) : null;
  const conservationTotal = (conservation.status ?? []).reduce((sum, row) => sum + Number(row.contribution_count ?? 0), 0);

  const next = useMemo(() => {
    if (activeClutch) return { view: "clutches" as CoreView, eyebrow: "Next action", title: save.clutchEstablished ? "Review the active clutch" : "Establish the active clutch", detail: `${activeClutch} virtual offspring are waiting in Clutches.` };
    if (cycle) return { view: "breeding" as CoreView, eyebrow: "Breeding in progress", title: stageLabel(cycle.stage), detail: cycle.completesAt && now ? `${remaining(cycle.completesAt - now)} remaining in the current stage.` : "Your virtual breeding cycle is active." };
    if (!colony.length) return { view: "market" as CoreView, eyebrow: "Next action", title: "Buy your first chondros", detail: "Open the Store and start building your virtual breeding colony." };
    if (capacity <= colony.length) return { view: "market" as CoreView, eyebrow: "Capacity warning", title: "Add enclosure capacity", detail: "Open the Store for a Chondro Dojo Pair or PVC enclosure before adding another virtual snake." };
    if (save.seasonCarePaid !== (save.season ?? 1)) return { view: "breeding" as CoreView, eyebrow: "Next action", title: "Prepare for the season", detail: "Provide seasonal food and care before beginning a breeding cycle." };
    const adultFemale = colony.some((animal) => animal.sex === "Female" && animal.lifeStage === "Adult");
    const adultMale = colony.some((animal) => animal.sex === "Male" && animal.lifeStage === "Adult");
    if (!adultFemale || !adultMale) return { view: "colony" as CoreView, eyebrow: "Next action", title: "Develop your breeding group", detail: "Raise or acquire an adult male and female before pairing." };
    return { view: "breeding" as CoreView, eyebrow: "Ready to breed", title: "Select your next pair", detail: "Your virtual colony has the basic pieces needed to begin another cycle." };
  }, [activeClutch, capacity, colony, cycle, now, save.clutchEstablished, save.season, save.seasonCarePaid]);

  // Don't flash "0/0 · Buy your first chondros" before the save has loaded.
  if (!loaded) {
    return (
      <section className="mt-4 grid gap-3 lg:grid-cols-[1.35fr_.65fr]">
        <div className="rounded-[24px] border border-white/[.06] bg-black/18 p-5 text-sm text-white/40 sm:p-6">Loading your keeper overview…</div>
        <div className="rounded-[24px] border border-white/[.06] bg-black/18 p-5 text-sm text-white/40 sm:p-6">Loading your keeper overview…</div>
      </section>
    );
  }

  return (
    <section className="mt-4 grid gap-3 lg:grid-cols-[1.35fr_.65fr]">
      <button
        type="button"
        onClick={() => onOpen(next.view)}
        className="group rounded-[24px] border border-emerald-300/16 bg-emerald-300/[.045] p-5 text-left transition hover:-translate-y-0.5 hover:border-emerald-300/28 hover:bg-emerald-300/[.065] sm:p-6"
      >
        <div className="flex flex-wrap items-center gap-2">
          <div className="text-[9px] font-black uppercase tracking-[.16em] text-emerald-100/52">{next.eyebrow}</div>
          <span className="rounded-full border border-emerald-300/12 bg-emerald-300/[.035] px-2 py-0.5 text-[7px] font-black uppercase tracking-[.1em] text-emerald-100/58">Virtual game</span>
        </div>
        <div className="mt-2 flex items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold tracking-[-.035em] text-white/90">{next.title}</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-white/45">{next.detail}</p>
          </div>
          <span className="shrink-0 text-xl text-emerald-200/65 transition group-hover:translate-x-1">→</span>
        </div>
      </button>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-2">
        <StatusStat label="Game cash" value={money(Number(save.cash ?? 0))} />
        <StatusStat label="Virtual colony" value={`${colony.length}/${unlimitedSpaces ? "∞" : capacity}`} />
        <StatusStat label="Season" value={String(save.season ?? 1)} />
        <StatusStat label="Pending tests" value={String(pendingTests.length)} />
      </div>

      <div className="rounded-[24px] border border-white/[.06] bg-black/18 p-4 lg:col-span-2">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 text-[11px] text-white/38">
          <button type="button" onClick={() => onOpen("market")} className="transition hover:text-white/70"><strong className="text-white/58">Player listings:</strong> {ownListings.length}{sweepRemaining !== null ? ` · next fallback in ${remaining(sweepRemaining)}` : ""}</button>
          <button type="button" onClick={() => void claimMarketProceeds(claiming, market.pendingSaleCount ?? 0, market.pendingProceeds ?? 0, money, setClaiming, setClaimMessage, setMarket, () => onOpen("market"))} disabled={claiming} className="transition hover:text-white/70 disabled:opacity-60"><strong className="text-white/58">Unclaimed game sales:</strong> {market.pendingSaleCount ?? 0} · {money(Number(market.pendingProceeds ?? 0))}{Number(market.pendingSaleCount ?? 0) > 0 ? (claiming ? " · claiming…" : " · tap to claim") : ""}</button> {claimMessage ? <span className="text-emerald-100/70">{claimMessage}</span> : null}
          <button type="button" onClick={() => onOpen("conservation")} className="transition hover:text-white/70"><strong className="text-white/58">Conservation total:</strong> {conservationTotal} virtual animals</button>
          {activeClutch ? <button type="button" onClick={() => onOpen("clutches")} className="transition hover:text-white/70"><strong className="text-white/58">Active clutch:</strong> {activeClutch} virtual offspring</button> : null}
        </div>
      </div>
    </section>
  );
}

function StatusStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[18px] border border-white/[.06] bg-white/[.02] px-3 py-3">
      <div className="text-[8px] font-black uppercase tracking-[.12em] text-white/24">{label}</div>
      <div className="mt-1 truncate text-sm font-semibold text-white/70">{value}</div>
    </div>
  );
}
