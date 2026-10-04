"use client";

import { useEffect, useMemo, useState } from "react";
import { loadChondroSaveState } from "@/lib/chondro-save";
import { achievementReputation } from "@/lib/chondro-achievements";
import { animalMeetsContract, contractsForSeason } from "@/lib/chondro-contracts";
import { installedEnclosures, roomCapacityFromSave, type FacilityRoomState } from "@/lib/chondro-facility-limits";
import { CHONDRO_LONG_TERM_PROJECTS } from "@/lib/chondro-longevity";
import {
  BREEDING_PROJECTS,
  marketDemandForSeason,
  projectCompleted,
  rankForReputation,
  storeScoutCost,
} from "@/lib/chondro-progression";

type Snake = {
  id: string;
  name?: string;
  sex: "Male" | "Female";
  source: "Captive Bred" | "Import";
  subspecies: "Morelia azurea azurea" | "Morelia azurea pulcher" | "Morelia azurea utaraensis" | "Morelia viridis";
  locality: string;
  classification: "Pure" | "Hybrid" | "Designer";
  generation: number;
  neonateColor: "Red" | "Yellow";
  nidoStatus: "Unknown" | "Negative" | "Positive";
  highBlack: number;
  highWhite: number;
  blueStripe: number;
  yellowRetention: number;
  blotches: number;
};

type Save = {
  cash: number;
  colony: Snake[];
  clutchHistory?: Array<{ offspring?: Snake[] }>;
  enclosures: Record<string, number>;
  season: number;
  careerReputation?: number;
  facilityId?: string;
  facilityRooms?: FacilityRoomState;
  claimedProjectIds?: string[];
  claimedContractIds?: string[];
  scoutsUsedSeason?: number;
  scoutsUsedThisSeason?: number;
  [key: string]: unknown;
};

const LOCAL_SAVE_KEY = "arboreal_chondro_breeder_v2";
const SHOP_SEED_KEY = "arboreal_chondro_expanded_shop_seed_v2";
const ALL_BREEDING_PROJECTS = [...BREEDING_PROJECTS, ...CHONDRO_LONG_TERM_PROJECTS];
const money = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);

async function patchCareer(patch: Record<string, unknown>) {
  const response = await fetch("/api/hatchery/chondro-breeder/progression", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ patch }),
  });
  if (!response.ok) throw new Error("career patch failed");
  try {
    const raw = window.localStorage.getItem(LOCAL_SAVE_KEY);
    if (raw) {
      const local = JSON.parse(raw) as Record<string, unknown>;
      window.localStorage.setItem(LOCAL_SAVE_KEY, JSON.stringify({ ...local, ...patch }));
    }
  } catch {}
}

