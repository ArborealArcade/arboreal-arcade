"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { ChondroSnakeIcon } from "@/components/ChondroSnakeIcon";
import { animalHousingCapacity, canHouseAnimal, enclosureFootprint, openAnimalSlots, roomCapacityFromSave } from "@/lib/chondro-facility-limits";
import { markStockRotated, playHankScaleLine } from "@/lib/hank-scale-voice";

type Sex = "Male" | "Female";
type Locality = "Biak" | "Numfor" | "Manokwari" | "Arfak" | "Sorong" | "Timika" | "Kofiau" | "Cyclops" | "Jayapura" | "Lereh" | "Wamena" | "Yapen" | "Aru" | "Merauke";
type Subspecies = "Morelia azurea azurea" | "Morelia azurea pulcher" | "Morelia azurea utaraensis" | "Morelia viridis";
type LifeStage = "Hatchling" | "Neonate" | "Subadult" | "Adult";
type ConservationRow = { subspecies: Subspecies; import_multiplier: number; phenotype_bonus: number; stewardship_score: number; contribution_count: number };

type Snake = {
  id: string;
  name: string;
  sex: Sex;
  source: "Captive Bred" | "Import";
  subspecies: Subspecies;
  locality: Locality;
  neonateColor: "Red" | "Yellow";
  lifeStage: LifeStage;
  highBlack: number;
  highWhite: number;
  blueStripe: number;
  yellowRetention: number;
  blotches: number;
  geneticsTested: boolean;
  phenotypeScore: number;
  localityAncestry: Partial<Record<Locality, number>>;
  body: string;
  tail: string;
  eyes: string;
  head: string;
  pattern: string;
  color: string;
  nidoStatus: "Unknown" | "Negative" | "Positive";
  condition: "Excellent" | "Good" | "Fair";
  classification: "Pure" | "Hybrid" | "Designer";
  generation: number;
  parentIds: string[];
  ancestry: Partial<Record<Subspecies, number>>;
  notes: string;
  breederInitials: string | null;
};

type Offer = Snake & { price: number; featured?: boolean; specialLabel?: string };

// Store search/filters/sort (snakes section). Persisted to localStorage so
// filters survive tab switches and return visits.
const STORE_FILTERS_KEY = "arboreal_keeper_store_filters_v1";
type StoreSort = "featured" | "price-asc" | "price-desc" | "name";
type StoreFilters = { query: string; locality: string; sex: string; priceBand: string; sort: StoreSort };
const DEFAULT_STORE_FILTERS: StoreFilters = { query: "", locality: "All", sex: "All", priceBand: "any", sort: "featured" };
function loadStoreFilters(): StoreFilters {
  try {
    const raw = window.localStorage.getItem(STORE_FILTERS_KEY);
    if (!raw) return DEFAULT_STORE_FILTERS;
    const parsed = JSON.parse(raw) as Partial<StoreFilters>;
    return {
      query: typeof parsed.query === "string" ? parsed.query : "",
      locality: typeof parsed.locality === "string" ? parsed.locality : "All",
      sex: typeof parsed.sex === "string" ? parsed.sex : "All",
      priceBand: typeof parsed.priceBand === "string" ? parsed.priceBand : "any",
      sort: parsed.sort === "price-asc" || parsed.sort === "price-desc" || parsed.sort === "name" ? parsed.sort : "featured",
    };
  } catch {
    return DEFAULT_STORE_FILTERS;
  }
}
// Offer prices: $500 floor, typically $500–$4,000 (see makeRandomOffer).
const PRICE_BANDS: Array<{ id: string; label: string; test: (price: number) => boolean }> = [
  { id: "any", label: "Any price", test: () => true },
  { id: "under750", label: "Under $750", test: (p) => p < 750 },
  { id: "750to1500", label: "$750 – $1,500", test: (p) => p >= 750 && p <= 1500 },
  { id: "1500to3000", label: "$1,500 – $3,000", test: (p) => p > 1500 && p <= 3000 },
  { id: "over3000", label: "Over $3,000", test: (p) => p > 3000 },
];
type EnclosureType = "Chondro Dojo Bin" | "PVC Arboreal";
type GameSave = { cash: number; colony: Snake[]; enclosures: Record<string, number>; facilityRooms?: Record<string, number>; purchasedStoreIds?: string[]; [key: string]: unknown };

const LOCAL_SAVE_KEY = "arboreal_chondro_breeder_v2";
const SHOP_SEED_KEY = "arboreal_chondro_expanded_shop_seed_v2";
const SHOP_REFRESH_AT_KEY = "arboreal_chondro_expanded_shop_refresh_at_v1";
const SHOP_REFRESH_MS = 24 * 60 * 60 * 1000;
// Legacy compatibility marker retained for the Chondro prebuild guard.
// Standalone Repti-Shop purchases now persist directly instead of relying on
// the old arboreal-chondro-enclosure-action event listener.
const enclosurePrices: Record<EnclosureType, number> = { "Chondro Dojo Bin": 250, "PVC Arboreal": 650 };
const enclosureDisplay: Record<EnclosureType, { label: string; detail: string }> = {
  "Chondro Dojo Bin": { label: "Chondro Dojo 2 Stack", detail: "Two space-saving enclosures sold as one stack. The stack uses one facility slot and houses Green Tree Pythons from hatchling to adult — two spaces." },
  "PVC Arboreal": { label: "PVC Arboreal Enclosure", detail: "Permanent front-opening arboreal housing — the upgrade pick for larger adults and display setups." },
};
const subspeciesList: Subspecies[] = ["Morelia azurea azurea", "Morelia azurea pulcher", "Morelia azurea utaraensis", "Morelia viridis"];
const subspeciesShort: Record<Subspecies, string> = {
  "Morelia azurea azurea": "M. a. azurea",
  "Morelia azurea pulcher": "M. a. pulcher",
  "Morelia azurea utaraensis": "M. a. utaraensis",
  "Morelia viridis": "M. viridis",
};
type RarityTier = "common" | "uncommon" | "rare" | "legendary";

const RARITY_WEIGHTS: Record<RarityTier, number> = {
  common: 50,
  uncommon: 25,
  rare: 10,
  legendary: 4,
};

type LocalityPhase = { locality: Locality; color: "Red" | "Yellow"; tier: RarityTier };

// Owner-set shop rarity (2026-09-26): which locality + neonate-phase combos appear
// in the store and how often. Always-yellow localities (Kofiau, Aru, Merauke)
// only appear as Yellow.
const LOCALITY_PHASE_RARITY: Record<Subspecies, LocalityPhase[]> = {
  "Morelia azurea azurea": [
    { locality: "Biak", color: "Yellow", tier: "common" },
    { locality: "Biak", color: "Red", tier: "common" },
    { locality: "Numfor", color: "Yellow", tier: "uncommon" },
    { locality: "Numfor", color: "Red", tier: "rare" },
  ],
  "Morelia azurea pulcher": [
    { locality: "Manokwari", color: "Yellow", tier: "uncommon" },
    { locality: "Manokwari", color: "Red", tier: "rare" },
    { locality: "Arfak", color: "Yellow", tier: "legendary" },
    { locality: "Arfak", color: "Red", tier: "legendary" },
    { locality: "Sorong", color: "Yellow", tier: "common" },
    { locality: "Sorong", color: "Red", tier: "rare" },
    { locality: "Timika", color: "Yellow", tier: "legendary" },
    { locality: "Timika", color: "Red", tier: "legendary" },
    { locality: "Kofiau", color: "Yellow", tier: "legendary" },
  ],
  "Morelia azurea utaraensis": [
    { locality: "Cyclops", color: "Yellow", tier: "uncommon" },
    { locality: "Cyclops", color: "Red", tier: "rare" },
    { locality: "Jayapura", color: "Yellow", tier: "common" },
    { locality: "Jayapura", color: "Red", tier: "uncommon" },
    { locality: "Lereh", color: "Yellow", tier: "uncommon" },
    { locality: "Lereh", color: "Red", tier: "rare" },
    { locality: "Wamena", color: "Yellow", tier: "legendary" },
    { locality: "Wamena", color: "Red", tier: "legendary" },
    { locality: "Yapen", color: "Yellow", tier: "legendary" },
    { locality: "Yapen", color: "Red", tier: "legendary" },
  ],
  "Morelia viridis": [
    { locality: "Aru", color: "Yellow", tier: "common" },
    { locality: "Merauke", color: "Yellow", tier: "rare" },
  ],
};

function chooseLocalityPhase(subspecies: Subspecies, random: () => number): LocalityPhase {
  const options = LOCALITY_PHASE_RARITY[subspecies];
  const total = options.reduce((sum, option) => sum + RARITY_WEIGHTS[option.tier], 0);
  let roll = random() * total;
  for (const option of options) {
    roll -= RARITY_WEIGHTS[option.tier];
    if (roll <= 0) return option;
  }
  return options[options.length - 1];
}

type SpriteQaItem = {
  id: string;
  label: string;
  detail: string;
  subspecies: Subspecies;
  locality?: string;
  neonateColor: "Red" | "Yellow";
  lifeStage: LifeStage;
  classification: "Pure" | "Hybrid" | "Designer";
  ancestry?: Partial<Record<Subspecies, number>>;
  localityAncestry?: Record<string, number>;
  phenotypeScore?: number;
  spriteSeed: string;
};

