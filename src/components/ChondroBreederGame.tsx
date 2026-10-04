"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { ChondroSnakeIcon } from "@/components/ChondroSnakeIcon";

type Subspecies =
  | "Morelia azurea azurea"
  | "Morelia azurea pulcher"
  | "Morelia azurea utaraensis"
  | "Morelia viridis";
type Locality =
  | "Biak"
  | "Numfor"
  | "Manokwari"
  | "Sorong"
  | "Timika"
  | "Cyclops"
  | "Jayapura"
  | "Lereh"
  | "Wamena"
  | "Aru"
  | "Merauke";
type Sex = "Male" | "Female";
type Source = "Captive Bred" | "Import";
type Classification = "Pure" | "Hybrid" | "Designer";
type NidoStatus = "Unknown" | "Negative" | "Positive";
type LifeStage = "Hatchling" | "Neonate" | "Subadult" | "Adult";
type TraitKey =
  "highBlack" | "highWhite" | "blueStripe" | "yellowRetention" | "blotches";

type Snake = {
  id: string;
  name: string;
  sex: Sex;
  source: Source;
  subspecies: Subspecies;
  locality: Locality | "Designer";
  neonateColor: "Red" | "Yellow";
  lifeStage: LifeStage;
  highBlack: number;
  highWhite: number;
  blueStripe: number;
  yellowRetention: number;
  blotches: number;
  body: string;
  tail: string;
  eyes: string;
  head: string;
  pattern: string;
  color: string;
  nidoStatus: NidoStatus;
  condition: "Excellent" | "Good" | "Fair";
  classification: Classification;
  generation: number;
  parentIds: string[];
  ancestry: Partial<Record<Subspecies, number>>;
  notes: string;
  breederInitials: string | null;
};
type StoreSnake = Snake & { price: number; pretested: boolean };
type Clutch = { id: string; dam: Snake; sire: Snake; offspring: Snake[] };
type ClutchRecord = Clutch & { season: number; holdbackIds: string[] };
type PlayerMarketListing = {
  id: string;
  snake_id: string;
  seller_id: string;
  snake: Snake;
  price: number;
  listed_at: string;
};
type Sale = { id: string; name: string; value: number; season: number };
type Transfer = { id: string; name: string; season: number };
type EnclosureType = "Chondro Dojo Bin" | "PVC Arboreal";
type GameSave = {
  started: boolean;
  cash: number;
  colony: Snake[];
  tested: string[];
  damId: string;
  sireId: string;
  clutch: Clutch | null;
  clutchHistory: ClutchRecord[];
  holdbacks: string[];
  season: number;
  sales: Sale[];
  transfers: Transfer[];
  enclosures: Record<EnclosureType, number>;
  purchasedStoreIds: string[];
};

const STARTING_CASH = 30000;
const NIDO_TEST_COST = 125;
const LOCAL_SAVE_KEY = "arboreal_chondro_breeder_v2";
const RODENT_COST = 2.5;
const CARE_PER_YEAR = 1500;
const DAY_MS = 86_400_000;
const enclosurePrices: Record<EnclosureType, number> = {
  "Chondro Dojo Bin": 225,
  "PVC Arboreal": 650,
};
const localitySubspecies: Record<Locality, Subspecies> = {
  Biak: "Morelia azurea azurea",
  Numfor: "Morelia azurea azurea",
  Manokwari: "Morelia azurea pulcher",
  Sorong: "Morelia azurea pulcher",
  Timika: "Morelia azurea pulcher",
  Cyclops: "Morelia azurea utaraensis",
  Jayapura: "Morelia azurea utaraensis",
  Lereh: "Morelia azurea utaraensis",
  Wamena: "Morelia azurea utaraensis",
  Aru: "Morelia viridis",
  Merauke: "Morelia viridis",
};
const allLocalities = Object.keys(localitySubspecies) as Locality[];
const traitRows: [string, TraitKey][] = [
  ["High Black", "highBlack"],
  ["High White", "highWhite"],
  ["Blue", "blueStripe"],
  ["Yellow", "yellowRetention"],
  ["Blotches", "blotches"],
];
const money = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
const clamp = (n: number, max = 100) =>
  Math.max(0, Math.min(max, Math.round(n)));
const pick = <T,>(a: T, b: T) => (Math.random() < 0.5 ? a : b);
const tailFor = (s: Subspecies) =>
  s === "Morelia azurea utaraensis"
    ? "Matching body color and pattern"
    : "Black-dipped";
const portraitTraits = (a: Snake) => ({
  highBlack: a.highBlack,
  highWhite: a.highWhite,
  blueStripe: a.blueStripe,
  yellowRetention: a.yellowRetention,
  blotches: a.blotches ?? 0,
});