export function ChondroCareerSystemsPanel() {
  const [save, setSave] = useState<Save | null>(null);
  const [busy, setBusy] = useState("");
  const [status, setStatus] = useState("");

  async function load() {
    try {
      const { state } = await loadChondroSaveState();
      if (state) setSave(state as Save);
    } catch {}
  }

  useEffect(() => { void load(); }, []);

  const produced = useMemo(() => (save?.clutchHistory ?? []).flatMap((clutch) => clutch.offspring ?? []), [save]);
  const known = useMemo(() => [...(save?.colony ?? []), ...produced], [save, produced]);
  const achievementRep = useMemo(() => save ? achievementReputation(save) : 0, [save]);
  const careerRep = Number(save?.careerReputation ?? 0);
  const reputation = careerRep + achievementRep;
  const rank = rankForReputation(reputation);
  const enclosureCount = installedEnclosures(save?.enclosures);
  const roomCap = roomCapacityFromSave({ facilityId: save?.facilityId, facilityRooms: save?.facilityRooms });
  const claimedProjects = new Set(save?.claimedProjectIds ?? []);
  const claimedContracts = new Set(save?.claimedContractIds ?? []);
  const contracts = save ? contractsForSeason(save.season ?? 1, reputation) : [];
  const demand = save ? marketDemandForSeason(save.season ?? 1) : null;
  const scoutsUsed = save?.scoutsUsedSeason === save?.season ? Number(save?.scoutsUsedThisSeason ?? 0) : 0;
  const scoutCost = storeScoutCost(reputation, scoutsUsed);
  const completedProjectCount = ALL_BREEDING_PROJECTS.filter((project) => claimedProjects.has(project.id)).length;

  async function persistPatch(patch: Record<string, unknown>, message: string, reload = true) {
    setBusy(message);
    setStatus("");
    try {
      await patchCareer(patch);
      setSave((current) => current ? ({ ...current, ...patch } as Save) : current);
      setStatus(message);
      if (reload) window.setTimeout(() => window.location.reload(), 180);
    } catch {
      setStatus("That career action could not be saved.");
    } finally {
      setBusy("");
    }
  }

  function claimProject(projectId: string) {
    if (!save || busy || claimedProjects.has(projectId)) return;
    const project = ALL_BREEDING_PROJECTS.find((item) => item.id === projectId);
    if (!project || !produced.some((animal) => projectCompleted(project, animal))) return;
    void persistPatch({
      cash: save.cash + project.rewardCash,
      careerReputation: careerRep + project.rewardReputation,
      claimedProjectIds: [...(save.claimedProjectIds ?? []), project.id],
    }, `${project.name} completed · +${money(project.rewardCash)} · +${project.rewardReputation} reputation.`);
  }

  function claimContract(contractId: string) {
    if (!save || busy || claimedContracts.has(contractId)) return;
    const contract = contracts.find((item) => item.id === contractId);
    if (!contract || !known.some((animal) => animalMeetsContract(contract, animal))) return;
    void persistPatch({
      cash: save.cash + contract.rewardCash,
      careerReputation: careerRep + contract.rewardReputation,
      claimedContractIds: [...(save.claimedContractIds ?? []), contract.id],
    }, `${contract.title} fulfilled · +${money(contract.rewardCash)} · +${contract.rewardReputation} reputation.`);
  }

  function scoutStock() {
    if (!save || busy || save.cash < scoutCost) return;
    const seed = Math.max(1, Number(window.localStorage.getItem(SHOP_SEED_KEY) || "1")) + 1;
    window.localStorage.setItem(SHOP_SEED_KEY, String(seed));
    void persistPatch({
      cash: save.cash - scoutCost,
      scoutsUsedSeason: save.season,
      scoutsUsedThisSeason: scoutsUsed + 1,
    }, `Fresh stock scouted for ${money(scoutCost)}.`);
  }

  if (!save) return <div className="rounded-2xl border border-white/[.06] p-4 text-xs text-white/35">Loading breeder career…</div>;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Rank" value={rank.name} detail={`${reputation.toLocaleString()} reputation`} />
        <Stat label="Animal space" value={`${enclosureCount}/${roomCap}`} detail={`${Math.max(0, roomCap - enclosureCount)} enclosure slots open`} />
        <Stat label="Cash" value={money(save.cash)} detail={`Season ${save.season}`} />
        <Stat label="Project legacy" value={`${completedProjectCount}/${ALL_BREEDING_PROJECTS.length}`} detail="career breeding projects complete" />
      </div>

      <section className="rounded-2xl border border-white/[.07] bg-black/10 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><div className="text-sm font-bold text-white/75">Store scouting</div><div className="mt-1 text-[11px] text-white/35">Pay to immediately reroll the expanded snake listings instead of waiting.</div></div>
          <button disabled={busy !== "" || save.cash < scoutCost} onClick={scoutStock} className="rounded-xl border border-sky-300/20 px-4 py-2 text-xs font-black text-sky-100/75 disabled:opacity-30">Scout fresh stock · {money(scoutCost)}</button>
        </div>
      </section>

      <ProjectSection title="Breeding projects" detail="Career targets that reward deliberate selective breeding." projects={BREEDING_PROJECTS} produced={produced} claimedProjects={claimedProjects} busy={busy} claimProject={claimProject} />

      <ProjectSection title="Legacy projects" detail="Late-game goals intended to take multiple generations and keep mature saves moving." projects={CHONDRO_LONG_TERM_PROJECTS} produced={produced} claimedProjects={claimedProjects} busy={busy} claimProject={claimProject} />

      <section className="rounded-2xl border border-white/[.07] bg-black/10 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div><div className="text-sm font-bold text-white/75">Current client contracts</div><div className="mt-1 text-[10px] text-white/30">Contracts rotate with the season, so a long-running program keeps getting different short-term targets.</div></div>
          {demand ? <div className="text-[10px] text-amber-100/55">Market: {String(demand.hotTrait).replace(/([A-Z])/g, " $1").trim()} hot · +{Math.round((demand.hotTraitMultiplier - 1) * 100)}%</div> : null}
        </div>
        <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
          {contracts.map((contract) => {
            const done = claimedContracts.has(contract.id);
            const ready = !done && known.some((animal) => animalMeetsContract(contract, animal));
            return <div key={contract.id} className={`rounded-xl border p-3 ${done ? "border-emerald-300/20" : ready ? "border-amber-200/25" : "border-white/[.06]"}`}><div className="text-[9px] uppercase tracking-[.14em] text-white/25">{contract.client}</div><div className="mt-1 text-xs font-bold text-white/70">{contract.title}</div><div className="mt-1 text-[10px] leading-4 text-white/35">{contract.description}</div><div className="mt-1 text-[10px] text-white/30">Expires season {contract.expiresSeason}</div><div className="mt-2 text-[10px] text-emerald-100/55">{money(contract.rewardCash)} · +{contract.rewardReputation} rep</div><button disabled={!ready || busy !== ""} onClick={() => claimContract(contract.id)} className="mt-2 rounded-lg border border-white/[.08] px-2 py-1 text-[9px] font-bold text-white/55 disabled:opacity-25">{done ? "Fulfilled" : ready ? "Fulfill" : "No match yet"}</button></div>;
          })}
        </div>
      </section>

      {status ? <div role="status" className="text-xs text-emerald-100/65">{status}</div> : null}
    </div>
  );
}