const spriteQaPureLocalities: Array<{
  locality: Locality;
  subspecies: Subspecies;
  colors: Array<"Red" | "Yellow">;
}> = [
  { locality: "Biak", subspecies: "Morelia azurea azurea", colors: ["Red", "Yellow"] },
  { locality: "Numfor", subspecies: "Morelia azurea azurea", colors: ["Red", "Yellow"] },
  { locality: "Manokwari", subspecies: "Morelia azurea pulcher", colors: ["Red", "Yellow"] },
  { locality: "Arfak", subspecies: "Morelia azurea pulcher", colors: ["Red", "Yellow"] },
  { locality: "Sorong", subspecies: "Morelia azurea pulcher", colors: ["Red", "Yellow"] },
  { locality: "Timika", subspecies: "Morelia azurea pulcher", colors: ["Red", "Yellow"] },
  { locality: "Kofiau", subspecies: "Morelia azurea pulcher", colors: ["Yellow"] },
  { locality: "Cyclops", subspecies: "Morelia azurea utaraensis", colors: ["Red", "Yellow"] },
  { locality: "Jayapura", subspecies: "Morelia azurea utaraensis", colors: ["Red", "Yellow"] },
  { locality: "Lereh", subspecies: "Morelia azurea utaraensis", colors: ["Red", "Yellow"] },
  { locality: "Wamena", subspecies: "Morelia azurea utaraensis", colors: ["Red", "Yellow"] },
  { locality: "Yapen", subspecies: "Morelia azurea utaraensis", colors: ["Red", "Yellow"] },
  { locality: "Aru", subspecies: "Morelia viridis", colors: ["Yellow"] },
  { locality: "Merauke", subspecies: "Morelia viridis", colors: ["Yellow"] },
];

const spriteQaItems: SpriteQaItem[] = [
  ...spriteQaPureLocalities.flatMap(({ locality, subspecies, colors }) =>
    colors.flatMap((neonateColor) =>
      (["Neonate", "Adult"] as LifeStage[]).map((lifeStage) => ({
        id: `qa-pure-${locality.toLowerCase()}-${neonateColor.toLowerCase()}-${lifeStage.toLowerCase()}`,
        label: `${locality} · ${neonateColor}`,
        detail: lifeStage === "Neonate" ? "Juvenile · Hatchling / Neonate" : "Adult · Subadult / Adult",
        subspecies,
        locality,
        neonateColor,
        lifeStage,
        classification: "Pure" as const,
        localityAncestry: { [locality]: 100 },
        ancestry: { [subspecies]: 100 },
        spriteSeed: `qa-pure-${locality}-${neonateColor}-${lifeStage}`,
      })),
    ),
  ),
  {
    id: "qa-manokwari-aplus-1",
    label: "Manokwari · Red A+ #1",
    detail: "Special adult phenotype variant",
    subspecies: "Morelia azurea pulcher",
    locality: "Manokwari",
    neonateColor: "Red",
    lifeStage: "Adult",
    classification: "Pure",
    localityAncestry: { Manokwari: 100 },
    ancestry: { "Morelia azurea pulcher": 100 },
    phenotypeScore: 95,
    spriteSeed: "manokwari-a-plus-variant-1",
  },
  {
    id: "qa-manokwari-aplus-2",
    label: "Manokwari · Red A+ #2",
    detail: "Special adult phenotype variant",
    subspecies: "Morelia azurea pulcher",
    locality: "Manokwari",
    neonateColor: "Red",
    lifeStage: "Adult",
    classification: "Pure",
    localityAncestry: { Manokwari: 100 },
    ancestry: { "Morelia azurea pulcher": 100 },
    phenotypeScore: 95,
    spriteSeed: "manokwari-a-plus-variant-2",
  },
  {
    id: "qa-sorong-aplus-yellow",
    label: "Sorong · Yellow A+",
    detail: "Special adult phenotype variant",
    subspecies: "Morelia azurea pulcher",
    locality: "Sorong",
    neonateColor: "Yellow",
    lifeStage: "Adult",
    classification: "Pure",
    localityAncestry: { Sorong: 100 },
    ancestry: { "Morelia azurea pulcher": 100 },
    phenotypeScore: 95,
    spriteSeed: "qa-sorong-a-plus",
  },
  {
    id: "qa-designer-red-juvenile",
    label: "Designer · Red",
    detail: "Juvenile designer pool",
    subspecies: "Morelia azurea pulcher",
    neonateColor: "Red",
    lifeStage: "Neonate",
    classification: "Designer",
    spriteSeed: "qa-designer-red-juvenile",
  },
  {
    id: "qa-designer-adult",
    label: "Designer · Adult",
    detail: "Adult designer pool",
    subspecies: "Morelia azurea pulcher",
    neonateColor: "Yellow",
    lifeStage: "Adult",
    classification: "Designer",
    spriteSeed: "qa-designer-adult",
  },
  {
    id: "qa-pulcher-utaraensis-red",
    label: "Pulcher × Utaraensis · Red",
    detail: "Hybrid juvenile",
    subspecies: "Morelia azurea pulcher",
    locality: "Mixed Locality",
    neonateColor: "Red",
    lifeStage: "Neonate",
    classification: "Hybrid",
    ancestry: { "Morelia azurea pulcher": 50, "Morelia azurea utaraensis": 50 },
    spriteSeed: "qa-pulcher-utaraensis-red",
  },
  {
    id: "qa-pulcher-utaraensis-yellow",
    label: "Pulcher × Utaraensis · Yellow",
    detail: "Hybrid juvenile",
    subspecies: "Morelia azurea pulcher",
    locality: "Mixed Locality",
    neonateColor: "Yellow",
    lifeStage: "Neonate",
    classification: "Hybrid",
    ancestry: { "Morelia azurea pulcher": 50, "Morelia azurea utaraensis": 50 },
    spriteSeed: "qa-pulcher-utaraensis-yellow",
  },
  {
    id: "qa-wamena-aru-red",
    label: "Wamena × Aru · Red",
    detail: "Exact hybrid juvenile",
    subspecies: "Morelia azurea utaraensis",
    locality: "Mixed Locality",
    neonateColor: "Red",
    lifeStage: "Neonate",
    classification: "Hybrid",
    ancestry: { "Morelia azurea utaraensis": 50, "Morelia viridis": 50 },
    localityAncestry: { Wamena: 50, Aru: 50 },
    spriteSeed: "qa-wamena-aru-red",
  },
  {
    id: "qa-wamena-merauke-red",
    label: "Wamena × Merauke · Red",
    detail: "Exact hybrid juvenile",
    subspecies: "Morelia azurea utaraensis",
    locality: "Mixed Locality",
    neonateColor: "Red",
    lifeStage: "Neonate",
    classification: "Hybrid",
    ancestry: { "Morelia azurea utaraensis": 50, "Morelia viridis": 50 },
    localityAncestry: { Wamena: 50, Merauke: 50 },
    spriteSeed: "qa-wamena-merauke-red",
  },
];