function makeSnake(
  id: string,
  name: string,
  sex: Sex,
  source: Source,
  locality: Locality,
  neonateColor: "Red" | "Yellow",
  lifeStage: LifeStage,
  highBlack: number,
  highWhite: number,
  blueStripe: number,
  yellowRetention: number,
  blotches: number,
  condition: Snake["condition"] = "Good",
): Snake {
  const subspecies = localitySubspecies[locality];
  return {
    id,
    name,
    sex,
    source,
    subspecies,
    locality,
    neonateColor,
    lifeStage,
    highBlack,
    highWhite,
    blueStripe: clamp(blueStripe),
    yellowRetention,
    blotches,
    body: subspecies,
    tail: tailFor(subspecies),
    eyes: subspecies,
    head: subspecies,
    pattern: locality,
    color: locality,
    nidoStatus: "Unknown",
    condition,
    classification: "Pure",
    generation: 1,
    parentIds: [],
    ancestry: { [subspecies]: 100 },
    notes: "",
    breederInitials: null,
  };
}
function makeHybrid(
  id: string,
  name: string,
  sex: Sex,
  neonateColor: "Red" | "Yellow",
  lifeStage: LifeStage,
  a: Locality,
  b: Locality,
  traits: [number, number, number, number, number],
): Snake {
  const sa = localitySubspecies[a],
    sb = localitySubspecies[b],
    structural = Math.random() < 0.5 ? sa : sb;
  return {
    id,
    name,
    sex,
    source: "Captive Bred",
    subspecies: structural,
    locality: "Designer",
    neonateColor,
    lifeStage,
    highBlack: traits[0],
    highWhite: traits[1],
    blueStripe: traits[2],
    yellowRetention: traits[3],
    blotches: traits[4],
    body: structural,
    tail: tailFor(structural),
    eyes: structural,
    head: structural,
    pattern: a,
    color: b,
    nidoStatus: "Unknown",
    condition: "Good",
    classification: "Hybrid",
    generation: 1,
    parentIds: [],
    ancestry: { [sa]: 50, [sb]: 50 },
    notes: "",
    breederInitials: null,
  };
}
function seeded(seed: number) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function storeForEpoch(epoch: number): StoreSnake[] {
  const random = seeded(epoch * 7919 + 73),
    offers: StoreSnake[] = [];
  for (let i = 0; i < 10; i++) {
    const isHybrid = i === 8 || (i > 5 && random() < 0.28),
      source: Source = random() < 0.48 ? "Import" : "Captive Bred",
      sex: Sex = random() < 0.5 ? "Male" : "Female",
      neonateColor: "Red" | "Yellow" = random() < 0.38 ? "Red" : "Yellow";
    const stages: LifeStage[] = ["Hatchling", "Neonate", "Subadult", "Adult"],
      lifeStage = stages[Math.floor(random() * stages.length)];
    const a = allLocalities[Math.floor(random() * allLocalities.length)];
    let b = allLocalities[Math.floor(random() * allLocalities.length)];
    while (localitySubspecies[b] === localitySubspecies[a])
      b = allLocalities[Math.floor(random() * allLocalities.length)];
    const roll = () => (random() < 0.08 ? 70 + random() * 30 : random() * 55);
    const hb = clamp(roll()),
      hw = clamp(roll()),
      blue = clamp(roll()),
      yr = clamp(roll()),
      bl = clamp(roll()),
      baseName = isHybrid ? `${a} × ${b}` : a;
    const snake = isHybrid
      ? makeHybrid(
          `STORE-${epoch}-${i}`,
          `${baseName} Hybrid`,
          sex,
          neonateColor,
          lifeStage,
          a,
          b,
          [hb, hw, blue, yr, bl],
        )
      : makeSnake(
          `STORE-${epoch}-${i}`,
          `${baseName} ${source === "Import" ? "Import" : "CB"}`,
          sex,
          source,
          a,
          neonateColor,
          lifeStage,
          hb,
          hw,
          blue,
          yr,
          bl,
          source === "Import" ? "Fair" : "Good",
        );
    const pretested = random() < 0.38;
    if (pretested) snake.nidoStatus = "Negative";
    const stageMultiplier =
      lifeStage === "Hatchling"
        ? 0.55
        : lifeStage === "Neonate"
          ? 0.75
          : lifeStage === "Subadult"
            ? 1
            : 1.28;
    const price =
      Math.round(
        (((source === "Import" ? 950 : 2200) +
          (isHybrid ? 900 : 0) +
          (neonateColor === "Red" ? 700 : 0) +
          (pretested ? 425 : 0) +
          (hb + hw + blue + yr + bl) * 12) *
          stageMultiplier) /
          25,
      ) * 25;
    offers.push({ ...snake, price, pretested });
  }
  return offers;
}
function inheritLineTrait(a: number, b: number) {
  const midpoint = (a + b) / 2,
    ordinary = midpoint + (Math.random() + Math.random() - 1) * 18,
    rare =
      Math.random() < 0.055
        ? Math.random() < 0.72
          ? 10 + Math.random() * 12
          : -(8 + Math.random() * 10)
        : 0,
    raw = ordinary + rare;
  return clamp(raw - (raw > 85 ? (raw - 85) * 0.45 : 0));
}
function combineAncestry(a: Snake, b: Snake) {
  const out: Partial<Record<Subspecies, number>> = {};
  const keys = Object.keys({ ...a.ancestry, ...b.ancestry }) as Subspecies[];
  for (const key of keys)
    out[key] =
      Math.round((((a.ancestry[key] ?? 0) + (b.ancestry[key] ?? 0)) / 2) * 10) /
      10;
  return out;
}
function classifyPair(a: Snake, b: Snake): Classification {
  if (a.classification !== "Pure" || b.classification !== "Pure")
    return "Designer";
  return a.subspecies === b.subspecies ? "Pure" : "Hybrid";
}
function makeOffspring(
  dam: Snake,
  sire: Snake,
  clutchId: string,
  index: number,
  breederInitials: string,
): Snake {
  const classification = classifyPair(dam, sire),
    structural = pick(dam, sire),
    pureSame = classification === "Pure" && dam.subspecies === sire.subspecies;
  return {
    id: `${breederInitials}-${clutchId}-${String(index + 1).padStart(2, "0")}`,
    name: `Hatchling ${index + 1}`,
    sex: Math.random() < 0.5 ? "Male" : "Female",
    source: "Captive Bred",
    subspecies: pureSame ? dam.subspecies : structural.subspecies,
    locality: pureSame ? pick(dam.locality, sire.locality) : "Designer",
    neonateColor: pick(dam.neonateColor, sire.neonateColor),
    lifeStage: "Hatchling",
    highBlack: inheritLineTrait(dam.highBlack, sire.highBlack),
    highWhite: inheritLineTrait(dam.highWhite, sire.highWhite),
    blueStripe: inheritLineTrait(dam.blueStripe, sire.blueStripe),
    yellowRetention: inheritLineTrait(
      dam.yellowRetention,
      sire.yellowRetention,
    ),
    blotches: inheritLineTrait(dam.blotches ?? 0, sire.blotches ?? 0),
    body: pick(dam.body, sire.body),
    tail: pick(dam.tail, sire.tail),
    eyes: pick(dam.eyes, sire.eyes),
    head: pick(dam.head, sire.head),
    pattern: pick(dam.pattern, sire.pattern),
    color: pick(dam.color, sire.color),
    nidoStatus: "Unknown",
    condition: "Good",
    classification,
    generation: Math.max(dam.generation, sire.generation) + 1,
    parentIds: [dam.id, sire.id],
    ancestry: combineAncestry(dam, sire),
    notes: "",
    breederInitials,
  };
}
function createClutch(
  dam: Snake,
  sire: Snake,
  breederInitials: string,
): Clutch {
  const id = `CL-${Date.now().toString(36).toUpperCase()}`,
    size = 5 + Math.floor(Math.random() * 5);
  return {
    id,
    dam,
    sire,
    offspring: Array.from({ length: size }, (_, i) =>
      makeOffspring(dam, sire, id, i, breederInitials),
    ),
  };
}
function saleValue(a: Snake) {
  const traits = [
      a.highBlack,
      a.highWhite,
      a.blueStripe,
      a.yellowRetention,
      a.blotches ?? 0,
    ],
    strongest = Math.max(...traits),
    avg = traits.reduce((s, v) => s + v, 0) / traits.length;
  let value = 300 + avg * 12 + strongest * 18;
  if (a.neonateColor === "Red") value *= 1.18;
  if (a.classification === "Hybrid") value *= 1.08;
  if (a.classification === "Designer") value *= 1.16;
  if (a.lifeStage === "Adult") value *= 1.35;
  if (a.lifeStage === "Subadult") value *= 1.16;
  if (a.nidoStatus === "Negative") value *= 1.08;
  if (a.nidoStatus === "Unknown") value *= 0.9;
  if (a.condition === "Fair") value *= 0.82;
  return Math.max(250, Math.round(value / 25) * 25);
}
function agingRequirement(a: Snake) {
  if (a.lifeStage === "Adult") return null;
  if (a.lifeStage === "Hatchling")
    return { next: "Neonate" as LifeStage, mice: 25, months: 6 };
  if (a.lifeStage === "Neonate")
    return { next: "Subadult" as LifeStage, mice: 150, months: 36 };
  if (a.sex === "Female")
    return { next: "Adult" as LifeStage, mice: 100, months: 24 };
  return { next: "Adult" as LifeStage, mice: 25, months: 6 };
}
function agingCost(a: Snake) {
  const req = agingRequirement(a);
  return req
    ? Math.round(
        (req.mice * RODENT_COST + (req.months / 12) * CARE_PER_YEAR) * 100,
      ) / 100
    : 0;
}
function isGameSave(value: unknown): value is GameSave {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const save = value as Partial<GameSave>;
  return (
    Array.isArray(save.colony) &&
    typeof save.cash === "number" &&
    save.enclosures != null
  );
}
function normalizeSnake(a: Snake): Snake {
  return {
    ...a,
    blotches: Number(a.blotches ?? 0),
    blueStripe: Number(a.blueStripe ?? 0),
    notes: typeof a.notes === "string" ? a.notes : "",
    breederInitials:
      typeof a.breederInitials === "string" ? a.breederInitials : null,
  };
}