function ProjectSection({
  title,
  detail,
  projects,
  produced,
  claimedProjects,
  busy,
  claimProject,
}: {
  title: string;
  detail: string;
  projects: typeof BREEDING_PROJECTS;
  produced: Snake[];
  claimedProjects: Set<string>;
  busy: string;
  claimProject: (id: string) => void;
}) {
  return (
    <section className="rounded-2xl border border-white/[.07] bg-black/10 p-4">
      <div className="text-sm font-bold text-white/75">{title}</div>
      <div className="mt-1 text-[10px] text-white/30">{detail}</div>
      <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        {projects.map((project) => {
          const done = claimedProjects.has(project.id);
          const ready = !done && produced.some((animal) => projectCompleted(project, animal));
          return <div key={project.id} className={`rounded-xl border p-3 ${done ? "border-emerald-300/20 bg-emerald-300/[.03]" : ready ? "border-amber-200/25 bg-amber-200/[.035]" : "border-white/[.06]"}`}><div className="text-xs font-bold text-white/70">{project.name}</div><div className="mt-1 text-[10px] leading-4 text-white/35">{project.description}</div><div className="mt-2 flex items-center justify-between gap-2"><span className="text-[10px] text-emerald-100/55">{money(project.rewardCash)} · +{project.rewardReputation} rep</span><button disabled={!ready || busy !== ""} onClick={() => claimProject(project.id)} className="rounded-lg border border-white/[.08] px-2 py-1 text-[9px] font-bold text-white/55 disabled:opacity-25">{done ? "Claimed" : ready ? "Claim" : "In progress"}</button></div></div>;
        })}
      </div>
    </section>
  );
}

function Stat({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <div className="rounded-2xl border border-white/[.06] bg-black/10 p-3"><div className="text-[9px] uppercase tracking-[.14em] text-white/25">{label}</div><div className="mt-1 text-sm font-bold text-white/70">{value}</div><div className="mt-1 text-[10px] text-white/30">{detail}</div></div>;
}