function money(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

function formatCountdown(milliseconds: number) {
  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${hours}h ${String(minutes).padStart(2, "0")}m ${String(seconds).padStart(2, "0")}s`;
}

function rng(seed: number) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function ordinaryTrait(random: () => number) {
  const roll = random();
  if (roll < 0.5) return 0;
  if (roll < 0.79) return 1 + Math.floor(random() * 10);
  if (roll < 0.93) return 11 + Math.floor(random() * 15);
  if (roll < 0.98) return 26 + Math.floor(random() * 25);
  if (roll < 0.997) return 51 + Math.floor(random() * 25);
  return 76 + Math.floor(random() * 25);
}

function effectMap(rows: ConservationRow[]) {
  return new Map(rows.map((row) => [row.subspecies, row]));
}

function chooseSubspecies(random: () => number, source: Snake["source"], effects: Map<Subspecies, ConservationRow>) {
  const weights = subspeciesList.map((subspecies) => source === "Import" ? Number(effects.get(subspecies)?.import_multiplier ?? 1) : 1);
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let roll = random() * total;
  for (let index = 0; index < subspeciesList.length; index += 1) {
    roll -= weights[index];
    if (roll <= 0) return subspeciesList[index];
  }
  return subspeciesList[subspeciesList.length - 1];
}

function makeRandomOffer(seed: number, index: number, random: () => number, effects: Map<Subspecies, ConservationRow>): Offer {
  const source: Snake["source"] = random() < 0.6 ? "Captive Bred" : "Import";
  const subspecies = chooseSubspecies(random, source, effects);
  const { locality, color: neonateColor } = chooseLocalityPhase(subspecies, random);
  const sex: Sex = random() < 0.5 ? "Male" : "Female";
  const stages: LifeStage[] = ["Hatchling", "Neonate", "Subadult", "Adult"];
  const lifeStage = stages[Math.floor(random() * stages.length)];
  const geneticsTested = random() < 0.22;
  const nidoStatus: Snake["nidoStatus"] = random() < 0.42 ? "Negative" : "Unknown";
  const conservationBonus = source === "Import" ? Number(effects.get(subspecies)?.phenotype_bonus ?? 0) : 0;
  const phenotypeScore = Math.min(100, 66 + Math.floor(random() * 35) + conservationBonus);
  const highBlack = ordinaryTrait(random);
  const highWhite = ordinaryTrait(random);
  const blueStripe = ordinaryTrait(random);
  const yellowRetention = ordinaryTrait(random);
  const blotches = ordinaryTrait(random);
  const stageMultiplier = lifeStage === "Hatchling" ? 0.58 : lifeStage === "Neonate" ? 0.76 : lifeStage === "Subadult" ? 1 : 1.28;
  const testedTraits = geneticsTested ? (highBlack + highWhite + blueStripe + yellowRetention + blotches) * 10 : 0;
  const base = (source === "Import" ? 900 : 2050) + (neonateColor === "Red" ? 600 : 0) + (nidoStatus === "Negative" ? 425 : 0) + (geneticsTested ? 350 : 0) + testedTraits + Math.max(0, phenotypeScore - 70) * 40;
  const price = Math.max(500, Math.round((base * stageMultiplier) / 25) * 25);
  return {
    id: `SHOP-PLUS-${seed}-${index}`,
    name: `${locality} ${source === "Import" ? "Import" : "CB"}`,
    sex,
    source,
    subspecies,
    locality,
    neonateColor,
    lifeStage,
    highBlack,
    highWhite,
    blueStripe,
    yellowRetention,
    blotches,
    geneticsTested,
    phenotypeScore,
    localityAncestry: { [locality]: 100 },
    body: subspecies,
    tail: subspecies === "Morelia azurea utaraensis" ? "Matching body color and pattern" : "Black-dipped",
    eyes: subspecies,
    head: subspecies,
    pattern: locality,
    color: locality,
    nidoStatus,
    condition: source === "Import" ? "Fair" : "Good",
    classification: "Pure",
    generation: 1,
    parentIds: [],
    ancestry: { [subspecies]: 100 },
    notes: source === "Import" && conservationBonus > 0 ? `Community conservation partnership phenotype bonus: +${conservationBonus}.` : "",
    breederInitials: null,
    price,
  };
}

function buildOffers(seed: number, rows: ConservationRow[]) {
  const random = rng(seed * 7919 + 20260908);
  const effects = effectMap(rows);
  return Array.from({ length: 20 }, (_, index) => makeRandomOffer(seed, index, random, effects));
}

function parseSave(value: unknown): GameSave | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const save = value as Partial<GameSave>;
  if (typeof save.cash !== "number" || !Array.isArray(save.colony) || !save.enclosures) return null;
  return save as GameSave;
}

function makeStarterSave(): GameSave {
  return {
    started: false,
    cash: 30000,
    colony: [],
    tested: [],
    damId: "",
    sireId: "",
    clutch: null,
    clutchHistory: [],
    holdbacks: [],
    season: 1,
    sales: [],
    transfers: [],
    enclosures: {
      "Chondro Dojo Bin": 0,
      "PVC Arboreal": 0,
    },
    purchasedStoreIds: [],
    careerReputation: 0,
    facilityRooms: { "starter-room": 1 },
    facilityConstruction: null,
    breedingCycle: null,
    geneticTestsPending: [],
    femaleRecovery: {},
    seasonCarePaid: 0,
    breedingMessage: "",
    clutchEstablished: false,
    updatedAt: Date.now(),
  };
}

async function persistStandaloneShopSave(save: GameSave, authenticated: boolean) {
  const persisted = { ...save, updatedAt: Date.now() };
  window.localStorage.setItem(LOCAL_SAVE_KEY, JSON.stringify(persisted));
  window.dispatchEvent(new Event("arboreal-chondro-breeder-save-change"));
  if (!authenticated) return;
  const response = await fetch("/api/hatchery/chondro-breeder/save", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(persisted),
  });
  if (!response.ok) throw new Error("save failed");
}

export function ChondroBreederExpandedShop({ section, layout }: { section?: "qa" | "enclosures" | "snakes"; layout?: "stack" | "carousel" }) {
  const carousel = layout === "carousel";
  const [save, setSave] = useState<GameSave | null>(null);
  const [authenticated, setAuthenticated] = useState(false);
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
  const [conservation, setConservation] = useState<ConservationRow[]>([]);
  const [seed, setSeed] = useState(1);
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [refreshAt, setRefreshAt] = useState(0);
  const [now, setNow] = useState(0);
  // Store search / filters / sort — persisted across visits.
  const [storeFilters, setStoreFilters] = useState<StoreFilters>(() => loadStoreFilters());
  // Filter panel collapsed by default; tap the header to expand.
  const [filtersOpen, setFiltersOpen] = useState(false);
  useEffect(() => {
    try {
      window.localStorage.setItem(STORE_FILTERS_KEY, JSON.stringify(storeFilters));
    } catch {}
  }, [storeFilters]);
  // Bulk-buy quantity per enclosure type (1 = single purchase).
  const [enclosureQty, setEnclosureQty] = useState<Partial<Record<EnclosureType, number>>>({});
  // Detail popups: tapping a store card opens a bigger dossier for that
  // animal or enclosure. QA cards stay non-interactive (review only).
  const [detailOffer, setDetailOffer] = useState<Offer | null>(null);
  const [detailEnclosure, setDetailEnclosure] = useState<EnclosureType | null>(null);
  const detailOpen = detailOffer !== null || detailEnclosure !== null; /* Two-tap purchase confirmation: the first tap arms the button, the second tap (within a few seconds) executes the purchase. Prevents expensive misclicks on Buy buttons that move real in-game cash. */ const [confirmKey, setConfirmKey] = useState<string | null>(null); const confirmTimer = useRef<number | null>(null); const milestoneTimer = useRef<number | null>(null); useEffect(() => { return () => { if (milestoneTimer.current) window.clearTimeout(milestoneTimer.current); }; }, []); function clearConfirm() { if (confirmTimer.current !== null) { window.clearTimeout(confirmTimer.current); confirmTimer.current = null; } setConfirmKey(null); } useEffect(() => clearConfirm, []); useEffect(() => { if (busy !== null) clearConfirm(); }, [busy]); function confirmedTap(key: string, action: () => void) { if (confirmKey === key) { clearConfirm(); action(); return; } setConfirmKey(key); playHankScaleLine(23); if (confirmTimer.current !== null) window.clearTimeout(confirmTimer.current); confirmTimer.current = window.setTimeout(() => setConfirmKey(null), 5000); } /* Hank Scale idle-browse line: after 45s without interaction in the shop, play line 15 once per shop visit. */ useEffect(() => { let idleTimer: number | null = null; let played = false; function armIdle() { if (played) return; if (idleTimer !== null) window.clearTimeout(idleTimer); idleTimer = window.setTimeout(() => { played = true; playHankScaleLine(15); }, 45_000); } armIdle(); window.addEventListener("pointerdown", armIdle); window.addEventListener("keydown", armIdle); return () => { if (idleTimer !== null) window.clearTimeout(idleTimer); window.removeEventListener("pointerdown", armIdle); window.removeEventListener("keydown", armIdle); }; }, []); /* Hank Scale accessories line when an enclosure dossier opens (60s cooldown). */ const lastAccessoriesLine = useRef(0); useEffect(() => { if (!detailEnclosure) return; const now = Date.now(); if (now - lastAccessoriesLine.current < 60_000) return; lastAccessoriesLine.current = now; playHankScaleLine(13); }, [detailEnclosure]);
  

  function closeDetail() {
    setDetailOffer(null);
    setDetailEnclosure(null);
  }

  function handleCardKeyDown(event: KeyboardEvent, open: () => void) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      open();
    }
  }

  useEffect(() => {
    if (!detailOpen) return;
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") closeDetail();
    };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [detailOpen]);

  useEffect(() => {
    const current = Date.now();
    let storedSeed = Number(window.localStorage.getItem(SHOP_SEED_KEY) || "1");
    if (!Number.isFinite(storedSeed) || storedSeed < 1) storedSeed = 1;

    let storedRefreshAt = Number(window.localStorage.getItem(SHOP_REFRESH_AT_KEY) || "0");
    if (!Number.isFinite(storedRefreshAt) || storedRefreshAt <= 0) {
      storedRefreshAt = current + SHOP_REFRESH_MS;
    } else if (current >= storedRefreshAt) {
      const rotations = Math.floor((current - storedRefreshAt) / SHOP_REFRESH_MS) + 1;
      storedSeed += rotations;
      storedRefreshAt += rotations * SHOP_REFRESH_MS;
      markStockRotated();
    }

    window.localStorage.setItem(SHOP_SEED_KEY, String(storedSeed));
    window.localStorage.setItem(SHOP_REFRESH_AT_KEY, String(storedRefreshAt));
    window.setTimeout(() => {
      setSeed(storedSeed);
      setRefreshAt(storedRefreshAt);
      setNow(current);
    }, 0);

    const rotationTimer = window.setInterval(() => {
      const tickNow = Date.now();
      setNow(tickNow);
      let deadline = Number(window.localStorage.getItem(SHOP_REFRESH_AT_KEY) || "0");
      let currentSeed = Number(window.localStorage.getItem(SHOP_SEED_KEY) || "1");
      if (!Number.isFinite(currentSeed) || currentSeed < 1) currentSeed = 1;
      if (!Number.isFinite(deadline) || deadline <= 0) {
        deadline = tickNow + SHOP_REFRESH_MS;
        window.localStorage.setItem(SHOP_REFRESH_AT_KEY, String(deadline));
        setRefreshAt(deadline);
        return;
      }
      if (tickNow < deadline) {
        setRefreshAt(deadline);
        return;
      }
      const rotations = Math.floor((tickNow - deadline) / SHOP_REFRESH_MS) + 1;
      const nextSeed = currentSeed + rotations;
      const nextDeadline = deadline + rotations * SHOP_REFRESH_MS;
      window.localStorage.setItem(SHOP_SEED_KEY, String(nextSeed));
      window.localStorage.setItem(SHOP_REFRESH_AT_KEY, String(nextDeadline));
      setSeed(nextSeed);
      setRefreshAt(nextDeadline);
      setStatus("The daily shop refreshed automatically. A new set of listings is available.");
      markStockRotated();
    }, 1000);

    let cancelled = false;
    async function load() {
      let local: GameSave | null = null;
      try { local = parseSave(JSON.parse(window.localStorage.getItem(LOCAL_SAVE_KEY) || "null")); } catch {}
      try {
        const [saveResponse, conservationResponse] = await Promise.all([
          fetch("/api/hatchery/chondro-breeder/save", { cache: "no-store" }),
          fetch("/api/hatchery/chondro-breeder/conservation", { cache: "no-store" }),
        ]);
        const saveData = await saveResponse.json();
        if (!cancelled && saveResponse.ok) {
          const isAuthenticated = Boolean(saveData.authenticated);
          const cloud = parseSave(saveData.save?.state);
          // Compare updatedAt like the main game view: a rapid buy-then-navigate
          // must not let a stale cloud save clobber newer local state.
          const cloudUpdatedAt = Number(cloud?.updatedAt ?? 0);
          const localUpdatedAt = Number(local?.updatedAt ?? 0);
          const resolved = cloud && cloudUpdatedAt >= localUpdatedAt ? cloud : local ?? cloud ?? makeStarterSave();
          setAuthenticated(isAuthenticated);
          setSave(resolved);
          if (!cloud && !local) {
            try {
              await persistStandaloneShopSave(resolved, isAuthenticated);
            } catch {
              // Keep the locally initialized starter save usable even if cloud persistence is temporarily unavailable.
            }
          }
        } else if (!cancelled) {
          const resolved = local ?? makeStarterSave();
          setSave(resolved);
          if (!local) {
            try {
              await persistStandaloneShopSave(resolved, false);
            } catch {}
          }
        }
        if (!cancelled && conservationResponse.ok) {
          const conservationData = await conservationResponse.json() as { status?: ConservationRow[] };
          setConservation(conservationData.status ?? []);
        }
        return;
      } catch {}
      if (!cancelled) {
        const resolved = local ?? makeStarterSave();
        setSave(resolved);
        if (!local) {
          try {
            await persistStandaloneShopSave(resolved, false);
          } catch {}
        }
      }
    }

    void load();
    const dataTimer = window.setInterval(load, 5000);
    const onConservation = () => void load();
    const onSaveChange = () => void load();
    window.addEventListener("chondro-conservation-updated", onConservation);
    window.addEventListener("arboreal-chondro-breeder-save-change", onSaveChange);
    return () => {
      cancelled = true;
      window.clearInterval(rotationTimer);
      window.clearInterval(dataTimer);
      window.removeEventListener("chondro-conservation-updated", onConservation);
      window.removeEventListener("arboreal-chondro-breeder-save-change", onSaveChange);
    };
  }, []);

  const offers = useMemo(() => buildOffers(seed, conservation), [seed, conservation]);
  const localityOptions = useMemo(() => Array.from(new Set(offers.map((offer) => offer.locality).filter(Boolean))).sort(), [offers]);
  const sexOptions = useMemo(() => Array.from(new Set(offers.map((offer) => offer.sex).filter(Boolean))).sort(), [offers]);
  const visibleOffers = useMemo(() => {
    const q = storeFilters.query.trim().toLowerCase();
    const band = PRICE_BANDS.find((entry) => entry.id === storeFilters.priceBand) ?? PRICE_BANDS[0];
    const list = offers.filter(
      (offer) =>
        (!q || [offer.name, offer.locality, offer.subspecies].some((value) => String(value ?? "").toLowerCase().includes(q))) &&
        (storeFilters.locality === "All" || offer.locality === storeFilters.locality) &&
        (storeFilters.sex === "All" || offer.sex === storeFilters.sex) &&
        band.test(offer.price)
    );
    const sorted = [...list];
    if (storeFilters.sort === "price-asc") sorted.sort((a, b) => a.price - b.price);
    else if (storeFilters.sort === "price-desc") sorted.sort((a, b) => b.price - a.price);
    else if (storeFilters.sort === "name") sorted.sort((a, b) => String(a.name ?? "").localeCompare(String(b.name ?? "")));
    else sorted.sort((a, b) => Number(b.featured ?? false) - Number(a.featured ?? false));
    return sorted;
  }, [offers, storeFilters]);
  const storeFiltersActive =
    storeFilters.query.trim() !== "" || storeFilters.locality !== "All" || storeFilters.sex !== "All" || storeFilters.priceBand !== "any" || storeFilters.sort !== "featured";
  const activeFilterCount =
    (storeFilters.query.trim() !== "" ? 1 : 0) +
    (storeFilters.locality !== "All" ? 1 : 0) +
    (storeFilters.sex !== "All" ? 1 : 0) +
    (storeFilters.priceBand !== "any" ? 1 : 0) +
    (storeFilters.sort !== "featured" ? 1 : 0);
  function resetStoreFilters() {
    setStoreFilters(DEFAULT_STORE_FILTERS);
  }
  const purchased = useMemo(() => new Set(save?.purchasedStoreIds ?? []), [save?.purchasedStoreIds]);
  const installedFootprint = enclosureFootprint(save?.enclosures);
  const capacity = unlimitedSpaces ? Number.POSITIVE_INFINITY : animalHousingCapacity(save?.enclosures);
  const physicalRoomCapacity = roomCapacityFromSave({ facilityRooms: save?.facilityRooms });
  const roomEnclosureSlots = Math.max(0, physicalRoomCapacity - installedFootprint);
  const colony = save?.colony ?? [];
  // Housing rule v2 (owner-confirmed): chondros of any life stage can live in
  // a Chondro Dojo Bin — adults do NOT require PVC. Any open animal slot works.
  const openSlots = unlimitedSpaces ? Number.POSITIVE_INFINITY : openAnimalSlots(save?.enclosures, colony.length);

  function housingAvailableFor(offer: Offer) {
    if (unlimitedSpaces) return true;
    // Species-aware by design: every offer in this shop is a chondro, so any
    // open slot works, adult or not. canHouseAnimal is the shared rule with
    // the save API's server-side enforcement.
    return canHouseAnimal(save?.enclosures, colony.length, { species: "chondro", lifeStage: offer.lifeStage });
  }

  const refreshRemaining = refreshAt > 0 && now > 0 ? Math.max(0, refreshAt - now) : SHOP_REFRESH_MS;
  const refreshUrgent = refreshAt > 0 && now > 0 && refreshRemaining < 60 * 60 * 1000;

  async function buyEnclosure(type: EnclosureType, qty = 1) {
    if (!save || busy || roomEnclosureSlots <= 0) return;
    // Bulk buy: clamp to open installation slots (each unit needs one).
    const count = Math.max(1, Math.min(Math.floor(qty) || 1, roomEnclosureSlots));
    const price = enclosurePrices[type];
    const total = price * count;
    if (save.cash < total) {
      setStatus(`Not enough cash for ${count} × ${enclosureDisplay[type].label} (${money(total)}) — come back when the funds are right.`);
      playHankScaleLine(10);
      return;
    }
    const next: GameSave = {
      ...save,
      cash: save.cash - total,
      enclosures: {
        ...save.enclosures,
        [type]: Number(save.enclosures?.[type] ?? 0) + count,
      },
    };
    setBusy(`enclosure:${type}`);
    setStatus(`Buying ${count} × ${enclosureDisplay[type].label}…`);
    try {
      await persistStandaloneShopSave(next, authenticated);
      setSave(next);
      setStatus(`${count} × ${enclosureDisplay[type].label} purchased. Your snake capacity increased by ${count * (type === "Chondro Dojo Bin" ? 2 : 1)}.`);
      playHankScaleLine(12);
      setEnclosureQty((prev) => ({ ...prev, [type]: 1 }));
    } catch {
      setStatus("That enclosure purchase could not be saved.");
    } finally {
      setBusy(null);
    }
  }

  async function buy(offer: Offer) {
    if (!save || busy) return;
    if (purchased.has(offer.id)) {
      playHankScaleLine(18);
      return;
    }
    if (!housingAvailableFor(offer)) {
      setStatus(`${offer.name} needs a home first — grab an enclosure before bringing this one home.`);
      playHankScaleLine(19);
      return;
    }
    if (save.cash < offer.price) {
      setStatus(`Not enough cash for ${offer.name} — come back when the funds are right.`);
      playHankScaleLine(10);
      return;
    }
    setBusy(offer.id);
    setStatus("");
    const next: GameSave = {
      ...save,
      cash: save.cash - offer.price,
      colony: [...save.colony, offer],
      purchasedStoreIds: [...(save.purchasedStoreIds ?? []), offer.id],
    };
    try {
      await persistStandaloneShopSave(next, authenticated);
      setSave(next);
      setStatus(`${offer.name} purchased. It is now in your colony.`);
      playHankScaleLine(9);
      // Milestone callout once the purchase line finishes.
      if (next.colony.length === 5 || next.colony.length === 10) {
        if (milestoneTimer.current) window.clearTimeout(milestoneTimer.current); milestoneTimer.current = window.setTimeout(() => playHankScaleLine(21), 6500);
      }
    } catch {
      setStatus("That purchase could not be saved.");
    } finally {
      setBusy(null);
    }
  }

  if (!save) {
    return <div className="mx-auto max-w-7xl px-5 pt-5 sm:px-6"><div className="rounded-[24px] border border-white/[.06] bg-white/[.02] p-5 text-sm text-white/40">Loading snake store…</div></div>;
  }

  return (
    <div className={section ? undefined : "mx-auto max-w-7xl px-5 pt-5 sm:px-6"}>
      {(!section || section === "qa") ? (
      <section className="mb-4 overflow-hidden rounded-[26px] border border-violet-300/15 bg-[radial-gradient(circle_at_top_left,rgba(196,181,253,.08),transparent_38%),#0a0810] p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[.16em] text-violet-100/60">Sprite QA · All game animals</div>
            <h3 className="mt-2 text-xl font-semibold text-white/82">Check every sprite slot in one place.</h3>
            <p className="mt-1 max-w-3xl text-xs leading-5 text-white/40">This strip is for artwork review only; these cards are not store listings. Juvenile cards verify the shared Hatchling/Neonate art. Adult cards verify the shared Subadult/Adult art. Any unresolved slot will say Sprite pending instead of borrowing unrelated artwork.</p>
          </div>
          <div className="rounded-xl border border-violet-300/15 bg-violet-300/[.04] px-4 py-2 text-right">
            <div className="text-[9px] font-black uppercase tracking-[.14em] text-violet-100/45">QA slots</div>
            <div className="mt-1 text-sm font-black text-violet-100/80">{spriteQaItems.length}</div>
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between gap-3 text-[10px] text-white/32">
          <span>Swipe horizontally to inspect every registered or pending sprite slot.</span>
          <span>Pure · Hybrid · Designer · Specials</span>
        </div>

        <div
          aria-label="Sprite QA carousel"
          className="mt-4 flex snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain pb-3 [scrollbar-width:thin] [scrollbar-color:rgba(196,181,253,.28)_transparent]"
        >
          {spriteQaItems.map((item) => (
            <article key={item.id} className="w-[78%] shrink-0 snap-start rounded-2xl border border-white/[.065] bg-black/15 p-3 sm:w-[260px]">
              <ChondroSnakeIcon
                subspecies={item.subspecies}
                name={item.label}
                lifeStage={item.lifeStage}
                neonateColor={item.neonateColor}
                locality={item.locality}
                classification={item.classification}
                ancestry={item.ancestry}
                localityAncestry={item.localityAncestry}
                phenotypeScore={item.phenotypeScore}
                spriteSeed={item.spriteSeed}
                compact
              />
              <div className="mt-3 text-sm font-semibold text-white/78">{item.label}</div>
              <div className="mt-1 text-[10px] leading-4 text-white/36">{item.detail}</div>
              <div className="mt-2 flex flex-wrap gap-1.5 text-[8px] font-black uppercase tracking-[.1em]">
                <span className="rounded-full border border-white/[.07] px-2 py-1 text-white/45">{item.classification}</span>
                <span className={`rounded-full border px-2 py-1 ${item.neonateColor === "Red" ? "border-red-200/15 text-red-100/60" : "border-amber-100/15 text-amber-100/60"}`}>{item.neonateColor}</span>
              </div>
            </article>
          ))}
        </div>
      </section>
      ) : null}
      {(!section || section === "enclosures") ? (
      <section className={carousel ? "h-full overflow-x-hidden overflow-y-auto rounded-[22px] border border-emerald-300/15 bg-[radial-gradient(circle_at_top_left,rgba(52,211,153,.08),transparent_38%),#07110d] p-2.5 sm:overflow-hidden" : "mb-4 overflow-hidden rounded-[26px] border border-emerald-300/15 bg-[radial-gradient(circle_at_top_left,rgba(52,211,153,.08),transparent_38%),#07110d] p-4 sm:p-5"}>
        {carousel ? (
          <div className="flex flex-none items-center justify-between gap-2">
            <div className="truncate text-[10px] font-black uppercase tracking-[.16em] text-emerald-100/55">Enclosures</div>
            <div className="shrink-0 text-[10px] text-emerald-100/45">{unlimitedSpaces ? "Unlimited animal spaces" : `${openSlots} open animal spaces`}</div>
          </div>
        ) : (
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[.16em] text-emerald-100/55">Enclosures</div>
            <h3 className="mt-2 text-xl font-semibold text-white/80">Buy housing before you buy snakes.</h3>
            <p className="mt-1 text-xs leading-5 text-white/38">A Chondro Dojo 2 Stack uses one facility slot and houses Green Tree Pythons from hatchling to adult — two spaces per stack. A PVC Arboreal enclosure uses one facility slot for one snake: the upgrade/alternative for larger adults and display setups. Your facility currently has {roomEnclosureSlots} installation slot{roomEnclosureSlots === 1 ? "" : "s"} open.</p>
          </div>
          <div className="rounded-xl border border-white/[.07] bg-black/15 px-4 py-2 text-right">
            <div className="text-[9px] font-black uppercase tracking-[.13em] text-white/32">Animal capacity</div>
            <div className="mt-1 text-sm font-black text-emerald-100/72">{unlimitedSpaces ? "Unlimited spaces" : `${capacity} total · ${openSlots} open`}</div>
          </div>
        </div>
        )}

        {roomEnclosureSlots <= 0 ? (<div className="mb-3 rounded-xl border border-amber-200/20 bg-amber-200/[.05] px-3 py-2 text-[11px] leading-5 text-amber-100/75">No installation slots left. Expand your rooms on the <strong>Home</strong> screen (Rooms &amp; Facility Expansion), then come back to install more enclosures.</div>) : null} <div className={carousel ? "mt-2 flex snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain pb-1 [scrollbar-width:thin] [scrollbar-color:rgba(52,211,153,.3)_transparent]" : "mt-4 grid gap-3 md:grid-cols-2"}>
          {(["Chondro Dojo Bin", "PVC Arboreal"] as EnclosureType[]).map((type) => {
            const price = enclosurePrices[type];
            const owned = Number(save.enclosures?.[type] ?? 0);
            const unavailable = busy !== null || roomEnclosureSlots <= 0;
            // Bulk buy: each unit needs an installation slot, so the stepper
            // caps at open slots. The confirm key includes the qty so changing
            // it re-arms the two-tap confirm with the new total.
            const maxQty = Math.max(1, Math.min(roomEnclosureSlots, 25));
            const qty = Math.max(1, Math.min(enclosureQty[type] ?? 1, maxQty));
            const confirmId = `enclosure:${type}:x${qty}`;
            function bumpQty(delta: number) {
              setEnclosureQty((prev) => ({ ...prev, [type]: Math.max(1, Math.min((prev[type] ?? 1) + delta, maxQty)) }));
            }
            const stepper = (
              <div className="flex items-center gap-1" onClick={(event) => event.stopPropagation()}>
                <button type="button" aria-label="Decrease quantity" disabled={qty <= 1} onClick={(event) => { event.stopPropagation(); bumpQty(-1); }} className="grid h-6 w-6 place-items-center rounded-md border border-white/[.1] text-sm font-black leading-none text-white/60 disabled:opacity-25">−</button>
                <span className="min-w-8 text-center text-[11px] font-black tabular-nums text-white/70">×{qty}</span>
                <button type="button" aria-label="Increase quantity" disabled={qty >= maxQty} onClick={(event) => { event.stopPropagation(); bumpQty(1); }} className="grid h-6 w-6 place-items-center rounded-md border border-white/[.1] text-sm font-black leading-none text-white/60 disabled:opacity-25">+</button>
              </div>
            );
            return (
              <article
                key={type}
                role="button"
                tabIndex={0}
                aria-label={`View details for ${enclosureDisplay[type].label}`}
                onClick={() => setDetailEnclosure(type)}
                onKeyDown={(event) => handleCardKeyDown(event, () => setDetailEnclosure(type))}
                className={carousel ? "group w-full shrink-0 cursor-pointer snap-start overflow-hidden rounded-[20px] border border-white/[.07] bg-black/15 transition-all duration-200 hover:-translate-y-1 hover:border-emerald-300/30 hover:shadow-[0_14px_36px_rgba(52,211,153,.18)] focus-visible:outline-2 focus-visible:outline-emerald-300 sm:w-[230px] lg:w-[300px]" : "group cursor-pointer overflow-hidden rounded-[22px] border border-white/[.07] bg-black/15 transition-all duration-200 hover:-translate-y-1 hover:border-emerald-300/30 hover:shadow-[0_14px_36px_rgba(52,211,153,.18)] focus-visible:outline-2 focus-visible:outline-emerald-300"}
              >
                <div className={carousel ? "relative h-24 lg:h-32 overflow-hidden border-b border-white/[.06] bg-black/25" : "relative aspect-[16/8] overflow-hidden border-b border-white/[.06] bg-black/25"}>
                  {type === "Chondro Dojo Bin" ? (
                    <Image src="/hatchery/game/chondro-dojo-2-stack.webp" alt="Chondro Dojo 2 Stack — clear 64-quart tub enclosure in a wooden rack with a PVC pipe perch frame, water dish, mulch, and a red green tree python neonate" fill sizes="(max-width: 768px) 100vw, 50vw" className="object-cover object-center opacity-95 transition-transform duration-500 group-hover:scale-105" />
                  ) : (
                    <Image src="/hatchery/game/pvc-arboreal-enclosure.webp" alt="PVC Arboreal Enclosure — tall black PVC enclosure with perches and an adult green tree python" fill sizes="(max-width: 768px) 100vw, 50vw" className="object-cover object-center opacity-95 transition-transform duration-500 group-hover:scale-105" />
                  )}
                  <div className={carousel ? "absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/35 to-transparent px-3 pb-1.5 pt-6" : "absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/35 to-transparent px-4 pb-3 pt-10"}>
                    <div className={carousel ? "text-[13px] font-semibold text-white lg:text-[15px]" : "text-lg font-semibold text-white"}>{enclosureDisplay[type].label}</div>
                  </div>
                </div>
                {carousel ? (
                <div className="p-2.5">
                  <div className="flex items-center justify-between gap-2 text-[11px]">
                    <span className="text-white/45">{owned} owned</span>
                    <span className="font-semibold text-emerald-200/78">{money(price)}</span>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    {stepper}
                    <span className="text-[11px] font-semibold tabular-nums text-emerald-200/78">{money(price * qty)}</span>
                  </div>
                  <button type="button" disabled={unavailable} onClick={(event) => { event.stopPropagation(); confirmedTap(confirmId, () => void buyEnclosure(type, qty)); }} className="mt-2 w-full rounded-lg bg-emerald-300 px-3 py-1.5 text-[10px] font-black text-[#06100c] disabled:opacity-30">
                    {roomEnclosureSlots <= 0 ? "No room slots" : save.cash < price * qty ? `Need ${money(price * qty)}` : busy === `enclosure:${type}` ? "…" : confirmKey === confirmId ? `Confirm ${money(price * qty)}?` : qty > 1 ? `Buy ×${qty}` : "Buy"}
                  </button>
                </div>
                ) : (
                <div className="p-4">
                  <p className="mb-3 text-[11px] leading-5 text-white/38">{enclosureDisplay[type].detail}</p>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-[10px] uppercase tracking-[.12em] text-white/30">Owned</div>
                      <div className="mt-1 text-sm font-semibold text-white/70">{owned} owned · {type === "Chondro Dojo Bin" ? "+2 snake capacity per set" : "+1 snake capacity each"}</div>
                    </div>
                    <div className="text-lg font-semibold text-emerald-200/78">{money(price)}</div>
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold uppercase tracking-[.12em] text-white/30">Qty</span>
                      {stepper}
                    </div>
                    <span className="text-sm font-semibold tabular-nums text-emerald-200/78">{money(price * qty)}</span>
                  </div>
                  <button type="button" disabled={unavailable} onClick={(event) => { event.stopPropagation(); confirmedTap(confirmId, () => void buyEnclosure(type, qty)); }} className="mt-3 w-full rounded-xl bg-emerald-300 px-4 py-3 text-xs font-black text-[#06100c] disabled:opacity-30">
                    {roomEnclosureSlots <= 0 ? "No room slots — expand rooms on Home" : save.cash < price * qty ? `Need ${money(price * qty)}` : busy === `enclosure:${type}` ? "Installing…" : confirmKey === confirmId ? `Tap again to confirm — ${money(price * qty)}` : qty > 1 ? `Buy ×${qty} ${enclosureDisplay[type].label}` : `Buy ${enclosureDisplay[type].label}`}
                  </button>
                </div>
                )}
              </article>
            );
          })}
        </div>
      </section>
      ) : null}
      {(!section || section === "snakes") ? (
      <section className={carousel ? "flex h-full flex-col overflow-x-hidden overflow-y-auto rounded-[22px] border border-sky-300/15 bg-sky-300/[.025] p-2.5 sm:overflow-hidden" : "rounded-[24px] border border-sky-300/15 bg-sky-300/[.025] p-4 sm:p-5"}>
        {carousel ? (
          <div className="flex flex-none items-center justify-between gap-2">
            <div className="truncate text-[10px] font-black uppercase tracking-[.16em] text-sky-100/55">{visibleOffers.length} of {offers.length} snakes</div>
            <div className={`shrink-0 text-[10px] tabular-nums ${refreshUrgent ? "anim-keeper-pulse-soft font-black text-amber-200/90" : "text-sky-100/45"}`}>refresh {formatCountdown(refreshRemaining)}</div>
          </div>
        ) : (
        <>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[.16em] text-sky-100/55">Expanded daily listings</div>
            <h3 className="mt-2 text-xl font-semibold text-white/80">{storeFiltersActive ? `${visibleOffers.length} of ${offers.length} match` : `${offers.length} snakes available now`}</h3>
            <p className="mt-1 text-xs text-white/35">Swipe left or right through the full store. Three snake cards display together when the screen has enough room.</p>
          </div>
          <div className="rounded-xl border border-sky-300/15 bg-sky-300/[.04] px-4 py-2 text-right">
            <div className="text-[9px] font-black uppercase tracking-[.14em] text-sky-100/45">Next shop refresh</div>
            <div className={`mt-1 tabular-nums text-sm font-black ${refreshUrgent ? "anim-keeper-pulse-soft text-amber-200/90" : "text-sky-100/80"}`}>{formatCountdown(refreshRemaining)}</div>
          </div>
        </div>

        <div className="mt-3 rounded-xl border border-white/[.055] bg-black/10 px-3 py-2 text-[10px] leading-5 text-white/38">
          Inventory rotates automatically every 24 hours. Closing the game does not reset the timer; overdue rotations are applied when you return. Every snake needs an open animal space — buy housing in Enclosures above first.
        </div>

        <div className="mt-4 flex items-center justify-between gap-3 text-[10px] text-white/32">
          <span>Swipe to browse all {visibleOffers.length} listing{visibleOffers.length === 1 ? "" : "s"}</span>
          <span>{unlimitedSpaces ? "Unlimited animal spaces" : `${openSlots} open animal space${openSlots === 1 ? "" : "s"}`} · cash {money(save.cash)}</span>
        </div>
        </>
        )}

        {/* Search / filters / sort — collapsible panel, persisted across visits */}
        <div className="mt-2 flex-none">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setFiltersOpen((open) => !open)}
              aria-expanded={filtersOpen}
              aria-label={filtersOpen ? "Hide store filters" : "Show store filters"}
              className="flex flex-1 items-center justify-between gap-2 rounded-xl border border-white/[.08] bg-black/20 px-3 py-2 text-left"
            >
              <span className="text-[11px] font-black uppercase tracking-[.14em] text-white/55">
                {filtersOpen ? "Hide filters" : "Show filters"}{storeFiltersActive ? ` · ${activeFilterCount} active` : ""}
              </span>
              <span aria-hidden="true" className={`text-sm text-white/45 transition-transform duration-200 ${filtersOpen ? "rotate-180" : ""}`}>▾</span>
            </button>
            {storeFiltersActive ? <button type="button" onClick={resetStoreFilters} className="shrink-0 rounded-xl border border-white/[.1] px-3 py-2 text-[11px] font-bold text-white/55">Reset</button> : null}
          </div>
          {filtersOpen ? (
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <input
            value={storeFilters.query}
            onChange={(event) => setStoreFilters((prev) => ({ ...prev, query: event.target.value }))}
            placeholder="Search name, locality…"
            aria-label="Search snake listings"
            className="min-w-0 flex-1 basis-24 rounded-lg border border-white/[.08] bg-black/20 px-2.5 py-1.5 text-[11px] text-white/75 outline-none placeholder:text-white/25"
          />
          <select value={storeFilters.locality} onChange={(event) => setStoreFilters((prev) => ({ ...prev, locality: event.target.value }))} aria-label="Filter by locality" className="rounded-lg border border-white/[.08] bg-black/20 px-2 py-1.5 text-[11px] text-white/65">
            <option value="All">All localities</option>
            {localityOptions.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
          <select value={storeFilters.sex} onChange={(event) => setStoreFilters((prev) => ({ ...prev, sex: event.target.value }))} aria-label="Filter by sex" className="rounded-lg border border-white/[.08] bg-black/20 px-2 py-1.5 text-[11px] text-white/65">
            <option value="All">Both sexes</option>
            {sexOptions.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
          <select value={storeFilters.priceBand} onChange={(event) => setStoreFilters((prev) => ({ ...prev, priceBand: event.target.value }))} aria-label="Filter by price" className="rounded-lg border border-white/[.08] bg-black/20 px-2 py-1.5 text-[11px] text-white/65">
            {PRICE_BANDS.map((band) => <option key={band.id} value={band.id}>{band.label}</option>)}
          </select>
          <select value={storeFilters.sort} onChange={(event) => setStoreFilters((prev) => ({ ...prev, sort: event.target.value as StoreSort }))} aria-label="Sort listings" className="rounded-lg border border-white/[.08] bg-black/20 px-2 py-1.5 text-[11px] text-white/65">
            <option value="featured">Sort: Featured</option>
            <option value="price-asc">Sort: Price ↑</option>
            <option value="price-desc">Sort: Price ↓</option>
            <option value="name">Sort: Name</option>
          </select>
          </div>
          ) : null}
        </div>

        {/* Upfront low-capacity banner */}
        {openSlots <= 3 ? (
          <div className="mt-2 flex-none rounded-xl border border-amber-200/20 bg-amber-200/[.05] px-3 py-2 text-[11px] leading-5 text-amber-100/75">
            {openSlots <= 0
              ? "No open animal spaces — buy housing in the Enclosures tab before bringing a snake home."
              : `Only ${openSlots} open animal space${openSlots === 1 ? "" : "s"} left — buy housing in the Enclosures tab before it fills up.`}
          </div>
        ) : null}

        <div
          aria-label="Scrollable snake store listings"
          className={carousel ? "mt-2 flex min-h-0 flex-none snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain pb-1 [scrollbar-width:thin] [scrollbar-color:rgba(125,211,252,.28)_transparent] sm:grow-0 sm:shrink" : "mt-4 flex snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain pb-3 [scrollbar-width:thin] [scrollbar-color:rgba(125,211,252,.28)_transparent]"}
        >
          {visibleOffers.length === 0 ? (
            <div className="w-full shrink-0 rounded-2xl border border-white/[.06] bg-black/10 p-6 text-center text-xs text-white/40">
              No snakes match these filters. <button type="button" onClick={resetStoreFilters} className="font-bold text-sky-200/70 underline">Reset filters</button>
            </div>
          ) : null}
          {visibleOffers.map((offer) => {
            const sold = purchased.has(offer.id);
            const effect = conservation.find((row) => row.subspecies === offer.subspecies);
            return (
              <article
                key={offer.id}
                role="button"
                tabIndex={0}
                aria-label={`View details for ${offer.name}`}
                onClick={() => setDetailOffer(offer)}
                onKeyDown={(event) => handleCardKeyDown(event, () => setDetailOffer(offer))}
                className={carousel ? `group w-full shrink-0 cursor-pointer snap-start rounded-2xl border p-2.5 transition-all duration-200 hover:-translate-y-1 hover:border-sky-300/30 hover:shadow-[0_14px_36px_rgba(125,211,252,.16)] focus-visible:outline-2 focus-visible:outline-sky-300 sm:w-[230px] lg:w-[300px] ${offer.featured ? "keeper-featured border-amber-200/25 bg-amber-200/[.035]" : "border-white/[.06] bg-black/10"}` : `group w-[82%] shrink-0 cursor-pointer snap-start rounded-2xl border p-3 transition-all duration-200 hover:-translate-y-1 hover:border-sky-300/30 hover:shadow-[0_14px_36px_rgba(125,211,252,.16)] focus-visible:outline-2 focus-visible:outline-sky-300 sm:w-[48%] lg:w-[calc((100%-1.5rem)/3)] ${offer.featured ? "keeper-featured border-amber-200/25 bg-amber-200/[.035]" : "border-white/[.06] bg-black/10"}`}
              >
                <div className="relative">
                <div className="transition-transform duration-300 group-hover:scale-[1.03]">
                <ChondroSnakeIcon
                  subspecies={offer.subspecies}
                  name={offer.name}
                  traits={{ highBlack: offer.highBlack, highWhite: offer.highWhite, blueStripe: offer.blueStripe, yellowRetention: offer.yellowRetention, blotches: offer.blotches }}
                  lifeStage={offer.lifeStage}
                  neonateColor={offer.neonateColor}
                  locality={offer.locality}
                  classification={offer.classification}
                  ancestry={offer.ancestry}
                  localityAncestry={offer.localityAncestry}
                  phenotypeScore={offer.phenotypeScore}
                  spriteSeed={offer.id}
                  compact
                  large={carousel}
                />
                </div>
                {carousel ? (
                <div className="absolute inset-x-2 bottom-2 flex items-center justify-between gap-2 sm:hidden">
                  <span className="rounded-lg bg-black/65 px-2 py-1 text-sm font-semibold text-emerald-200/90 backdrop-blur-sm">{money(offer.price)}</span>
                  <button type="button" disabled={sold || busy !== null || save.cash < offer.price || !housingAvailableFor(offer)} title={sold ? undefined : !housingAvailableFor(offer) ? "No open animal space — add enclosures above" : undefined} onClick={(event) => { event.stopPropagation(); confirmedTap(`offer:${offer.id}`, () => void buy(offer)); }} className="rounded-lg bg-amber-200 px-3 py-1.5 text-[10px] font-black text-[#17130a] shadow-lg disabled:opacity-30">
                    {sold ? "Owned" : !housingAvailableFor(offer) ? "Need space" : confirmKey === `offer:${offer.id}` ? "Confirm?" : "Buy"}
                  </button>
                </div>
                ) : null}
                </div>
                {carousel ? (
                <>
                <div className="mt-2 truncate text-[13px] font-semibold text-white/78">{offer.name || "Unnamed snake"}</div> <div className="mt-0.5 truncate text-[10px] text-white/38">{offer.lifeStage ?? "Unknown stage"} · {offer.sex ?? "Unknown sex"}</div>
                <div className="mt-2 hidden items-center justify-between gap-2 sm:flex">
                  <span className="text-sm font-semibold text-emerald-200/75">{money(offer.price)}</span>
                  <button type="button" disabled={sold || busy !== null || save.cash < offer.price || !housingAvailableFor(offer)} title={sold ? undefined : !housingAvailableFor(offer) ? "No open animal space — add enclosures above" : undefined} onClick={(event) => { event.stopPropagation(); confirmedTap(`offer:${offer.id}`, () => void buy(offer)); }} className="rounded-lg bg-amber-200 px-2.5 py-1.5 text-[10px] font-black text-[#17130a] disabled:opacity-30">
                    {sold ? "Owned" : !housingAvailableFor(offer) ? "Need space" : confirmKey === `offer:${offer.id}` ? "Confirm?" : "Buy"}
                  </button>
                </div>
                </>
                ) : (
                <>
                <div className="mt-3 font-semibold text-white/75">{offer.name}</div>
                <div className="mt-1 text-[10px] text-white/32">{offer.sex} · {offer.lifeStage} · {offer.locality}</div>
                <div className={`mt-1 text-[10px] font-semibold ${offer.neonateColor === "Red" ? "text-red-100/65" : "text-amber-100/65"}`}>Neonate color: {offer.neonateColor}</div>
                {offer.specialLabel ? <div className="mt-2 rounded-full border border-amber-200/20 px-2 py-1 text-center text-[9px] font-black uppercase text-amber-100/75">{offer.specialLabel}</div> : null}
                {offer.source === "Import" && effect && Number(effect.stewardship_score) > 0 ? <div className="mt-2 text-[9px] font-semibold text-emerald-100/55">Conservation-supported import · stewardship {Number(effect.stewardship_score).toFixed(1)}</div> : null}
                <div className="mt-3 rounded-xl border border-white/[.06] p-2 text-[10px] leading-5 text-white/42">
                  {offer.geneticsTested ? `HB ${offer.highBlack}% · HW ${offer.highWhite}% · Blue ${offer.blueStripe}% · Yellow ${offer.yellowRetention}%` : "Genetics untested · percentages hidden"}<br />
                  Nido: <span className={offer.nidoStatus === "Negative" ? "text-emerald-200/70" : "text-white/45"}>{offer.nidoStatus}</span>
                </div>
                <div className="mt-3 flex items-center justify-between gap-2">
                  <span className="font-semibold text-emerald-200/75">{money(offer.price)}</span>
                  <button type="button" disabled={sold || busy !== null || save.cash < offer.price || !housingAvailableFor(offer)} title={sold ? undefined : !housingAvailableFor(offer) ? "No open animal space — add enclosures above" : undefined} onClick={(event) => { event.stopPropagation(); confirmedTap(`offer:${offer.id}`, () => void buy(offer)); }} className="rounded-lg bg-amber-200 px-3 py-2 text-[10px] font-black text-[#17130a] disabled:opacity-30">
                    {sold ? "Purchased" : !housingAvailableFor(offer) ? "Need space" : confirmKey === `offer:${offer.id}` ? "Tap again to confirm" : "Buy"}
                  </button>
                </div>
                </>
                )}
              </article>
            );
          })}
        </div>

        {status ? <div role="status" className={carousel ? "mt-1 truncate text-[11px] text-sky-100/65 lg:text-xs" : "mt-3 text-xs text-sky-100/65"}>{status}</div> : null}
      </section>
      ) : null}

      {/* Detail popup — tapping any animal or enclosure card opens its dossier.
          Portaled to document.body so it truly covers the viewport: the shop's
          tab-switch animation leaves a transform on an ancestor, which would
          otherwise trap this fixed layer inside the carousel area.
          Full-screen takeover on mobile; centered card on larger screens. */}
      {detailOpen && typeof document !== "undefined"
        ? createPortal(
          <div
            className="fixed inset-0 z-[90] flex justify-center sm:items-center sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-label={detailOffer ? `Details for ${detailOffer.name}` : "Enclosure details"}
        >
          <button
            type="button"
            aria-label="Close details"
            onClick={closeDetail}
            className="anim-keeper-backdrop-in absolute inset-0 cursor-default bg-black/72 backdrop-blur-sm"
          />
          <div className="anim-keeper-pop-in relative flex h-[100dvh] w-full flex-col overflow-hidden bg-[#071009] sm:h-auto sm:max-h-[90dvh] sm:max-w-lg sm:rounded-[28px] sm:border sm:border-white/10">
            <div className="flex items-start justify-between gap-3 border-b border-white/[.06] p-4 pt-[max(1rem,env(safe-area-inset-top))] sm:p-5">
              <div>
                <div className="text-[9px] font-black uppercase tracking-[.17em] text-sky-200/50">
                  {detailOffer ? "Animal dossier" : "Enclosure dossier"}
                </div>
                <h3 className="mt-1 text-lg font-bold text-white">
                  {detailOffer ? detailOffer.name : detailEnclosure ? enclosureDisplay[detailEnclosure].label : ""}
                </h3>
              </div>
              <button
                type="button"
                onClick={closeDetail}
                aria-label="Close"
                className="rounded-xl border border-white/10 bg-white/[.04] px-3.5 py-2 text-sm font-black text-white/70 hover:bg-white/[.08]"
              >
                ✕
              </button>
            </div>

            <div className="overflow-y-auto p-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:p-5">
              {detailOffer ? (
                <DetailOfferDossier
                  offer={detailOffer}
                  sold={purchased.has(detailOffer.id)}
                  busy={busy !== null}
                  buying={busy === detailOffer.id}
                  canAfford={save.cash >= detailOffer.price}
                  housingOk={housingAvailableFor(detailOffer)}
                  confirmArmed={confirmKey === `dossier:${detailOffer.id}`} onBuy={() => confirmedTap(`dossier:${detailOffer.id}`, () => void buy(detailOffer))}
                />
              ) : detailEnclosure ? (
                (() => {
                  const type = detailEnclosure;
                  const price = enclosurePrices[type];
                  const owned = Number(save.enclosures?.[type] ?? 0);
                  const unavailable = busy !== null || roomEnclosureSlots <= 0;
                  const dossierMaxQty = Math.max(1, Math.min(roomEnclosureSlots, 25));
                  const dossierQty = Math.max(1, Math.min(enclosureQty[type] ?? 1, dossierMaxQty));
                  const dossierConfirmId = `dossier-enclosure:${type}:x${dossierQty}`;
                  return (
                    <div>
                      <div className="relative aspect-[16/9] overflow-hidden rounded-2xl border border-white/[.07] bg-black/25">
                        {type === "Chondro Dojo Bin" ? (
                          <Image src="/hatchery/game/chondro-dojo-2-stack.webp" alt="Chondro Dojo 2 Stack" fill sizes="(max-width: 640px) 100vw, 480px" className="object-cover object-center" />
                        ) : (
                          <Image src="/hatchery/game/pvc-arboreal-enclosure.webp" alt="PVC Arboreal Enclosure" fill sizes="(max-width: 640px) 100vw, 480px" className="object-cover object-center" />
                        )}
                      </div>
                      <p className="mt-4 text-[13px] leading-6 text-white/55">{enclosureDisplay[type].detail}</p>
                      <dl className="mt-4 grid grid-cols-2 gap-2.5 text-[11px]">
                        <div className="rounded-xl border border-white/[.06] bg-black/15 p-3">
                          <dt className="text-[9px] font-black uppercase tracking-[.12em] text-white/30">Snake capacity</dt>
                          <dd className="mt-1 font-semibold text-emerald-200/80">{type === "Chondro Dojo Bin" ? "+2 neonate / subadult spaces" : "+1 space · adult-ready"}</dd>
                        </div>
                        <div className="rounded-xl border border-white/[.06] bg-black/15 p-3">
                          <dt className="text-[9px] font-black uppercase tracking-[.12em] text-white/30">Facility footprint</dt>
                          <dd className="mt-1 font-semibold text-white/70">1 installation slot</dd>
                        </div>
                        <div className="rounded-xl border border-white/[.06] bg-black/15 p-3">
                          <dt className="text-[9px] font-black uppercase tracking-[.12em] text-white/30">You own</dt>
                          <dd className="mt-1 font-semibold text-white/70">{owned}</dd>
                        </div>
                        <div className="rounded-xl border border-white/[.06] bg-black/15 p-3">
                          <dt className="text-[9px] font-black uppercase tracking-[.12em] text-white/30">Room slots open</dt>
                          <dd className={`mt-1 font-semibold ${roomEnclosureSlots > 0 ? "text-emerald-200/80" : "text-red-200/80"}`}>{roomEnclosureSlots}</dd>
                        </div>
                      </dl>
                      <div className="mt-4 flex items-center justify-between gap-3">
                        <span className="text-xl font-bold text-emerald-200/85">{money(price)}</span>
                        <span className="text-[11px] text-white/35">Hank installs it the moment you buy.</span>
                      </div>
                      <div className="mt-3 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-bold uppercase tracking-[.12em] text-white/30">Qty</span>
                          <div className="flex items-center gap-1">
                            <button type="button" aria-label="Decrease quantity" disabled={dossierQty <= 1} onClick={() => setEnclosureQty((prev) => ({ ...prev, [type]: dossierQty - 1 }))} className="grid h-7 w-7 place-items-center rounded-md border border-white/[.1] text-sm font-black leading-none text-white/60 disabled:opacity-25">−</button>
                            <span className="min-w-8 text-center text-xs font-black tabular-nums text-white/70">×{dossierQty}</span>
                            <button type="button" aria-label="Increase quantity" disabled={dossierQty >= dossierMaxQty} onClick={() => setEnclosureQty((prev) => ({ ...prev, [type]: dossierQty + 1 }))} className="grid h-7 w-7 place-items-center rounded-md border border-white/[.1] text-sm font-black leading-none text-white/60 disabled:opacity-25">+</button>
                          </div>
                        </div>
                        <span className="text-sm font-semibold tabular-nums text-emerald-200/78">{money(price * dossierQty)}</span>
                      </div>
                      <button
                        type="button"
                        disabled={unavailable || save.cash < price * dossierQty}
                        onClick={() => confirmedTap(dossierConfirmId, () => void buyEnclosure(type, dossierQty))}
                        className="mt-3 w-full rounded-xl bg-emerald-300 px-4 py-3 text-xs font-black text-[#06100c] transition hover:brightness-110 active:scale-[.98] disabled:opacity-30"
                      >
                        {roomEnclosureSlots <= 0 ? "No room slots — expand rooms on Home" : save.cash < price * dossierQty ? `Need ${money(price * dossierQty)}` : busy === `enclosure:${type}` ? "Installing…" : confirmKey === dossierConfirmId ? `Tap again to confirm — ${money(price * dossierQty)}` : dossierQty > 1 ? `Buy ×${dossierQty} ${enclosureDisplay[type].label}` : `Buy ${enclosureDisplay[type].label}`}
                      </button>
                    </div>
                  );
                })()
              ) : null}
            </div>
          </div>
          </div>,
          document.body
        )
        : null}
    </div>
  );
}

function DetailOfferDossier({
  offer,
  sold,
  busy,
  buying,
  canAfford,
  housingOk,
  onBuy, confirmArmed,
}: {
  offer: Offer;
  sold: boolean;
  busy: boolean;
  buying: boolean;
  canAfford: boolean;
  housingOk: boolean;
  onBuy: () => void; confirmArmed: boolean;
}) {
  const chips = [
    offer.sex,
    offer.lifeStage,
    offer.locality,
    subspeciesShort[offer.subspecies],
    offer.source,
    offer.classification,
    `${offer.neonateColor} neonate`,
  ];
  return (
    <div>
      <div className="anim-keeper-float">
        <ChondroSnakeIcon
          subspecies={offer.subspecies}
          name={offer.name}
          traits={{ highBlack: offer.highBlack, highWhite: offer.highWhite, blueStripe: offer.blueStripe, yellowRetention: offer.yellowRetention, blotches: offer.blotches }}
          lifeStage={offer.lifeStage}
          neonateColor={offer.neonateColor}
          locality={offer.locality}
          classification={offer.classification}
          ancestry={offer.ancestry}
          localityAncestry={offer.localityAncestry}
          phenotypeScore={offer.phenotypeScore}
          spriteSeed={offer.id}
        />
      </div>

      <div className="mt-4 flex flex-wrap gap-1.5">
        {chips.map((chip) => (
          <span key={chip} className="rounded-full border border-white/[.08] bg-white/[.03] px-2.5 py-1 text-[9px] font-black uppercase tracking-[.1em] text-white/50">
            {chip}
          </span>
        ))}
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-2.5 text-[11px]">
        <div className="rounded-xl border border-white/[.06] bg-black/15 p-3">
          <dt className="text-[9px] font-black uppercase tracking-[.12em] text-white/30">Phenotype score</dt>
          <dd className="mt-1 text-sm font-black text-amber-100/85">{offer.phenotypeScore}</dd>
        </div>
        <div className="rounded-xl border border-white/[.06] bg-black/15 p-3">
          <dt className="text-[9px] font-black uppercase tracking-[.12em] text-white/30">Condition</dt>
          <dd className="mt-1 text-sm font-semibold text-white/70">{offer.condition}</dd>
        </div>
        <div className="rounded-xl border border-white/[.06] bg-black/15 p-3">
          <dt className="text-[9px] font-black uppercase tracking-[.12em] text-white/30">Nido status</dt>
          <dd className={`mt-1 text-sm font-semibold ${offer.nidoStatus === "Negative" ? "text-emerald-200/80" : "text-white/50"}`}>{offer.nidoStatus}</dd>
        </div>
        <div className="rounded-xl border border-white/[.06] bg-black/15 p-3">
          <dt className="text-[9px] font-black uppercase tracking-[.12em] text-white/30">Genetics</dt>
          <dd className="mt-1 text-sm font-semibold text-white/70">{offer.geneticsTested ? "Tested" : "Untested"}</dd>
        </div>
      </dl>

      <div className="mt-2.5 rounded-xl border border-white/[.06] bg-black/15 p-3 text-[11px] leading-6 text-white/45">
        {offer.geneticsTested
          ? <>High black <span className="font-semibold text-white/70">{offer.highBlack}%</span> · High white <span className="font-semibold text-white/70">{offer.highWhite}%</span> · Blue stripe <span className="font-semibold text-white/70">{offer.blueStripe}%</span> · Yellow retention <span className="font-semibold text-white/70">{offer.yellowRetention}%</span> · Blotches <span className="font-semibold text-white/70">{offer.blotches}%</span></>
          : "Genetics untested — trait percentages stay hidden until you run a test in the Animals tab."}
      </div>

      {offer.notes ? <p className="mt-2.5 text-[11px] leading-5 text-emerald-100/55">{offer.notes}</p> : null}

      <div className={`mt-2.5 rounded-xl border p-3 text-[11px] leading-5 ${housingOk ? "border-emerald-300/15 bg-emerald-300/[.05] text-emerald-100/70" : "border-red-200/15 bg-red-300/[.05] text-red-100/70"}`}>
        {housingOk
          ? "You have open animal space for this one."
          : "This one needs a home first — grab an enclosure before bringing it home."}
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <span className="text-xl font-bold text-emerald-200/85">{money(offer.price)}</span>
        {offer.specialLabel ? <span className="rounded-full border border-amber-200/20 px-2.5 py-1 text-[9px] font-black uppercase text-amber-100/75">{offer.specialLabel}</span> : null}
      </div>
      <button
        type="button"
        disabled={sold || busy || !canAfford || !housingOk}
        onClick={onBuy}
        className="mt-3 w-full rounded-xl bg-amber-200 px-4 py-3 text-xs font-black text-[#17130a] transition hover:brightness-105 active:scale-[.98] disabled:opacity-30"
      >
        {sold ? "Purchased — check your colony" : !housingOk ? "Need open animal space" : !canAfford ? `Need ${money(offer.price)}` : buying ? "…" : confirmArmed ? `Tap again to confirm — ${money(offer.price)}` : `Buy ${offer.name}`}
      </button>
    </div>
  );
}