function CollapsibleGameSection({
  label,
  detail,
  children,
  defaultOpen = false,
}: {
  label: string;
  detail?: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  return (
    <details
      open={isOpen}
      onToggle={(event) => setIsOpen(event.currentTarget.open)}
      className="group mt-5"
    >
      <summary className="panel flex cursor-pointer list-none items-center justify-between gap-4 rounded-2xl px-5 py-4 transition hover:border-emerald-300/15 [&::-webkit-details-marker]:hidden">
        <div>
          <div className="text-sm font-bold text-white/75">{label}</div>
          {detail ? (
            <div className="mt-1 text-[10px] text-white/30">{detail}</div>
          ) : null}
        </div>
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-white/[.08] text-lg text-white/45 transition group-open:rotate-45">
          +
        </span>
      </summary>
      <div className="mt-3">{children}</div>
    </details>
  );
}

export function ChondroBreederGame() {
  const [started, setStarted] = useState(false),
    [cash, setCash] = useState(STARTING_CASH),
    [colony, setColony] = useState<Snake[]>([]),
    [tested, setTested] = useState<string[]>([]),
    [damId, setDamId] = useState(""),
    [sireId, setSireId] = useState(""),
    [clutch, setClutch] = useState<Clutch | null>(null),
    [clutchHistory, setClutchHistory] = useState<ClutchRecord[]>([]),
    [holdbacks, setHoldbacks] = useState<string[]>([]),
    [season, setSeason] = useState(1),
    [sales, setSales] = useState<Sale[]>([]),
    [transfers, setTransfers] = useState<Transfer[]>([]),
    [enclosures, setEnclosures] = useState<Record<EnclosureType, number>>({
      "Chondro Dojo Bin": 0,
      "PVC Arboreal": 0,
    }),
    [purchasedStoreIds, setPurchasedStoreIds] = useState<string[]>([]),
    [playerMarket, setPlayerMarket] = useState<PlayerMarketListing[]>([]),
    [marketStatus, setMarketStatus] = useState(""),
    [marketBusy, setMarketBusy] = useState<string | null>(null),
    [breederInitials, setBreederInitials] = useState<string | null>(null),
    [initialsInput, setInitialsInput] = useState(""),
    [initialsPrompt, setInitialsPrompt] = useState(false),
    [initialsStatus, setInitialsStatus] = useState(""),
    [selectedSnakeId, setSelectedSnakeId] = useState<string | null>(null),
    [storeIndex, setStoreIndex] = useState(0),
    [hydrated, setHydrated] = useState(false),
    [cloudSave, setCloudSave] = useState(false),
    [now, setNow] = useState(Date.now());
  const storeEpoch = Math.floor(now / DAY_MS),
    store = useMemo(() => storeForEpoch(storeEpoch), [storeEpoch]),
    nextRefresh = (storeEpoch + 1) * DAY_MS,
    capacity = enclosures["Chondro Dojo Bin"] + enclosures["PVC Arboreal"],
    openSlots = Math.max(0, capacity - colony.length),
    females = colony.filter(
      (a) => a.sex === "Female" && a.lifeStage === "Adult",
    ),
    males = colony.filter((a) => a.sex === "Male" && a.lifeStage === "Adult"),
    dam = colony.find((a) => a.id === damId) ?? null,
    sire = colony.find((a) => a.id === sireId) ?? null,
    saleIncome = sales.reduce((s, x) => s + x.value, 0);
  const knownSnakes = useMemo(() => {
    const records = new Map<string, Snake>();
    for (const animal of colony) records.set(animal.id, animal);
    for (const record of clutchHistory) {
      records.set(record.dam.id, record.dam);
      records.set(record.sire.id, record.sire);
      for (const baby of record.offspring)
        if (!records.has(baby.id)) records.set(baby.id, baby);
    }
    return records;
  }, [colony, clutchHistory]);
  const selectedAnimal = selectedSnakeId
    ? (knownSnakes.get(selectedSnakeId) ?? null)
    : null;
  const selectedParents =
    selectedAnimal?.parentIds
      .map((id) => knownSnakes.get(id))
      .filter((animal): animal is Snake => !!animal) ?? [];
  const selectedOffspring = selectedAnimal
    ? [...knownSnakes.values()].filter((animal) =>
        animal.parentIds.includes(selectedAnimal.id),
      )
    : [];
  const selectedClutches = selectedAnimal
    ? clutchHistory.filter(
        (record) =>
          record.dam.id === selectedAnimal.id ||
          record.sire.id === selectedAnimal.id,
      )
    : [];

  useEffect(() => {
    let cancelled = false;
    async function load() {
      let local: GameSave | null = null;
      try {
        const raw = window.localStorage.getItem(LOCAL_SAVE_KEY),
          parsed: unknown = raw ? JSON.parse(raw) : null;
        if (isGameSave(parsed)) local = parsed;
      } catch {}
      let chosen = local;
      try {
        const response = await fetch("/api/hatchery/chondro-breeder/save", {
          cache: "no-store",
        });
        if (response.ok) {
          const data = await response.json();
          if (data.authenticated) setCloudSave(true);
          if (isGameSave(data.save?.state)) chosen = data.save.state;
        }
      } catch {}
      if (!cancelled && chosen) {
        setStarted(chosen.started);
        setCash(chosen.cash);
        setColony((chosen.colony ?? []).map(normalizeSnake));
        setTested(chosen.tested ?? []);
        setDamId(chosen.damId ?? "");
        setSireId(chosen.sireId ?? "");
        setClutch(
          chosen.clutch
            ? {
                ...chosen.clutch,
                dam: normalizeSnake(chosen.clutch.dam),
                sire: normalizeSnake(chosen.clutch.sire),
                offspring: chosen.clutch.offspring.map(normalizeSnake),
              }
            : null,
        );
        setClutchHistory(
          (chosen.clutchHistory ?? []).map((record) => ({
            ...record,
            dam: normalizeSnake(record.dam),
            sire: normalizeSnake(record.sire),
            offspring: record.offspring.map(normalizeSnake),
            holdbackIds: record.holdbackIds ?? [],
          })),
        );
        setHoldbacks(chosen.holdbacks ?? []);
        setSeason(chosen.season ?? 1);
        setSales(chosen.sales ?? []);
        setTransfers(chosen.transfers ?? []);
        setEnclosures(
          chosen.enclosures ?? { "Chondro Dojo Bin": 0, "PVC Arboreal": 0 },
        );
        setPurchasedStoreIds(chosen.purchasedStoreIds ?? []);
      }
      if (!cancelled) setHydrated(true);
    }
    void load();
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);
  useEffect(() => {
    if (!hydrated) return;
    const save: GameSave = {
      started,
      cash,
      colony,
      tested,
      damId,
      sireId,
      clutch,
      clutchHistory,
      holdbacks,
      season,
      sales,
      transfers,
      enclosures,
      purchasedStoreIds,
    };
    const timer = window.setTimeout(() => {
      try {
        window.localStorage.setItem(LOCAL_SAVE_KEY, JSON.stringify(save));
      } catch {}
      if (cloudSave)
        void fetch("/api/hatchery/chondro-breeder/save", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(save),
        });
    }, 650);
    return () => window.clearTimeout(timer);
  }, [
    hydrated,
    cloudSave,
    started,
    cash,
    colony,
    tested,
    damId,
    sireId,
    clutch,
    clutchHistory,
    holdbacks,
    season,
    sales,
    transfers,
    enclosures,
    purchasedStoreIds,
  ]);
  useEffect(() => {
    if (!hydrated) return;
    let cancelled = false;
    async function loadMarket() {
      try {
        const response = await fetch(
          "/api/hatchery/chondro-breeder/player-market",
          { cache: "no-store" },
        );
        const data = await response.json();
        if (!cancelled) {
          setPlayerMarket(
            (data.listings ?? []).map((listing: PlayerMarketListing) => ({
              ...listing,
              snake: normalizeSnake(listing.snake),
            })),
          );
          if (response.status === 401)
            setMarketStatus(
              "Sign in to buy or sell snakes with other players.",
            );
        }
      } catch {
        if (!cancelled)
          setMarketStatus("The player market is temporarily unavailable.");
      }
    }
    void loadMarket();
    const timer = window.setInterval(loadMarket, 20_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [hydrated]);
  useEffect(() => {
    if (!hydrated) return;
    let cancelled = false;
    async function loadBreederIdentity() {
      try {
        const response = await fetch(
          "/api/hatchery/chondro-breeder/breeder-identity",
          { cache: "no-store" },
        );
        const data = await response.json();
        if (!cancelled && response.ok)
          setBreederInitials(data.initials ?? null);
      } catch {}
    }
    void loadBreederIdentity();
    return () => {
      cancelled = true;
    };
  }, [hydrated]);

  function buyEnclosure(type: EnclosureType) {
    const price = enclosurePrices[type];
    if (cash < price) return;
    setCash((v) => v - price);
    setEnclosures((c) => ({ ...c, [type]: c[type] + 1 }));
  }
  function buySnake(offer: StoreSnake) {
    if (
      cash < offer.price ||
      openSlots <= 0 ||
      purchasedStoreIds.includes(offer.id)
    )
      return;
    setCash((v) => v - offer.price);
    setColony((c) => [...c, { ...offer }]);
    setPurchasedStoreIds((c) => [...c, offer.id]);
  }
  function testSnake(id: string) {
    if (tested.includes(id) || cash < NIDO_TEST_COST) return;
    setCash((v) => v - NIDO_TEST_COST);
    setTested((c) => [...c, id]);
    setColony((c) =>
      c.map((a) =>
        a.id !== id
          ? a
          : {
              ...a,
              nidoStatus:
                Math.random() < (a.source === "Import" ? 0.12 : 0.018)
                  ? "Positive"
                  : "Negative",
            },
      ),
    );
  }
  function ageSnake(a: Snake) {
    const req = agingRequirement(a),
      cost = agingCost(a);
    if (!req || cash < cost) return;
    setCash((v) => v - cost);
    setColony((c) =>
      c.map((x) =>
        x.id === a.id
          ? {
              ...x,
              lifeStage: req.next,
              condition: x.condition === "Fair" ? "Good" : x.condition,
            }
          : x,
      ),
    );
  }
  function updateSnakeDetails(
    id: string,
    field: "name" | "notes",
    value: string,
  ) {
    const limit = field === "name" ? 60 : 1000;
    setColony((c) =>
      c.map((a) =>
        a.id === id ? { ...a, [field]: value.slice(0, limit) } : a,
      ),
    );
  }
  async function refreshPlayerMarket() {
    const response = await fetch(
      "/api/hatchery/chondro-breeder/player-market",
      { cache: "no-store" },
    );
    const data = await response.json();
    if (response.ok)
      setPlayerMarket(
        (data.listings ?? []).map((listing: PlayerMarketListing) => ({
          ...listing,
          snake: normalizeSnake(listing.snake),
        })),
      );
  }
  async function sellSnake(a: Snake) {
    if (a.nidoStatus === "Positive" || marketBusy) return;
    const value = saleValue(a);
    setMarketBusy(a.id);
    setMarketStatus("");
    const response = await fetch(
      "/api/hatchery/chondro-breeder/player-market",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "list", snakeId: a.id, price: value }),
      },
    );
    const data = await response.json();
    setMarketBusy(null);
    if (!response.ok) {
      setMarketStatus(data.error ?? "This snake could not be listed.");
      return;
    }
    setCash((v) => v + value);
    setSales((c) => [{ id: a.id, name: a.name, value, season }, ...c]);
    setColony((c) => c.filter((x) => x.id !== a.id));
    if (damId === a.id) setDamId("");
    if (sireId === a.id) setSireId("");
    setMarketStatus(`${a.name} is now available to every player.`);
    void refreshPlayerMarket();
  }
  async function buyPlayerSnake(listing: PlayerMarketListing) {
    if (marketBusy) return;
    setMarketBusy(listing.id);
    setMarketStatus("");
    const response = await fetch(
      "/api/hatchery/chondro-breeder/player-market",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "buy", listingId: listing.id }),
      },
    );
    const data = await response.json();
    setMarketBusy(null);
    if (!response.ok) {
      setMarketStatus(data.error ?? "This snake is no longer available.");
      void refreshPlayerMarket();
      return;
    }
    setCash((value) => value - listing.price);
    setColony((current) => [...current, normalizeSnake(data.result.snake)]);
    setPlayerMarket((current) =>
      current.filter((item) => item.id !== listing.id),
    );
    setMarketStatus(`${listing.snake.name} joined your colony.`);
  }
  function transferPositive(a: Snake) {
    if (a.nidoStatus !== "Positive") return;
    setTransfers((c) => [{ id: a.id, name: a.name, season }, ...c]);
    setColony((c) => c.filter((x) => x.id !== a.id));
    if (damId === a.id) setDamId("");
    if (sireId === a.id) setSireId("");
  }
  function produceClutch(initials: string) {
    if (!dam || !sire) return;
    setClutch(createClutch(dam, sire, initials));
    setHoldbacks([]);
  }
  function breedSelected() {
    if (!dam || !sire) return;
    if (!breederInitials) {
      setInitialsPrompt(true);
      setInitialsStatus("");
      return;
    }
    produceClutch(breederInitials);
  }
  async function claimBreederInitials() {
    const initials = initialsInput.trim().toUpperCase();
    if (!/^[A-Z]{2,5}$/.test(initials)) {
      setInitialsStatus("Choose 2–5 letters.");
      return;
    }
    setInitialsStatus("Checking availability…");
    const response = await fetch(
      "/api/hatchery/chondro-breeder/breeder-identity",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ initials }),
      },
    );
    const data = await response.json();
    if (!response.ok) {
      setInitialsStatus(data.error ?? "Those initials could not be claimed.");
      return;
    }
    setBreederInitials(data.initials);
    setInitialsPrompt(false);
    setInitialsStatus("");
    produceClutch(data.initials);
  }
  function toggleHoldback(id: string) {
    setHoldbacks((c) =>
      c.includes(id)
        ? c.filter((x) => x !== id)
        : c.length < openSlots
          ? [...c, id]
          : c,
    );
  }
  async function finishClutch() {
    if (!clutch || marketBusy) return;
    const kept = clutch.offspring.filter((baby) => holdbacks.includes(baby.id));
    const sold = clutch.offspring.filter(
      (baby) => !holdbacks.includes(baby.id),
    );
    const saleItems = sold.map((baby) => ({
      snakeId: baby.id,
      price: saleValue(baby),
    }));
    const total = saleItems.reduce((sum, item) => sum + item.price, 0);

    if (sold.length) {
      setMarketBusy("clutch");
      setMarketStatus(`Listing ${sold.length} unheld offspring…`);
      try {
        const response = await fetch(
          "/api/hatchery/chondro-breeder/player-market",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "list-clutch",
              clutch,
              holdbackIds: holdbacks,
              saleItems,
            }),
          },
        );
        const data = await response.json();
        if (!response.ok) {
          setMarketStatus(
            data.error ??
              "The clutch could not be listed. Nothing was changed.",
          );
          return;
        }
      } catch {
        setMarketStatus("The clutch could not be listed. Nothing was changed.");
        return;
      } finally {
        setMarketBusy(null);
      }
    }

    setColony((current) => [...current, ...kept]);
    setClutchHistory((current) => [
      { ...clutch, season, holdbackIds: [...holdbacks] },
      ...current,
    ]);
    setCash((current) => current + total);
    setSales((current) => [
      ...sold.map((baby, index) => ({
        id: baby.id,
        name: baby.name,
        value: saleItems[index].price,
        season,
      })),
      ...current,
    ]);
    setClutch(null);
    setHoldbacks([]);
    setDamId("");
    setSireId("");
    setSeason((current) => current + 1);
    if (sold.length) {
      setMarketStatus(
        `${sold.length} unheld offspring listed for ${money(total)} total.`,
      );
      void refreshPlayerMarket();
    }
  }
  function resetGame() {
    if (!window.confirm("Reset Arboreal Keeper and erase this save?")) return;
    setStarted(false);
    setCash(STARTING_CASH);
    setColony([]);
    setTested([]);
    setDamId("");
    setSireId("");
    setClutch(null);
    setClutchHistory([]);
    setHoldbacks([]);
    setSeason(1);
    setSales([]);
    setTransfers([]);
    setEnclosures({ "Chondro Dojo Bin": 0, "PVC Arboreal": 0 });
    setPurchasedStoreIds([]);
    setSelectedSnakeId(null);
    try {
      window.localStorage.removeItem(LOCAL_SAVE_KEY);
    } catch {}
  }

  if (!hydrated)
    return (
      <div className="mx-auto max-w-5xl px-5 py-16 sm:px-6">
        <div className="panel rounded-[30px] p-8 text-center text-sm text-white/45">
          Loading your Arboreal Keeper save…
        </div>
      </div>
    );
  if (!started)
    return (
      <div className="mx-auto max-w-5xl px-5 py-10 sm:px-6">
        <section className="panel rounded-[32px] p-7 sm:p-10">
          <div className="text-[10px] font-black uppercase tracking-[.2em] text-amber-200/55">
            Start Your Dream Sweepstakes
          </div>
          <h1 className="mt-4 text-4xl font-semibold sm:text-5xl">
            You won {money(STARTING_CASH)}.
          </h1>
          <p className="mt-5 max-w-2xl text-sm leading-7 text-white/45">
            Build the colony your way. Buy enclosures, then choose from imports,
            captive-bred animals and a few early hybrids. Every enclosure holds
            one snake.
          </p>
          <div className="mt-5 text-xs text-white/32">
            Progress autosaves to this browser
            {cloudSave ? " and your Arboreal Planet account" : ""}.
          </div>
          <button
            onClick={() => setStarted(true)}
            className="mt-8 rounded-2xl bg-amber-200 px-6 py-3 text-sm font-black text-[#17130a]"
          >
            Start with $30K
          </button>
        </section>
      </div>
    );

  return (
    <div className="mx-auto max-w-7xl px-5 py-10 sm:px-6">
      <CollapsibleGameSection
        label="Player snake market"
        detail={`${playerMarket.length} snake${playerMarket.length === 1 ? "" : "s"} available from players`}
      >
        <section className="overflow-hidden rounded-[30px] border border-emerald-300/10 bg-emerald-300/[.025] p-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="section-kicker">Player snake market</div>
              <h2 className="mt-2 text-2xl font-semibold">
                Snakes sold by real players
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-white/38">
                Every animal is unique. Once one player buys a listing, it
                disappears for everyone else.
              </p>
            </div>
            <button
              onClick={() => void refreshPlayerMarket()}
              className="rounded-xl border border-white/[.08] px-4 py-2 text-xs font-bold text-white/55"
            >
              Refresh market
            </button>
          </div>
          {marketStatus ? (
            <div
              role="status"
              className="mt-4 rounded-xl border border-amber-200/10 bg-amber-200/[.03] p-3 text-xs text-amber-100/65"
            >
              {marketStatus}
            </div>
          ) : null}
          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {playerMarket.map((listing) => {
              const animal = listing.snake,
                canAfford = cash >= listing.price,
                hasSpace = openSlots > 0;
              return (
                <article
                  key={listing.id}
                  className="rounded-3xl border border-white/[.06] bg-black/10 p-4"
                >
                  <ChondroSnakeIcon
                    subspecies={animal.subspecies}
                    name={animal.name}
                    traits={portraitTraits(animal)}
                    compact
                  />
                  <div className="mt-3 flex items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold text-white/75">
                        {animal.name}
                      </div>
                      <div className="mt-1 text-[10px] text-white/30">
                        {animal.sex} · {animal.lifeStage} · Gen{" "}
                        {animal.generation}
                      </div>
                    </div>
                    <span className="rounded-full border border-white/[.08] px-2 py-1 text-[9px] uppercase text-white/40">
                      {animal.classification}
                    </span>
                  </div>
                  <div className="mt-3 text-[10px] text-white/34">
                    HB {animal.highBlack}% · HW {animal.highWhite}% · Blue{" "}
                    {animal.blueStripe}% · Yellow {animal.yellowRetention}% ·
                    Blotches {animal.blotches}%
                  </div>
                  <div className="mt-2 text-[10px] text-white/30">
                    {animal.subspecies} · {animal.locality} · Nido{" "}
                    {animal.nidoStatus}
                  </div>
                  <div className="mt-4 flex items-center justify-between gap-3">
                    <div className="text-lg font-semibold text-emerald-200/75">
                      {money(listing.price)}
                    </div>
                    <button
                      disabled={!!marketBusy || !canAfford || !hasSpace}
                      onClick={() => void buyPlayerSnake(listing)}
                      className="rounded-xl bg-emerald-300 px-4 py-2 text-xs font-black text-[#06100c] disabled:opacity-30"
                    >
                      {marketBusy === listing.id
                        ? "Claiming…"
                        : !hasSpace
                          ? "Need enclosure"
                          : !canAfford
                            ? "Not enough cash"
                            : "Buy snake"}
                    </button>
                  </div>
                </article>
              );
            })}
            {!playerMarket.length ? (
              <div className="rounded-2xl border border-dashed border-white/[.08] p-6 text-sm text-white/30 md:col-span-2 xl:col-span-3">
                No player-listed snakes are available yet. The first eligible
                snake sold by a signed-in player will appear here.
              </div>
            ) : null}
          </div>
        </section>
      </CollapsibleGameSection>
      <CollapsibleGameSection
        label="Program records"
        detail={`${colony.length} active · ${clutchHistory.length} completed clutch${clutchHistory.length === 1 ? "" : "es"}`}
      >
        <section className="panel rounded-[28px] p-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="section-kicker">Program records</div>
              <h2 className="mt-2 text-2xl font-semibold">
                Snakes, pedigrees and clutch history
              </h2>
              <p className="mt-2 text-sm text-white/34">
                Open any animal to view its complete record and move through its
                family.
              </p>
            </div>
            <div className="text-xs text-white/30">
              {colony.length} active · {clutchHistory.length} completed clutch
              {clutchHistory.length === 1 ? "" : "es"}
            </div>
          </div>
          <div className="mt-5 flex gap-2 overflow-x-auto pb-2">
            {colony.map((animal) => (
              <button
                key={animal.id}
                onClick={() => setSelectedSnakeId(animal.id)}
                className="min-w-44 rounded-2xl border border-white/[.07] bg-white/[.02] p-4 text-left transition hover:border-amber-200/25"
              >
                <div className="truncate font-semibold text-white/75">
                  {animal.name || "Unnamed snake"}
                </div>
                <div className="mt-1 text-[10px] text-white/30">
                  {animal.sex} · {animal.lifeStage} · Gen {animal.generation}
                </div>
                <div className="mt-3 text-[10px] font-bold uppercase tracking-[.12em] text-amber-100/55">
                  Open record →
                </div>
              </button>
            ))}
            {!colony.length ? (
              <div className="text-sm text-white/30">
                Your owned snakes will appear here.
              </div>
            ) : null}
          </div>
          {clutchHistory.length ? (
            <div className="mt-6">
              <div className="text-[10px] font-black uppercase tracking-[.15em] text-white/30">
                Clutch ledger
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                {clutchHistory.map((record) => {
                  const strongest = record.offspring.reduce(
                    (best, baby) =>
                      Math.max(
                        best,
                        baby.highBlack,
                        baby.highWhite,
                        baby.blueStripe,
                        baby.yellowRetention,
                        baby.blotches,
                      ),
                    0,
                  );
                  return (
                    <article
                      key={record.id}
                      className="rounded-2xl border border-white/[.06] bg-black/10 p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-semibold text-white/72">
                            {record.dam.name} × {record.sire.name}
                          </div>
                          <div className="mt-1 text-[10px] text-white/30">
                            Season {record.season} · {record.id}
                          </div>
                        </div>
                        <span className="rounded-full border border-white/[.07] px-2 py-1 text-[9px] text-white/40">
                          {record.offspring.length} hatched
                        </span>
                      </div>
                      <div className="mt-3 text-xs text-white/38">
                        {record.holdbackIds.length} held back · strongest
                        expression {strongest}%
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          onClick={() => setSelectedSnakeId(record.dam.id)}
                          className="rounded-lg border border-white/[.07] px-3 py-2 text-[10px] font-bold text-white/55"
                        >
                          Dam record
                        </button>
                        <button
                          onClick={() => setSelectedSnakeId(record.sire.id)}
                          className="rounded-lg border border-white/[.07] px-3 py-2 text-[10px] font-bold text-white/55"
                        >
                          Sire record
                        </button>
                        {record.offspring.slice(0, 3).map((baby) => (
                          <button
                            key={baby.id}
                            onClick={() => setSelectedSnakeId(baby.id)}
                            className="rounded-lg border border-amber-200/10 px-3 py-2 text-[10px] font-bold text-amber-100/55"
                          >
                            {baby.name}
                          </button>
                        ))}
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="mt-5 rounded-2xl border border-dashed border-white/[.07] p-5 text-sm text-white/28">
              Completed clutches will be preserved here when you advance the
              season.
            </div>
          )}
        </section>
      </CollapsibleGameSection>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="section-kicker">
            Arboreal Keeper · Season {season}
          </div>
          <h1 className="mt-2 text-3xl font-semibold">Build your program</h1>
          <p className="mt-2 text-sm text-white/34">
            Autosave: {cloudSave ? "browser + account" : "browser"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="rounded-2xl border border-white/[.07] bg-white/[.02] px-4 py-3">
            <div className="text-[9px] uppercase tracking-[.14em] text-white/24">
              Cash
            </div>
            <div className="mt-1 font-semibold text-emerald-200/75">
              {money(cash)}
            </div>
          </div>
          <div className="rounded-2xl border border-white/[.07] bg-white/[.02] px-4 py-3">
            <div className="text-[9px] uppercase tracking-[.14em] text-white/24">
              Capacity
            </div>
            <div className="mt-1 font-semibold text-white/65">
              {colony.length}/{capacity}
            </div>
          </div>
          <button
            onClick={resetGame}
            className="rounded-2xl border border-red-300/15 px-4 py-3 text-xs font-bold text-red-100/55"
          >
            Reset game
          </button>
        </div>
      </div>

      <CollapsibleGameSection
        label="Enclosures"
        detail={`${capacity} total spaces · ${openSlots} open`}
      >
        <section className="panel rounded-[28px] p-6">
          <div className="section-kicker">Enclosures</div>
          <h2 className="mt-2 text-2xl font-semibold">
            Buy space before you buy snakes.
          </h2>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {(Object.keys(enclosurePrices) as EnclosureType[]).map((type) => (
              <div
                key={type}
                className="rounded-2xl border border-white/[.06] p-4"
              >
                <div className="text-lg font-semibold">{type}</div>
                <div className="mt-1 text-xs text-white/35">
                  1 snake capacity · Owned: {enclosures[type]}
                </div>
                <button
                  disabled={cash < enclosurePrices[type]}
                  onClick={() => buyEnclosure(type)}
                  className="mt-4 rounded-xl bg-emerald-300 px-4 py-2 text-xs font-black text-[#06100c] disabled:opacity-30"
                >
                  Buy · {money(enclosurePrices[type])}
                </button>
              </div>
            ))}
          </div>
        </section>
      </CollapsibleGameSection>

      <CollapsibleGameSection
        label="Daily snake store"
        detail={`Offer ${storeIndex + 1} of ${store.length} · refreshes in ~${Math.max(1, Math.ceil((nextRefresh - now) / 3_600_000))}h`}
      >
        <section className="panel rounded-[28px] p-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="section-kicker">Daily snake store</div>
              <h2 className="mt-2 text-2xl font-semibold">
                New animals every 24 hours.
              </h2>
              <p className="mt-2 text-sm text-white/34">
                Imports and captive bred stock, occasional hybrids, tested and
                untested. Red neonates carry a premium. Rare high-expression
                animals can show up.
              </p>
            </div>
            <div className="text-xs text-white/30">
              Refreshes in ~
              {Math.max(1, Math.ceil((nextRefresh - now) / 3_600_000))}h
            </div>
          </div>
          <div className="mx-auto mt-6 max-w-2xl">
            {(() => {
              const offer = store[storeIndex];
              const sold = purchasedStoreIds.includes(offer.id);
              return (
                <article
                  key={offer.id}
                  className="rounded-3xl border border-white/[.06] bg-white/[.015] p-4"
                >
                  <ChondroSnakeIcon
                    subspecies={offer.subspecies}
                    name={offer.name}
                    traits={portraitTraits(offer)}
                    compact
                  />
                  <div className="mt-3 flex items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold text-white/75">
                        {offer.name}
                      </div>
                      <div className="mt-1 text-[10px] text-white/30">
                        {offer.sex} · {offer.source} · {offer.lifeStage}
                      </div>
                      <div className="mt-1 text-[10px] font-semibold text-amber-100/55">
                        Neonate color: {offer.neonateColor}
                      </div>
                    </div>
                    <span className="rounded-full border border-white/[.08] px-2 py-1 text-[9px] uppercase text-white/40">
                      {offer.classification}
                    </span>
                  </div>
                  <div className="mt-3 text-[10px] text-white/34">
                    HB {offer.highBlack}% · HW {offer.highWhite}% · Blue{" "}
                    {offer.blueStripe}% · Yellow {offer.yellowRetention}% ·
                    Blotches {offer.blotches}%
                  </div>
                  <div className="mt-2 text-[10px] text-white/34">
                    Nido:{" "}
                    <span
                      className={
                        offer.pretested
                          ? "text-emerald-200/70"
                          : "text-white/45"
                      }
                    >
                      {offer.pretested ? "Pretested negative" : "Untested"}
                    </span>
                  </div>
                  <div className="mt-4 flex items-center justify-between">
                    <div className="text-lg font-semibold text-emerald-200/75">
                      {money(offer.price)}
                    </div>
                    <button
                      disabled={sold || cash < offer.price || openSlots <= 0}
                      onClick={() => buySnake(offer)}
                      className="rounded-xl bg-amber-200 px-4 py-2 text-xs font-black text-[#17130a] disabled:opacity-30"
                    >
                      {sold
                        ? "Purchased"
                        : openSlots <= 0
                          ? "Need enclosure"
                          : "Buy"}
                    </button>
                  </div>
                </article>
              );
            })()}
            <div className="mt-4 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() =>
                  setStoreIndex(
                    (current) => (current - 1 + store.length) % store.length,
                  )
                }
                className="rounded-xl border border-white/[.08] px-4 py-2 text-xs font-bold text-white/55"
              >
                ← Previous
              </button>
              <div
                className="flex gap-1.5"
                aria-label={`Store offer ${storeIndex + 1} of ${store.length}`}
              >
                {store.map((offer, index) => (
                  <button
                    key={offer.id}
                    type="button"
                    aria-label={`Show offer ${index + 1}`}
                    onClick={() => setStoreIndex(index)}
                    className={`h-2 rounded-full transition ${index === storeIndex ? "w-6 bg-amber-200/75" : "w-2 bg-white/15"}`}
                  />
                ))}
              </div>
              <button
                type="button"
                onClick={() =>
                  setStoreIndex((current) => (current + 1) % store.length)
                }
                className="rounded-xl border border-white/[.08] px-4 py-2 text-xs font-bold text-white/55"
              >
                Next →
              </button>
            </div>
          </div>
        </section>
      </CollapsibleGameSection>

      <CollapsibleGameSection
        label="Breeding room"
        detail={`${females.length} adult female${females.length === 1 ? "" : "s"} · ${males.length} adult male${males.length === 1 ? "" : "s"}`}
        defaultOpen
      >
        <section className="panel rounded-[28px] p-6">
          <div className="section-kicker">Breeding room</div>
          <h2 className="mt-2 text-2xl font-semibold">Adult animals only.</h2>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <label>
              <span className="mb-2 block text-xs font-bold text-white/38">
                Female
              </span>
              <select
                value={damId}
                onChange={(e) => setDamId(e.target.value)}
                className="w-full rounded-2xl border border-white/[.08] bg-black/30 px-4 py-3 text-sm"
              >
                <option value="">Choose adult female</option>
                {females.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} · {a.neonateColor} neonate
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="mb-2 block text-xs font-bold text-white/38">
                Male
              </span>
              <select
                value={sireId}
                onChange={(e) => setSireId(e.target.value)}
                className="w-full rounded-2xl border border-white/[.08] bg-black/30 px-4 py-3 text-sm"
              >
                <option value="">Choose adult male</option>
                {males.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} · {a.neonateColor} neonate
                  </option>
                ))}
              </select>
            </label>
          </div>
          {dam && sire ? (
            <div className="mt-4 text-sm text-white/42">
              Projected classification:{" "}
              <span className="font-semibold text-amber-100/65">
                {classifyPair(dam, sire)}
              </span>
            </div>
          ) : null}
          <button
            disabled={!dam || !sire || !!clutch}
            onClick={breedSelected}
            className="mt-5 rounded-2xl bg-amber-200 px-6 py-3 text-sm font-black text-[#17130a] disabled:opacity-30"
          >
            Run breeding season
          </button>
        </section>
      </CollapsibleGameSection>

      {clutch ? (
        <CollapsibleGameSection
          label={`Active clutch · ${clutch.id}`}
          detail={`${clutch.offspring.length} offspring · ${holdbacks.length} holdback${holdbacks.length === 1 ? "" : "s"} selected`}
          defaultOpen
        >
          <section className="mt-6 panel rounded-[28px] p-6">
            <div className="section-kicker">{clutch.id}</div>
            <h2 className="mt-2 text-2xl font-semibold">
              Clutch hatched · {clutch.offspring.length} offspring
            </h2>
            <p className="mt-2 text-sm text-white/34">
              Open enclosure slots: {openSlots}. You can only hold back that
              many. When you close the clutch, every unselected offspring will
              be listed in the player snake market.
            </p>
            <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {clutch.offspring.map((baby) => {
                const kept = holdbacks.includes(baby.id);
                return (
                  <button
                    key={baby.id}
                    onClick={() => toggleHoldback(baby.id)}
                    className={`rounded-3xl border p-4 text-left ${kept ? "border-amber-200/35 bg-amber-200/[.05]" : "border-white/[.06] bg-white/[.015]"}`}
                  >
                    <ChondroSnakeIcon
                      subspecies={baby.subspecies}
                      name={baby.name}
                      traits={portraitTraits(baby)}
                      compact
                    />
                    <div className="mt-3 font-semibold text-white/75">
                      {baby.name}
                    </div>
                    <div className="mt-1 text-[10px] text-white/30">
                      {baby.sex} · Hatchling · {baby.classification}
                    </div>
                    <div className="mt-1 text-[10px] font-semibold text-amber-100/55">
                      Neonate color: {baby.neonateColor}
                    </div>
                    <div className="mt-3 text-[10px] text-white/35">
                      HB {baby.highBlack}% · HW {baby.highWhite}% · Blue{" "}
                      {baby.blueStripe}% · Yellow {baby.yellowRetention}% ·
                      Blotches {baby.blotches}%
                    </div>
                    <div className="mt-3 text-[10px] font-bold uppercase tracking-[.12em] text-amber-100/50">
                      {kept
                        ? "Holdback selected"
                        : `Will list · ${money(saleValue(baby))}`}
                    </div>
                  </button>
                );
              })}
            </div>
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
              <div className="text-xs text-white/38">
                {holdbacks.length} held back ·{" "}
                {clutch.offspring.length - holdbacks.length} going to market
              </div>
              <button
                disabled={!!marketBusy}
                onClick={() => void finishClutch()}
                className="rounded-2xl bg-emerald-300 px-6 py-3 text-sm font-black text-[#06100c] disabled:opacity-40"
              >
                {marketBusy === "clutch"
                  ? "Listing offspring…"
                  : `List unheld & advance season`}
              </button>
            </div>
          </section>
        </CollapsibleGameSection>
      ) : null}

      <CollapsibleGameSection
        label="Your colony"
        detail={`${colony.length} animal${colony.length === 1 ? "" : "s"} · ${openSlots} open enclosure${openSlots === 1 ? "" : "s"}`}
      >
        <section>
          <div className="section-kicker">Your colony</div>
          <h2 className="mt-2 text-2xl font-semibold">
            Animals and project material
          </h2>
          <p className="mt-2 text-sm text-white/32">
            Care is budgeted at {money(CARE_PER_YEAR)} per year plus{" "}
            {money(RODENT_COST)} per mouse. That keeps aging meaningful without
            turning feeding into chores.
          </p>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            {colony.map((animal) => {
              const req = agingRequirement(animal),
                growCost = agingCost(animal),
                sell = saleValue(animal);
              return (
                <article key={animal.id} className="panel rounded-[28px] p-5">
                  <ChondroSnakeIcon
                    subspecies={animal.subspecies}
                    name={animal.name}
                    traits={portraitTraits(animal)}
                  />
                  <div className="mt-4 flex items-start justify-between gap-3">
                    <div>
                      <div className="text-xl font-semibold">
                        {animal.name || "Unnamed snake"}
                      </div>
                      <div className="mt-1 text-xs text-white/30">
                        {animal.id} · {animal.sex} · {animal.classification} ·
                        Gen {animal.generation}
                      </div>
                    </div>
                    <span className="rounded-full border border-white/[.08] px-3 py-1 text-[10px] uppercase text-white/45">
                      {animal.lifeStage}
                    </span>
                  </div>
                  <div className="mt-4 grid gap-3 rounded-2xl border border-white/[.06] bg-black/10 p-4">
                    <label className="text-[10px] font-bold uppercase tracking-[.12em] text-white/35">
                      Snake name
                      <input
                        value={animal.name}
                        onChange={(e) =>
                          updateSnakeDetails(animal.id, "name", e.target.value)
                        }
                        maxLength={60}
                        placeholder="Name this snake"
                        className="mt-2 h-11 w-full rounded-xl border border-white/[.08] bg-black/25 px-3 text-sm font-medium normal-case tracking-normal text-white/75 outline-none transition focus:border-amber-200/35"
                      />
                    </label>
                    <label className="text-[10px] font-bold uppercase tracking-[.12em] text-white/35">
                      Private notes
                      <textarea
                        value={animal.notes}
                        onChange={(e) =>
                          updateSnakeDetails(animal.id, "notes", e.target.value)
                        }
                        maxLength={1000}
                        placeholder="Lineage plans, pairing ideas, or anything you want to remember…"
                        className="mt-2 min-h-24 w-full resize-y rounded-xl border border-white/[.08] bg-black/25 p-3 text-sm font-normal normal-case leading-6 tracking-normal text-white/65 outline-none transition focus:border-amber-200/35"
                      />
                    </label>
                    <div className="text-right text-[10px] text-white/22">
                      Autosaved · {animal.notes.length}/1000
                    </div>
                  </div>
                  <div className="mt-3 text-xs text-white/35">
                    {animal.subspecies} · {animal.locality}
                  </div>
                  <div className="mt-1 text-xs font-semibold text-amber-100/55">
                    Neonate color: {animal.neonateColor}
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
                    {traitRows.map(([label, key]) => (
                      <div
                        key={key}
                        className="rounded-2xl border border-white/[.06] p-3"
                      >
                        <div className="text-[9px] uppercase tracking-[.1em] text-white/23">
                          {label}
                        </div>
                        <div className="mt-2 text-lg font-semibold text-white/62">
                          {animal[key] ?? 0}%
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 rounded-2xl border border-white/[.05] p-3 text-xs text-white/38">
                    Nido:{" "}
                    <span
                      className={
                        animal.nidoStatus === "Positive"
                          ? "font-semibold text-red-200/75"
                          : animal.nidoStatus === "Negative"
                            ? "font-semibold text-emerald-200/70"
                            : "text-white/45"
                      }
                    >
                      {animal.nidoStatus}
                    </span>
                    {req ? (
                      <div className="mt-2">
                        Next stage: {req.next} · {req.mice} mice · {req.months}{" "}
                        months · Total care/food {money(growCost)}
                      </div>
                    ) : (
                      <div className="mt-2 text-emerald-200/60">
                        Adult · breeding eligible
                      </div>
                    )}
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {animal.nidoStatus === "Unknown" ? (
                      <button
                        disabled={cash < NIDO_TEST_COST}
                        onClick={() => testSnake(animal.id)}
                        className="rounded-xl border border-white/[.08] px-4 py-2 text-xs font-bold text-white/55 disabled:opacity-30"
                      >
                        Nido test · {money(NIDO_TEST_COST)}
                      </button>
                    ) : null}
                    {req ? (
                      <button
                        disabled={cash < growCost}
                        onClick={() => ageSnake(animal)}
                        className="rounded-xl border border-amber-200/15 bg-amber-200/[.04] px-4 py-2 text-xs font-bold text-amber-100/65 disabled:opacity-30"
                      >
                        Raise to {req.next} · {money(growCost)}
                      </button>
                    ) : null}
                    {animal.nidoStatus === "Positive" ? (
                      <button
                        onClick={() => transferPositive(animal)}
                        className="rounded-xl border border-sky-300/15 bg-sky-300/[.04] px-4 py-2 text-xs font-bold text-sky-100/65"
                      >
                        Send to specialty snake care
                      </button>
                    ) : (
                      <button
                        onClick={() => sellSnake(animal)}
                        className="rounded-xl border border-emerald-300/20 bg-emerald-300/[.06] px-4 py-2 text-xs font-bold text-emerald-200/75"
                      >
                        Sell · {money(sell)}
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      </CollapsibleGameSection>

      {sales.length > 0 || transfers.length > 0 ? (
        <CollapsibleGameSection
          label="Activity"
          detail={`${sales.length} sale${sales.length === 1 ? "" : "s"} · ${transfers.length} transfer${transfers.length === 1 ? "" : "s"}`}
        >
          <section className="mt-6 panel-soft rounded-[28px] p-5">
            <div className="section-kicker">Activity</div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {sales.slice(0, 4).map((sale) => (
                <div
                  key={`${sale.id}-${sale.season}`}
                  className="rounded-2xl border border-white/[.06] p-3 text-sm text-white/50"
                >
                  Sold {sale.name} ·{" "}
                  <span className="text-emerald-200/70">
                    +{money(sale.value)}
                  </span>
                </div>
              ))}
              {transfers.slice(0, 4).map((item) => (
                <div
                  key={`${item.id}-${item.season}`}
                  className="rounded-2xl border border-sky-300/10 p-3 text-sm text-white/50"
                >
                  Transferred {item.name} to specialty snake care
                </div>
              ))}
            </div>
            <div className="mt-3 text-xs text-white/28">
              Total snake sales: {money(saleIncome)}
            </div>
          </section>
        </CollapsibleGameSection>
      ) : null}
      {selectedAnimal ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`${selectedAnimal.name || "Snake"} record`}
          className="fixed inset-0 z-50 overflow-y-auto bg-black/80 p-3 backdrop-blur-sm sm:p-6"
        >
          <div className="mx-auto max-w-4xl rounded-[30px] border border-white/[.09] bg-[#09120e] p-5 shadow-2xl sm:p-7">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="section-kicker">
                  Snake record · {selectedAnimal.id}
                </div>
                <h2 className="mt-2 text-3xl font-semibold">
                  {selectedAnimal.name || "Unnamed snake"}
                </h2>
              </div>
              <button
                onClick={() => setSelectedSnakeId(null)}
                className="rounded-xl border border-white/[.09] px-4 py-2 text-sm font-bold text-white/60"
              >
                Close
              </button>
            </div>
            <div className="mt-6 grid gap-6 lg:grid-cols-[1.05fr_.95fr]">
              <div>
                <ChondroSnakeIcon
                  subspecies={selectedAnimal.subspecies}
                  name={selectedAnimal.name}
                  traits={portraitTraits(selectedAnimal)}
                />
                <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
                  {traitRows.map(([label, key]) => (
                    <div
                      key={key}
                      className="rounded-xl border border-white/[.06] p-3"
                    >
                      <div className="text-[9px] uppercase tracking-[.1em] text-white/25">
                        {label}
                      </div>
                      <div className="mt-1 text-lg font-semibold text-white/65">
                        {selectedAnimal[key]}%
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  {[
                    ["Sex", selectedAnimal.sex],
                    ["Life stage", selectedAnimal.lifeStage],
                    ["Classification", selectedAnimal.classification],
                    ["Generation", `Gen ${selectedAnimal.generation}`],
                    ["Subspecies", selectedAnimal.subspecies],
                    ["Locality", selectedAnimal.locality],
                    ["Source", selectedAnimal.source],
                    ["Nido", selectedAnimal.nidoStatus],
                  ].map(([label, value]) => (
                    <div
                      key={label}
                      className="rounded-xl border border-white/[.05] p-3"
                    >
                      <div className="text-[9px] uppercase tracking-[.1em] text-white/22">
                        {label}
                      </div>
                      <div className="mt-1 text-xs text-white/58">{value}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="space-y-4">
                {colony.some((animal) => animal.id === selectedAnimal.id) ? (
                  <div className="rounded-2xl border border-white/[.06] bg-white/[.02] p-4">
                    <label className="text-[10px] font-bold uppercase tracking-[.12em] text-white/35">
                      Snake name
                      <input
                        value={selectedAnimal.name}
                        onChange={(e) =>
                          updateSnakeDetails(
                            selectedAnimal.id,
                            "name",
                            e.target.value,
                          )
                        }
                        maxLength={60}
                        className="mt-2 h-11 w-full rounded-xl border border-white/[.08] bg-black/25 px-3 text-sm normal-case tracking-normal text-white/75"
                      />
                    </label>
                    <label className="mt-4 block text-[10px] font-bold uppercase tracking-[.12em] text-white/35">
                      Private notes
                      <textarea
                        value={selectedAnimal.notes}
                        onChange={(e) =>
                          updateSnakeDetails(
                            selectedAnimal.id,
                            "notes",
                            e.target.value,
                          )
                        }
                        maxLength={1000}
                        placeholder="Lineage plans, pairing ideas, or anything you want to remember…"
                        className="mt-2 min-h-28 w-full resize-y rounded-xl border border-white/[.08] bg-black/25 p-3 text-sm font-normal normal-case leading-6 tracking-normal text-white/65"
                      />
                    </label>
                    <div className="mt-2 text-right text-[10px] text-white/22">
                      Autosaved · {selectedAnimal.notes.length}/1000
                    </div>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-white/[.06] p-4 text-xs text-white/38">
                    Historical record · this animal is not currently in your
                    colony.
                  </div>
                )}
                <div className="rounded-2xl border border-white/[.06] p-4">
                  <div className="text-[10px] font-black uppercase tracking-[.13em] text-white/30">
                    Pedigree
                  </div>
                  {selectedParents.length ? (
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      {selectedParents.map((parent) => (
                        <button
                          key={parent.id}
                          onClick={() => setSelectedSnakeId(parent.id)}
                          className="rounded-xl border border-white/[.06] p-3 text-left"
                        >
                          <div className="text-[9px] uppercase text-white/25">
                            {parent.sex === "Female" ? "Dam" : "Sire"}
                          </div>
                          <div className="mt-1 truncate text-sm font-semibold text-white/65">
                            {parent.name}
                          </div>
                          <div className="mt-1 text-[9px] text-white/25">
                            Gen {parent.generation}
                          </div>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="mt-3 text-sm text-white/28">
                      Foundation animal · no recorded parents
                    </div>
                  )}
                  {selectedOffspring.length ? (
                    <div className="mt-5">
                      <div className="text-[9px] font-bold uppercase tracking-[.11em] text-white/25">
                        Offspring ({selectedOffspring.length})
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {selectedOffspring.map((baby) => (
                          <button
                            key={baby.id}
                            onClick={() => setSelectedSnakeId(baby.id)}
                            className="rounded-lg border border-amber-200/10 px-3 py-2 text-xs text-amber-100/60"
                          >
                            {baby.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
                <div className="rounded-2xl border border-white/[.06] p-4">
                  <div className="text-[10px] font-black uppercase tracking-[.13em] text-white/30">
                    Ancestry
                  </div>
                  <div className="mt-3 space-y-2">
                    {Object.entries(selectedAnimal.ancestry).map(
                      ([name, percent]) => (
                        <div key={name}>
                          <div className="flex justify-between gap-3 text-xs text-white/45">
                            <span>{name}</span>
                            <span>{percent}%</span>
                          </div>
                          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/[.05]">
                            <div
                              className="h-full rounded-full bg-emerald-300/55"
                              style={{ width: `${percent}%` }}
                            />
                          </div>
                        </div>
                      ),
                    )}
                  </div>
                </div>
                {selectedClutches.length ? (
                  <div className="rounded-2xl border border-white/[.06] p-4">
                    <div className="text-[10px] font-black uppercase tracking-[.13em] text-white/30">
                      Breeding history
                    </div>
                    <div className="mt-3 space-y-2">
                      {selectedClutches.map((record) => (
                        <div key={record.id} className="text-xs text-white/45">
                          Season {record.season} · paired with{" "}
                          {record.dam.id === selectedAnimal.id
                            ? record.sire.name
                            : record.dam.name}{" "}
                          · {record.offspring.length} offspring
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}
      {initialsPrompt ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Choose breeder initials"
          className="fixed inset-0 z-[60] grid place-items-center bg-black/85 p-4 backdrop-blur-sm"
        >
          <div className="w-full max-w-md rounded-[28px] border border-amber-200/15 bg-[#0a130f] p-6 shadow-2xl">
            <div className="section-kicker">Your first clutch</div>
            <h2 className="mt-3 text-3xl font-semibold">
              Choose your breeder initials
            </h2>
            <p className="mt-3 text-sm leading-6 text-white/42">
              Choose 2–5 letters. These initials are unique, permanent and will
              begin the identification code of every snake you produce.
            </p>
            <label className="mt-5 block text-[10px] font-bold uppercase tracking-[.13em] text-white/35">
              Breeder initials
              <input
                autoFocus
                value={initialsInput}
                onChange={(e) =>
                  setInitialsInput(
                    e.target.value
                      .replace(/[^a-z]/gi, "")
                      .toUpperCase()
                      .slice(0, 5),
                  )
                }
                maxLength={5}
                placeholder="ABB"
                className="mt-2 h-14 w-full rounded-2xl border border-white/[.09] bg-black/25 px-4 text-center text-2xl font-black uppercase tracking-[.25em] text-amber-100 outline-none focus:border-amber-200/35"
              />
            </label>
            <div className="mt-3 rounded-xl border border-white/[.06] p-3 text-xs text-white/35">
              Example offspring ID:{" "}
              <span className="font-mono text-amber-100/65">
                {initialsInput || "ABB"}-CL-XXXXX-01
              </span>
            </div>
            {initialsStatus ? (
              <div role="status" className="mt-3 text-sm text-amber-100/70">
                {initialsStatus}
              </div>
            ) : null}
            <div className="mt-6 flex justify-end gap-2">
              <button
                onClick={() => setInitialsPrompt(false)}
                className="rounded-xl border border-white/[.08] px-4 py-3 text-xs font-bold text-white/50"
              >
                Cancel
              </button>
              <button
                onClick={() => void claimBreederInitials()}
                className="rounded-xl bg-amber-200 px-5 py-3 text-xs font-black text-[#17130a]"
              >
                Claim initials & hatch clutch
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
