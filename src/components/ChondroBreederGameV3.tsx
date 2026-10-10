"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { ChondroSnakeIcon } from "@/components/ChondroSnakeIcon";
import { clutchSizeForPairing } from "@/lib/chondro-clutch-size";
import { inheritTraitSet } from "@/lib/chondro-genetics";
import { breedingReputationGain, marketDemandForSeason, marketMultiplierForAnimal } from "@/lib/chondro-progression";
import { animalHousingCapacity, enclosureFootprint, geneticTestingUnlocked, roomCapacityFromSave, ROOM_EXPANSIONS, type FacilityRoomState } from "@/lib/chondro-facility-limits";
import { CHONDRO_SPECIES_PROFILE, growthCostFor, growthRequirementFor, needsExtraRecoveryYear, normalizeNeonateColorFor, randomNeonateColorFor } from "@/lib/breeder-species-profiles";
import IntroCinematic from "@/components/IntroCinematic";
import { CanopyHunter } from "@/components/CanopyHunter";
import {
  CANOPY_THEME_SRC,
  CANOPY_THEME_VOLUME,
  playGameMusic,
} from "@/lib/game-music";
import {
  CANOPY_REGIONS,
  EXPEDITION_ENTRY_FEE,
  EXPEDITION_FREE_COOLDOWN_MS,
  EXPEDITION_PERMIT_FEE,
  EXPEDITION_PYTHONS,
  PERMIT_GROVES,
  PYTHONS_PER_GROVE,
  REGION_RECOVERY_MS,
  SUBSPECIES_REGION_ID,
  consumeExpeditionOpenRequest,
  flightVideoForRegion,
  intelHotRegions,
  regionForSubspecies,
  wildSnakeToKeeperSnake,
  type CanopyRegion,
  type CanopySubspecies,
  type WildSnake,
} from "@/lib/canopy-hunter";
import {
  getTokenBalance,
  spendTokens as arcadeSpendTokens,
} from "@/lib/arcade";
import { ArcadeToasts } from "@/components/arcade/ArcadeToasts";

/** Arcade-token prices at the expedition gate. */
const TOKEN_EXTRA_EXPEDITION = 50;
const TOKEN_PERMIT = 120;
const TOKEN_CASH_RATE = 50; // $ per token on exchange

/**
 * Player-scoped intro-cinematic flag. Mirrored in localStorage so it survives
 * even if a save write fails; also persisted inside the save (server + local
 * save copy) and preserved across saves by the save API's EXTENSION_KEYS.
 */
const CINEMATIC_SEEN_KEY = "arboreal_keeper_cinematic_seen_v1";
function readCinematicSeenMirror(): boolean {
  try { return window.localStorage.getItem(CINEMATIC_SEEN_KEY) === "1"; } catch { return false; }
}
function writeCinematicSeenMirror(): void {
  try { window.localStorage.setItem(CINEMATIC_SEEN_KEY, "1"); } catch {}
}

/**
 * Fallback for players whose save predates the mirror key (or whose mirror was
 * lost): the game writes a local save copy on every persist, and that copy
 * carries cinematicSeen once the intro has played or been skipped.
 * (LOCAL_SAVE_KEY is declared below; this only runs at call time.)
 */
function readCinematicSeenFromSave(): boolean {
  try {
    const raw = window.localStorage.getItem(LOCAL_SAVE_KEY);
    if (!raw) return false;
    const parsed: unknown = JSON.parse(raw);
    return (
      !!parsed &&
      typeof parsed === "object" &&
      (parsed as { cinematicSeen?: unknown }).cinematicSeen === true
    );
  } catch {
    return false;
  }
}

/** Exported for the workspace title screen: has the player seen the intro cinematic? */
export function hasSeenIntroCinematic(): boolean {
  return readCinematicSeenMirror() || readCinematicSeenFromSave();
}

type Subspecies =
  | "Morelia azurea azurea"
  | "Morelia azurea pulcher"
  | "Morelia azurea utaraensis"
  | "Morelia viridis";
type Locality =
  | "Biak"
  | "Numfor"
  | "Manokwari"
  | "Arfak"
  | "Sorong"
  | "Timika"
  | "Kofiau"
  | "Cyclops"
  | "Jayapura"
  | "Lereh"
  | "Wamena"
  | "Yapen"
  | "Aru"
  | "Merauke";
type SnakeLocality = Locality | "Mixed Locality" | "Designer";
type Sex = "Male" | "Female";
type Source = "Captive Bred" | "Import";
type Classification = "Pure" | "Hybrid" | "Designer";
type NidoStatus = "Unknown" | "Negative" | "Positive";
type LifeStage = "Hatchling" | "Neonate" | "Subadult" | "Adult";
type TraitKey =
  | "highBlack"
  | "highWhite"
  | "blueStripe"
  | "yellowRetention"
  | "blotches";

type Snake = {
  id: string;
  name: string;
  sex: Sex;
  source: Source;
  subspecies: Subspecies;
  locality: SnakeLocality;
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
  nidoStatus: NidoStatus;
  condition: "Excellent" | "Good" | "Fair";
  classification: Classification;
  generation: number;
  parentIds: string[];
  ancestry: Partial<Record<Subspecies, number>>;
  notes: string;
  breederInitials: string | null;
  /** Wild-caught gravid female: true until she lays her clutch in the colony. */
  gravid?: boolean;
  /** Wall-clock timestamp when a gravid female lays (set at expedition import). */
  gravidLaysAt?: number;
  /**
   * Stable sprite seed carried over from a Canopy Hunter catch, so the colony
   * card shows the exact sprite (or "Sprite pending" treatment) the hunter
   * screens showed. Falls back to the animal id when absent.
   */
  spriteSeed?: string;
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
type BreedingStage = "cycling" | "pairing" | "development" | "incubation";
type BreedingCycle = { damId: string; sireId: string; stage: BreedingStage; startedAt: number; completesAt: number };
type GeneticTestJob = { snakeId: string; completesAt: number };
type FacilityConstruction = { roomId: string; completesAt: number };
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
  careerReputation?: number;
  facilityRooms?: FacilityRoomState;
  facilityConstruction?: FacilityConstruction | null;
  breedingCycle?: BreedingCycle | null;
  geneticTestsPending?: GeneticTestJob[];
  femaleRecovery?: Record<string, number>;
  seasonCarePaid?: number;
  breedingMessage?: string;
  clutchEstablished?: boolean;
  /** Intro cinematic seen — scoped to the player, not the save. Set once, never auto-plays again. */
  cinematicSeen?: boolean;
  updatedAt?: number;
  // Canopy Hunter expedition cadence (saved): next timestamp when the free
  // weekly expedition becomes available again.
  expeditionNextAt?: number;
  /** Region id → timestamp when its groves finish recovering. */
  regionRecovery?: Record<string, number>;
};

type RandomFn = () => number;

const STARTING_CASH = 30000;
const NIDO_TEST_COST = 125;
const GENETIC_TEST_COST = 350;
const GENETIC_TEST_HOURS = 12;
const SEASON_CARE_PER_ADULT = CHONDRO_SPECIES_PROFILE.reproduction.seasonCarePerAdult;
const CLUTCH_ESTABLISH_BASE_COST = 150;
const CLUTCH_ESTABLISH_PER_HATCHLING = 75;
const BREEDING_STAGES = CHONDRO_SPECIES_PROFILE.reproduction.stages as Array<{ id: BreedingStage; label: string; hours: number }>;
const LOCAL_SAVE_KEY = "arboreal_chondro_breeder_v2";
const DAY_MS = 86_400_000;
const enclosurePrices: Record<EnclosureType, number> = {
  "Chondro Dojo Bin": 250,
  "PVC Arboreal": 650,
};

const localitySubspecies: Record<Locality, Subspecies> = {
  Biak: "Morelia azurea azurea",
  Numfor: "Morelia azurea azurea",
  Manokwari: "Morelia azurea pulcher",
  Arfak: "Morelia azurea pulcher",
  Sorong: "Morelia azurea pulcher",
  Timika: "Morelia azurea pulcher",
  Kofiau: "Morelia azurea pulcher",
  Cyclops: "Morelia azurea utaraensis",
  Jayapura: "Morelia azurea utaraensis",
  Lereh: "Morelia azurea utaraensis",
  Wamena: "Morelia azurea utaraensis",
  Yapen: "Morelia azurea utaraensis",
  Aru: "Morelia viridis",
  Merauke: "Morelia viridis",
};
const allLocalities = Object.keys(localitySubspecies) as Locality[];
const preferredTraits = CHONDRO_SPECIES_PROFILE.traits.preferredByTaxon as Record<Subspecies, TraitKey[]>;
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
const remainingTime = (ms: number) => {
  const total = Math.max(0, Math.ceil(ms / 60_000));
  const days = Math.floor(total / 1440);
  const hours = Math.floor((total % 1440) / 60);
  const minutes = total % 60;
  if (days) return `${days}d ${hours}h`;
  if (hours) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
};
function pairingChance(dam: Snake, sire: Snake) {
  let chance = 0.78;
  if (dam.condition === "Excellent") chance += 0.08;
  if (sire.condition === "Excellent") chance += 0.04;
  if (dam.condition === "Fair") chance -= 0.28;
  if (sire.condition === "Fair") chance -= 0.16;
  return Math.max(0.25, Math.min(0.94, chance));
}
function pairingFailureReason(dam: Snake, sire: Snake) {
  if (dam.condition === "Fair") return "The female did not cycle strongly enough to complete the pairing.";
  if (sire.condition === "Fair") return "The male showed poor breeding interest this cycle.";
  return Math.random() < 0.5 ? "No successful lock was observed." : "The female was unreceptive and the pairing was stopped.";
}
const pick = <T,>(a: T, b: T) => (Math.random() < 0.5 ? a : b);
const tailFor = (s: Subspecies) =>
  s === "Morelia azurea utaraensis"
    ? "Matching body color and pattern"
    : "Black-dipped";
const isNamedLocality = (value: SnakeLocality): value is Locality =>
  Object.prototype.hasOwnProperty.call(localitySubspecies, value);
const portraitTraits = (a: Snake) => ({
  highBlack: a.highBlack,
  highWhite: a.highWhite,
  blueStripe: a.blueStripe,
  yellowRetention: a.yellowRetention,
  blotches: a.blotches ?? 0,
});

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

function deterministicScore(id: string) {
  let hash = 2166136261;
  for (let i = 0; i < id.length; i++) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return 66 + (Math.abs(hash) % 28);
}

function rollBetween(random: RandomFn, min: number, max: number) {
  return clamp(min + random() * (max - min));
}

function rollTrait(random: RandomFn, preferred: boolean) {
  const r = random();
  if (preferred) {
    if (r < 0.25) return 0;
    if (r < 0.55) return rollBetween(random, 1, 10);
    if (r < 0.78) return rollBetween(random, 11, 25);
    if (r < 0.92) return rollBetween(random, 26, 50);
    if (r < 0.98) return rollBetween(random, 51, 75);
    return rollBetween(random, 76, 100);
  }
  if (r < 0.55) return 0;
  if (r < 0.82) return rollBetween(random, 1, 10);
  if (r < 0.94) return rollBetween(random, 11, 25);
  if (r < 0.98) return rollBetween(random, 26, 50);
  if (r < 0.995) return rollBetween(random, 51, 75);
  return rollBetween(random, 76, 100);
}

function rollPhenotypeScore(random: RandomFn) {
  const r = random();
  if (r < 0.6) return rollBetween(random, 65, 82);
  if (r < 0.88) return rollBetween(random, 83, 90);
  if (r < 0.98) return rollBetween(random, 91, 94);
  return rollBetween(random, 95, 100);
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

function localityPurity(a: Snake) {
  if (!isNamedLocality(a.locality)) return 0;
  return Math.round((a.localityAncestry[a.locality] ?? 0) * 10) / 10;
}

function phenotypeLabel(a: Snake) {
  if (
    a.classification !== "Pure" ||
    !isNamedLocality(a.locality) ||
    localityPurity(a) < 99.9
  )
    return null;
  return `${phenotypeGrade(a.phenotypeScore)} ${a.locality} phenotype`;
}

function traitSummary(a: Snake) {
  if (!a.geneticsTested) return "Genetics untested · percentages hidden";
  return `HB ${a.highBlack}% · HW ${a.highWhite}% · Blue ${a.blueStripe}% · Yellow ${a.yellowRetention}% · Blotches ${a.blotches}%`;
}

function normalizeChondroNeonateColor(
  subspecies: Subspecies,
  locality: SnakeLocality,
  requested: "Red" | "Yellow",
) {
  if (locality === "Kofiau") return "Yellow";
  return normalizeNeonateColorFor(CHONDRO_SPECIES_PROFILE, subspecies, requested);
}

function makeSnake(
  id: string,
  name: string,
  sex: Sex,
  source: Source,
  locality: Locality,
  neonateColor: "Red" | "Yellow",
  lifeStage: LifeStage,
  traits: Record<TraitKey, number>,
  phenotypeScore: number,
  geneticsTested = false,
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
    neonateColor: normalizeChondroNeonateColor(subspecies, locality, neonateColor),
    lifeStage,
    highBlack: clamp(traits.highBlack),
    highWhite: clamp(traits.highWhite),
    blueStripe: clamp(traits.blueStripe),
    yellowRetention: clamp(traits.yellowRetention),
    blotches: clamp(traits.blotches),
    geneticsTested,
    phenotypeScore: clamp(phenotypeScore),
    localityAncestry: { [locality]: 100 },
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
  traits: Record<TraitKey, number>,
  structural: Subspecies,
  geneticsTested = false,
): Snake {
  const sa = localitySubspecies[a], sb = localitySubspecies[b];
  return {
    id,
    name,
    sex,
    source: "Captive Bred",
    subspecies: structural,
    locality: "Designer",
    neonateColor,
    lifeStage,
    highBlack: traits.highBlack,
    highWhite: traits.highWhite,
    blueStripe: traits.blueStripe,
    yellowRetention: traits.yellowRetention,
    blotches: traits.blotches,
    geneticsTested,
    phenotypeScore: 0,
    localityAncestry: { [a]: 50, [b]: 50 },
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

function storeForEpoch(epoch: number): StoreSnake[] {
  const random = seeded(epoch * 7919 + 73);
  const offers: StoreSnake[] = [];
  for (let i = 0; i < 10; i++) {
    const isHybrid = i === 8 || (i > 5 && random() < 0.25);
    const source: Source = random() < 0.48 ? "Import" : "Captive Bred";
    const sex: Sex = random() < 0.5 ? "Male" : "Female";
    const neonateColor = randomNeonateColorFor(CHONDRO_SPECIES_PROFILE, random);
    const stages: LifeStage[] = ["Hatchling", "Neonate", "Subadult", "Adult"];
    const lifeStage = stages[Math.floor(random() * stages.length)];
    const a = allLocalities[Math.floor(random() * allLocalities.length)];
    let b = allLocalities[Math.floor(random() * allLocalities.length)];
    while (localitySubspecies[b] === localitySubspecies[a])
      b = allLocalities[Math.floor(random() * allLocalities.length)];
    const sa = localitySubspecies[a], sb = localitySubspecies[b];
    const preferred = (key: TraitKey) =>
      key !== "blotches" &&
      (preferredTraits[sa].includes(key) ||
        (isHybrid && preferredTraits[sb].includes(key)));
    const traits: Record<TraitKey, number> = {
      highBlack: rollTrait(random, preferred("highBlack")),
      highWhite: rollTrait(random, preferred("highWhite")),
      blueStripe: rollTrait(random, preferred("blueStripe")),
      yellowRetention: rollTrait(random, preferred("yellowRetention")),
      blotches: rollTrait(random, false),
    };
    const geneticsTested = random() < 0.18;
    const baseName = isHybrid ? `${a} × ${b}` : a;
    const snake = isHybrid
      ? makeHybrid(
          `STORE-${epoch}-${i}`,
          `${baseName} Hybrid`,
          sex,
          neonateColor,
          lifeStage,
          a,
          b,
          traits,
          random() < 0.5 ? sa : sb,
          geneticsTested,
        )
      : makeSnake(
          `STORE-${epoch}-${i}`,
          `${baseName} ${source === "Import" ? "Import" : "CB"}`,
          sex,
          source,
          a,
          neonateColor,
          lifeStage,
          traits,
          rollPhenotypeScore(random),
          geneticsTested,
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
    const visibleTraitPremium = geneticsTested
      ? (traits.highBlack + traits.highWhite + traits.blueStripe + traits.yellowRetention + traits.blotches) * 10
      : 0;
    const phenotypePremium = phenotypeLabel(snake)
      ? Math.max(0, snake.phenotypeScore - 70) * 42
      : 0;
    const price =
      Math.round(
        (((snake.source === "Import" ? 900 : 2050) +
          (isHybrid ? 750 : 0) +
          (snake.neonateColor === "Red" ? 600 : 0) +
          (pretested ? 425 : 0) +
          (geneticsTested ? 350 : 0) +
          visibleTraitPremium +
          phenotypePremium) *
          stageMultiplier) /
          25,
      ) * 25;
    offers.push({ ...snake, price, pretested });
  }
  return offers;
}

function combineAncestry(a: Snake, b: Snake) {
  const out: Partial<Record<Subspecies, number>> = {};
  const keys = Object.keys({ ...a.ancestry, ...b.ancestry }) as Subspecies[];
  for (const key of keys)
    out[key] = Math.round((((a.ancestry[key] ?? 0) + (b.ancestry[key] ?? 0)) / 2) * 10) / 10;
  return out;
}

function combineLocalityAncestry(a: Snake, b: Snake) {
  const out: Partial<Record<Locality, number>> = {};
  const keys = Object.keys({ ...a.localityAncestry, ...b.localityAncestry }) as Locality[];
  for (const key of keys)
    out[key] = Math.round((((a.localityAncestry[key] ?? 0) + (b.localityAncestry[key] ?? 0)) / 2) * 10) / 10;
  return out;
}

function classifyPair(a: Snake, b: Snake): Classification {
  if (a.classification === "Designer" || b.classification === "Designer") return "Designer";
  if (a.classification === "Hybrid" || b.classification === "Hybrid") return "Hybrid";
  return a.subspecies === b.subspecies ? "Pure" : "Hybrid";
}

function inheritPhenotypeScore(dam: Snake, sire: Snake, sameLocality: boolean) {
  if (!sameLocality) return 0;
  const midpoint = (dam.phenotypeScore + sire.phenotypeScore) / 2;
  const ordinary = midpoint + (Math.random() + Math.random() - 1) * 7;
  const breakthrough = Math.random() < 0.025 ? 4 + Math.random() * 8 : 0;
  return clamp(ordinary + breakthrough);
}

function makeOffspring(
  dam: Snake,
  sire: Snake,
  clutchId: string,
  index: number,
  breederInitials: string,
): Snake {
  const classification = classifyPair(dam, sire);
  const structural = pick(dam, sire);
  const pureSame = classification === "Pure" && dam.subspecies === sire.subspecies;
  const sameLocality =
    pureSame &&
    isNamedLocality(dam.locality) &&
    isNamedLocality(sire.locality) &&
    dam.locality === sire.locality &&
    localityPurity(dam) >= 99.9 &&
    localityPurity(sire) >= 99.9;
  const locality: SnakeLocality = sameLocality
    ? dam.locality
    : classification === "Designer"
      ? "Designer"
      : "Mixed Locality";
  const subspecies = pureSame ? dam.subspecies : structural.subspecies;
  const inheritedTraits = inheritTraitSet(dam, sire);
  return {
    id: `${breederInitials}-${clutchId}-${String(index + 1).padStart(2, "0")}`,
    name: `Hatchling ${index + 1}`,
    sex: Math.random() < 0.5 ? "Male" : "Female",
    source: "Captive Bred",
    subspecies,
    locality,
    neonateColor: pureSame
      ? normalizeChondroNeonateColor(
          subspecies,
          sameLocality ? dam.locality : "Mixed Locality",
          pick(dam.neonateColor, sire.neonateColor),
        )
      : pick(dam.neonateColor, sire.neonateColor),
    lifeStage: "Hatchling",
    highBlack: inheritedTraits.highBlack,
    highWhite: inheritedTraits.highWhite,
    blueStripe: inheritedTraits.blueStripe,
    yellowRetention: inheritedTraits.yellowRetention,
    blotches: inheritedTraits.blotches,
    geneticsTested: false,
    phenotypeScore: inheritPhenotypeScore(dam, sire, sameLocality),
    localityAncestry: combineLocalityAncestry(dam, sire),
    body: pick(dam.body, sire.body),
    tail: pick(dam.tail, sire.tail),
    eyes: pick(dam.eyes, sire.eyes),
    head: pick(dam.head, sire.head),
    pattern: sameLocality ? dam.locality : pick(dam.pattern, sire.pattern),
    color: sameLocality ? dam.locality : pick(dam.color, sire.color),
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

function createClutch(dam: Snake, sire: Snake, breederInitials: string): Clutch {
  const id = `CL-${Date.now().toString(36).toUpperCase()}`;
  const size = clutchSizeForPairing(dam, sire);
  return {
    id,
    dam,
    sire,
    offspring: Array.from({ length: size }, (_, i) =>
      makeOffspring(dam, sire, id, i, breederInitials),
    ),
  };
}

/**
 * A wild-caught gravid female was already bred in the canopy — the sire is
 * some unknown wild male. He never joins the colony; he exists only inside
 * the clutch record so the clutch follows the exact same path as any other.
 * Mirroring the dam's taxonomy guarantees pure locality/subspecies babies.
 */
function makeWildSire(dam: Snake): Snake {
  return {
    ...dam,
    id: `wild-sire-${dam.id}`,
    name: `Wild ${dam.locality} sire`,
    sex: "Male",
    parentIds: [],
    notes: "Unknown wild male — sire of a wild-laid clutch.",
    gravid: false,
    gravidLaysAt: undefined,
  };
}

function saleValue(a: Snake, season: number) {
  const traits = [a.highBlack, a.highWhite, a.blueStripe, a.yellowRetention, a.blotches ?? 0];
  const strongest = Math.max(...traits);
  const avg = traits.reduce((s, v) => s + v, 0) / traits.length;
  const traitPremium = a.geneticsTested ? avg * 12 + strongest * 18 : avg * 3 + strongest * 5;
  let value = 300 + traitPremium;
  const label = phenotypeLabel(a);
  if (label) {
    const grade = phenotypeGrade(a.phenotypeScore);
    if (grade === "A+") value *= 1.5;
    else if (grade === "A") value *= 1.3;
    else if (grade === "A-") value *= 1.18;
    else if (grade === "B+") value *= 1.08;
  }
  if (a.neonateColor === "Red") value *= 1.18;
  if (a.classification === "Hybrid") value *= 1.08;
  if (a.classification === "Designer") value *= 1.16;
  if (a.lifeStage === "Adult") value *= 1.35;
  if (a.lifeStage === "Subadult") value *= 1.16;
  if (a.nidoStatus === "Negative") value *= 1.08;
  if (a.nidoStatus === "Unknown") value *= 0.9;
  if (a.condition === "Fair") value *= 0.82;
  value *= marketMultiplierForAnimal(marketDemandForSeason(season), a);
  return Math.max(250, Math.round(value / 25) * 25);
}

function agingRequirement(a: Snake) {
  const requirement = growthRequirementFor(CHONDRO_SPECIES_PROFILE, a.lifeStage, a.sex);
  return requirement
    ? { next: requirement.next as LifeStage, mice: requirement.feederUnits, months: requirement.months }
    : null;
}
function agingCost(a: Snake) {
  return growthCostFor(CHONDRO_SPECIES_PROFILE, a.lifeStage, a.sex);
}

function isGameSave(value: unknown): value is GameSave {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const save = value as Partial<GameSave>;
  return Array.isArray(save.colony) && typeof save.cash === "number" && save.enclosures != null;
}

function normalizeSnake(raw: Snake): Snake {
  const locality = raw.locality as SnakeLocality;
  const named = isNamedLocality(locality);
  const subspecies = raw.subspecies ?? (named ? localitySubspecies[locality] : "Morelia viridis");
  const legacyLocalityAncestry = named && raw.classification === "Pure" ? { [locality]: 100 } : {};
  return {
    ...raw,
    subspecies,
    locality,
    neonateColor: raw.classification === "Pure"
      ? normalizeChondroNeonateColor(subspecies, locality, raw.neonateColor)
      : raw.neonateColor,
    highBlack: Number(raw.highBlack ?? 0),
    highWhite: Number(raw.highWhite ?? 0),
    blueStripe: Number(raw.blueStripe ?? 0),
    yellowRetention: Number(raw.yellowRetention ?? 0),
    blotches: Number(raw.blotches ?? 0),
    geneticsTested: typeof raw.geneticsTested === "boolean" ? raw.geneticsTested : false,
    phenotypeScore:
      typeof raw.phenotypeScore === "number" && raw.phenotypeScore > 0
        ? clamp(raw.phenotypeScore)
        : named && raw.classification === "Pure"
          ? deterministicScore(raw.id)
          : 0,
    localityAncestry:
      raw.localityAncestry && typeof raw.localityAncestry === "object"
        ? raw.localityAncestry
        : legacyLocalityAncestry,
    ancestry: raw.ancestry ?? { [subspecies]: 100 },
    parentIds: Array.isArray(raw.parentIds) ? raw.parentIds : [],
    notes: typeof raw.notes === "string" ? raw.notes : "",
    breederInitials: typeof raw.breederInitials === "string" ? raw.breederInitials : null,
  };
}

function TraitGrid({ animal }: { animal: Snake }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
      {traitRows.map(([label, key]) => (
        <div key={key} className="rounded-2xl border border-white/[.06] p-3">
          <div className="text-[9px] uppercase tracking-[.1em] text-white/23">{label}</div>
          <div className="mt-2 text-lg font-semibold text-white/62">
            {animal.geneticsTested ? `${animal[key] ?? 0}%` : "?"}
          </div>
        </div>
      ))}
    </div>
  );
}

function PhenotypeBadge({ animal }: { animal: Snake }) {
  const label = phenotypeLabel(animal);
  if (!label) return null;
  return (
    <span className="rounded-full border border-amber-200/15 bg-amber-200/[.04] px-3 py-1 text-[10px] font-bold text-amber-100/70">
      {label}
    </span>
  );
}

type BreederGameScreen = "all" | "breeding" | "colony" | "clutches" | "market";

const BreederGameScreenContext = createContext<BreederGameScreen>("all");

function sectionScreen(label: string): BreederGameScreen | "shared" {
  const value = label.toLowerCase();
  if (value.includes("daily snake store") || value.includes("player market") || value.includes("market")) return "market";
  if (value.includes("active clutch") || value.includes("clutch") || value.includes("program records")) return "clutches";
  if (value.includes("breeding room") || value.includes("pairing")) return "breeding";
  if (value.includes("your colony") || value.includes("enclosures") || value.includes("genetics & locality")) return "colony";
  return "shared";
}

function hideLegacySectionForFocusedScreen(activeScreen: BreederGameScreen, label: string) {
  const value = label.toLowerCase();
  if (activeScreen !== "all" && value.includes("activity")) return true;
  if (activeScreen === "colony" && (value.includes("your colony") || value.includes("genetics & locality"))) return true;
  if (activeScreen === "clutches" && (value.includes("program records") || value.includes("active clutch"))) return true;
  if (activeScreen === "market" && (value.includes("daily snake store") || value.includes("player snake market"))) return true;
  return false;
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
  const activeScreen = useContext(BreederGameScreenContext);
  const targetScreen = sectionScreen(label);
  if (activeScreen !== "all" && targetScreen !== "shared" && targetScreen !== activeScreen) return null;
  if (hideLegacySectionForFocusedScreen(activeScreen, label)) return null;
  return (
    <details
      open={isOpen}
      onToggle={(event) => setIsOpen(event.currentTarget.open)}
      className="group mt-5"
    >
      <summary className="panel flex cursor-pointer list-none items-center justify-between gap-4 rounded-2xl px-5 py-4 transition hover:border-emerald-300/15 [&::-webkit-details-marker]:hidden">
        <div>
          <div className="text-sm font-bold text-white/75">{label}</div>
          {detail ? <div className="mt-1 text-[10px] text-white/30">{detail}</div> : null}
        </div>
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-white/[.08] text-lg text-white/45 transition group-open:rotate-45">+</span>
      </summary>
      <div className="mt-3">{children}</div>
    </details>
  );
}

/* One node in the lineage tree — tap to re-root the tree on that animal. */
function LineageNode({
  animal,
  highlight,
  onPick,
}: {
  animal: Snake;
  highlight?: boolean;
  onPick: (id: string) => void;
}) {
  return (
    <button
      onClick={() => onPick(animal.id)}
      className={`min-w-[118px] max-w-[150px] rounded-xl border p-2.5 text-left transition active:scale-95 ${
        highlight
          ? "border-amber-200/60 bg-amber-200/[.08] shadow-[0_0_24px_rgba(251,191,36,.25)]"
          : "border-white/[.08] bg-white/[.03] hover:border-white/20"
      }`}
    >
      <div className="truncate text-[13px] font-bold text-white/90">{animal.name || "Unnamed"}</div>
      <div className="mt-0.5 text-[10px] text-white/40">
        {animal.sex === "Female" ? "♀" : "♂"} · {animal.locality} · Gen {animal.generation}
      </div>
    </button>
  );
}

export function ChondroBreederGameV3({ screen = "all" }: { screen?: BreederGameScreen } = {}) {
  const [resetMenuOpen, setResetMenuOpen] = useState(false);
  const [resetArmed, setResetArmed] = useState(false);
  const [resetConfirmText, setResetConfirmText] = useState("");
  const [started, setStarted] = useState(false);
  const [cash, setCash] = useState(STARTING_CASH);
  const [colony, setColony] = useState<Snake[]>([]);
  const [tested, setTested] = useState<string[]>([]);
  const [damId, setDamId] = useState("");
  const [sireId, setSireId] = useState("");
  const [clutch, setClutch] = useState<Clutch | null>(null);
  const [clutchHistory, setClutchHistory] = useState<ClutchRecord[]>([]);
  const [holdbacks, setHoldbacks] = useState<string[]>([]);
  const [season, setSeason] = useState(1);
  const [sales, setSales] = useState<Sale[]>([]);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [enclosures, setEnclosures] = useState<Record<EnclosureType, number>>({
    "Chondro Dojo Bin": 0,
    "PVC Arboreal": 0,
  });
  const [purchasedStoreIds, setPurchasedStoreIds] = useState<string[]>([]);
  const [careerReputation, setCareerReputation] = useState(0);
  const [facilityRooms, setFacilityRooms] = useState<FacilityRoomState>({ "starter-room": 1 });
  const [facilityConstruction, setFacilityConstruction] = useState<FacilityConstruction | null>(null);
  const [breedingCycle, setBreedingCycle] = useState<BreedingCycle | null>(null);
  const [geneticTestsPending, setGeneticTestsPending] = useState<GeneticTestJob[]>([]);
  const [femaleRecovery, setFemaleRecovery] = useState<Record<string, number>>({});
  const [seasonCarePaid, setSeasonCarePaid] = useState(0);
  const [cinematicSeen, setCinematicSeen] = useState(false);
  const [replayingIntro, setReplayingIntro] = useState(false);
  // Two-tap season-care confirmation: the first tap arms the button and shows
  // the computed total, the second tap pays. Guards against an accidental tap
  // spending a large season total.
  const [seasonCareArmed, setSeasonCareArmed] = useState(false);
  const seasonCareArmTimer = useRef<number | null>(null);

  // Canopy Hunter expedition (in-game event): one free expedition per player
  // per week; extra trips inside the week cost game cash. Cadence note: the
  // entry model lives in src/lib/canopy-hunter.ts — tune the fee
  // (EXPEDITION_ENTRY_FEE) and the free interval
  // (EXPEDITION_FREE_COOLDOWN_MS) there. expeditionNextAt is persisted on the
  // save; expeditionOpen tracks the modal; expeditionEntered tracks whether
  // the player has paid/claimed entry for the current opening.
  const [expeditionOpen, setExpeditionOpen] = useState(false);
  const [expeditionEntered, setExpeditionEntered] = useState(false);
  const [expeditionNextAt, setExpeditionNextAt] = useState(0);
  /** Grove recovery: region id → timestamp when it can be hunted again. */
  const [regionRecovery, setRegionRecovery] = useState<Record<string, number>>({});
  /** Permit flow: chosen subspecies, two-tap arm, and the active permit night. */
  const [permitSubspecies, setPermitSubspecies] = useState<CanopySubspecies | null>(null);
  const [permitArmed, setPermitArmed] = useState(false);
  const [permitActive, setPermitActive] = useState(false);
  const [expeditionFeeArmed, setExpeditionFeeArmed] = useState(false);
  const expeditionFeeArmTimer = useRef<number | null>(null);
  /** Pay for expeditions/permits with arcade tokens instead of cash. */
  const [payWithTokens, setPayWithTokens] = useState(false);
  const [tokenBal, setTokenBal] = useState(() => getTokenBalance());
  const refreshTokens = () => setTokenBal(getTokenBalance());
  useEffect(() => {
    window.addEventListener("arcade-balance", refreshTokens);
    window.addEventListener("focus", refreshTokens);
    return () => {
      window.removeEventListener("arcade-balance", refreshTokens);
      window.removeEventListener("focus", refreshTokens);
    };
  }, []);
  const [expeditionResult, setExpeditionResult] = useState<string | null>(null);
  // Founder/testing exemption: unlimited free expeditions. Checked
  // server-side via /api/canopy-hunter/status so it follows the account,
  // not the device. A failed lookup simply keeps the standard entry model.
  const [expeditionUnlimited, setExpeditionUnlimited] = useState(false);
  // River Port Stop private playtest gate, same server-side pattern.
  const [portStopEnabled, setPortStopEnabled] = useState(false);
  // Founder/testing allowlist: unlimited snake housing spaces, same
  // server-side pattern (also enforced in the save API).
  const [unlimitedSpaces, setUnlimitedSpaces] = useState(false);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/canopy-hunter/status", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled) return;
        if (data?.unlimited === true) setExpeditionUnlimited(true);
        if (data?.portDev === true) setPortStopEnabled(true);
        if (data?.unlimitedSpaces === true) setUnlimitedSpaces(true);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  // The imported colony records from the latest expedition, so the haul
  // banner can show the exact same Keeper art the receipt showed.
  const [lastExpeditionImports, setLastExpeditionImports] = useState<Snake[]>([]);
  // The rolled destination region and whether its flight intro has played.
  // The flight video (matched to the region's signature subspecies) plays
  // full-screen after entry, before the canopy search begins.
  const [expeditionRegion, setExpeditionRegion] = useState<CanopyRegion | null>(null);
  const [expeditionFlightDone, setExpeditionFlightDone] = useState(false);
  useEffect(() => () => {
    if (seasonCareArmTimer.current !== null) window.clearTimeout(seasonCareArmTimer.current);
    if (expeditionFeeArmTimer.current !== null) window.clearTimeout(expeditionFeeArmTimer.current);
  }, []);
  const [breedingMessage, setBreedingMessage] = useState("");
  const [clutchEstablished, setClutchEstablished] = useState(false);
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
  const [collapsedAnimalIds, setCollapsedAnimalIds] = useState<string[]>([]);
  const [playerMarket, setPlayerMarket] = useState<PlayerMarketListing[]>([]);
  const [marketStatus, setMarketStatus] = useState("");
  const [marketBusy, setMarketBusy] = useState<string | null>(null);
  const [breederInitials, setBreederInitials] = useState<string | null>(null);
  const [breederIdentityLoaded, setBreederIdentityLoaded] = useState(false);
  const [initialsInput, setInitialsInput] = useState("");
  const [initialsPrompt, setInitialsPrompt] = useState(false);
  const [initialsStatus, setInitialsStatus] = useState("");
  const [selectedSnakeId, setSelectedSnakeId] = useState<string | null>(null);
  const [lineageRootId, setLineageRootId] = useState<string | null>(null);
  const [storeIndex, setStoreIndex] = useState(0);
  const [hydrated, setHydrated] = useState(false);
  const [cloudSave, setCloudSave] = useState(false);
  const [now, setNow] = useState(Date.now());
  const latestSaveRef = useRef<GameSave | null>(null);
  const cloudSaveRef = useRef(false);
  // Timestamp of the most recent save this component wrote itself. External
  // writers (e.g. the standalone store) dispatch the same save-change event,
  // so this guards the adoption listener below against echoing our own writes.
  const lastSelfWriteAt = useRef(0);

  // Apply a loaded save object to component state. Shared by the initial load
  // and by the listener that adopts saves written by other components.
  const applySave = useCallback((chosen: GameSave) => {
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
    setEnclosures(chosen.enclosures ?? { "Chondro Dojo Bin": 0, "PVC Arboreal": 0 });
    setPurchasedStoreIds(chosen.purchasedStoreIds ?? []);
    setCareerReputation(Number(chosen.careerReputation ?? 0));
    setFacilityRooms(chosen.facilityRooms ?? { "starter-room": 1 });
    setFacilityConstruction(chosen.facilityConstruction ?? null);
    const savedCycle = chosen.breedingCycle ?? null;
    if (savedCycle) {
      const legacyStage = String(savedCycle.stage);
      const migratedStage: BreedingStage =
        legacyStage === "cycling" || legacyStage === "pairing" || legacyStage === "incubation"
          ? legacyStage as BreedingStage
          : legacyStage === "hatch-day"
            ? "incubation"
            : "development";
      setBreedingCycle({ ...savedCycle, stage: migratedStage });
    } else {
      setBreedingCycle(null);
    }
    setGeneticTestsPending(chosen.geneticTestsPending ?? []);
    setFemaleRecovery(chosen.femaleRecovery ?? {});
    setSeasonCarePaid(Number(chosen.seasonCarePaid ?? 0));
    setBreedingMessage(chosen.breedingMessage ?? "");
    // Grandfather already-hatched clutches from older saves so players do not lose progress.
    setClutchEstablished(chosen.clutchEstablished ?? Boolean(chosen.clutch));
    // The cinematic flag is player-scoped: the save value wins, otherwise fall
    // back to the local mirror (e.g. seen while signed out, now signed in).
    setCinematicSeen(Boolean(chosen.cinematicSeen) || readCinematicSeenMirror());
    // Canopy Hunter expedition cadence. Older saves predate the field, so a
    // missing value means "free expedition available now".
    setExpeditionNextAt(typeof chosen.expeditionNextAt === "number" ? chosen.expeditionNextAt : 0);
    setRegionRecovery(
      chosen.regionRecovery && typeof chosen.regionRecovery === "object" ? chosen.regionRecovery : {},
    );
  }, []);

  const storeEpoch = Math.floor(now / DAY_MS);
  const store = useMemo(() => storeForEpoch(storeEpoch), [storeEpoch]);
  const nextRefresh = (storeEpoch + 1) * DAY_MS;
  const installedEnclosureCount = enclosureFootprint(enclosures);
  const physicalRoomCapacity = roomCapacityFromSave({ facilityRooms });
  const capacity = unlimitedSpaces ? Number.POSITIVE_INFINITY : animalHousingCapacity(enclosures);
  const openSlots = Math.max(0, capacity - colony.length);
  const roomEnclosureSlots = Math.max(0, physicalRoomCapacity - installedEnclosureCount);
  const females = colony.filter((a) => a.sex === "Female" && a.lifeStage === "Adult" && Number(femaleRecovery[a.id] ?? 0) <= season);
  const males = colony.filter((a) => a.sex === "Male" && a.lifeStage === "Adult");
  const geneticsUnlocked = geneticTestingUnlocked({ careerReputation, facilityRooms });
  const adultCount = colony.filter((a) => a.lifeStage === "Adult").length;
  const seasonCareCost = Math.max(SEASON_CARE_PER_ADULT, adultCount * SEASON_CARE_PER_ADULT);
  const dam = colony.find((a) => a.id === damId) ?? null;
  const sire = colony.find((a) => a.id === sireId) ?? null;
  const gravidFemales = colony.filter((a) => a.gravid);
  const saleIncome = sales.reduce((sum, item) => sum + item.value, 0);
  const clutchEstablishmentCost = clutch ? CLUTCH_ESTABLISH_BASE_COST + clutch.offspring.length * CLUTCH_ESTABLISH_PER_HATCHLING : 0;

  const knownSnakes = useMemo(() => {
    const records = new Map<string, Snake>();
    for (const animal of colony) records.set(animal.id, animal);
    for (const record of clutchHistory) {
      records.set(record.dam.id, record.dam);
      records.set(record.sire.id, record.sire);
      for (const baby of record.offspring) if (!records.has(baby.id)) records.set(baby.id, baby);
    }
    return records;
  }, [colony, clutchHistory]);
  const selectedAnimal = selectedSnakeId ? knownSnakes.get(selectedSnakeId) ?? null : null;
  const selectedParents =
    selectedAnimal?.parentIds
      .map((id) => knownSnakes.get(id))
      .filter((animal): animal is Snake => !!animal) ?? [];
  const selectedOffspring = selectedAnimal
    ? [...knownSnakes.values()].filter((animal) => animal.parentIds.includes(selectedAnimal.id))
    : [];

  /* Lineage tree for the modal: two generations up, the root, two down. */
  const lineageTree = useMemo(() => {
    if (!lineageRootId) return null;
    const root = knownSnakes.get(lineageRootId);
    if (!root) return null;
    const get = (id: string) => knownSnakes.get(id);
    const parents = root.parentIds.map(get).filter((a): a is Snake => !!a);
    const seenUp = new Set<string>();
    const grandparents = parents
      .flatMap((p) => p.parentIds.map(get).filter((a): a is Snake => !!a))
      .filter((a) => {
        if (seenUp.has(a.id)) return false;
        seenUp.add(a.id);
        return true;
      });
    const children = [...knownSnakes.values()].filter((a) => a.parentIds.includes(lineageRootId));
    const seenDown = new Set<string>();
    const grandchildren = children
      .flatMap((c) => [...knownSnakes.values()].filter((a) => a.parentIds.includes(c.id)))
      .filter((a) => {
        if (a.id === lineageRootId || seenDown.has(a.id)) return false;
        seenDown.add(a.id);
        return true;
      });
    const mateGroups: { mate: Snake | null; babies: Snake[] }[] = [];
    for (const baby of children) {
      const mateId = baby.parentIds.find((id) => id !== lineageRootId);
      const mate = mateId ? get(mateId) ?? null : null;
      let group = mateGroups.find((g) => (g.mate?.id ?? null) === (mate?.id ?? null));
      if (!group) {
        group = { mate, babies: [] };
        mateGroups.push(group);
      }
      group.babies.push(baby);
    }
    return { root, parents, grandparents, mateGroups, grandchildren };
  }, [lineageRootId, knownSnakes]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      let local: GameSave | null = null;
      try {
        const raw = window.localStorage.getItem(LOCAL_SAVE_KEY);
        const parsed: unknown = raw ? JSON.parse(raw) : null;
        if (isGameSave(parsed)) local = parsed;
      } catch {}
      let chosen = local;
      try {
        const response = await fetch("/api/hatchery/chondro-breeder/save", { cache: "no-store" });
        if (response.ok) {
          const data = await response.json();
          if (data.authenticated) setCloudSave(true);
          if (isGameSave(data.save?.state)) {
            const cloud = data.save.state;
            const localUpdatedAt = Number(local?.updatedAt ?? 0);
            const cloudUpdatedAt = Number(cloud.updatedAt ?? 0);
            if (!local || cloudUpdatedAt >= localUpdatedAt) chosen = cloud;
          }
        }
      } catch {}
      if (!cancelled && chosen) applySave(chosen);
      if (!cancelled) setHydrated(true);
    }
    void load();
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [applySave]);

  useEffect(() => {
    cloudSaveRef.current = cloudSave;
  }, [cloudSave]);

  useEffect(() => {
    if (!selectedSnakeId && !initialsPrompt && !expeditionOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      // Order mirrors the visual stack: initials prompt on top, then the
      // expedition modal, then the animal record. Inline setState calls keep
      // this effect dependency-clean (setters are stable).
      if (initialsPrompt) setInitialsPrompt(false);
      else if (expeditionOpen) {
        setExpeditionOpen(false);
        setExpeditionEntered(false);
        setExpeditionFeeArmed(false);
        setExpeditionRegion(null);
        setExpeditionFlightDone(false);
      } else setSelectedSnakeId(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedSnakeId, initialsPrompt, expeditionOpen]);

  // Opens the Canopy Hunter expedition modal from outside the game component
  // (e.g. the Home quick action). A one-shot module flag covers the case where
  // the game was not mounted when the request fired (Home navigates to a core
  // view first); the CustomEvent covers the already-mounted case. Intent is
  // consumed after hydration so the entry gate reads loaded capacity rather
  // than empty defaults.
  useEffect(() => {
    function showExpedition() {
      setExpeditionOpen(true);
      setExpeditionEntered(false);
      setExpeditionFeeArmed(false);
      setExpeditionRegion(null);
      setExpeditionFlightDone(false);
      setExpeditionResult(null);
    }
    if (hydrated && consumeExpeditionOpenRequest()) showExpedition();
    function handleExpeditionAction(event: Event) {
      const detail = (event as CustomEvent<{ action?: string }>).detail ?? {};
      if (detail.action === "open-expedition") showExpedition();
    }
    window.addEventListener("arboreal-chondro-expedition-action", handleExpeditionAction);
    return () => window.removeEventListener("arboreal-chondro-expedition-action", handleExpeditionAction);
  }, [hydrated]);

  // While the expedition modal is open, keep the app's bottom navigation
  // hidden — an accidental tap down there used to navigate away mid-run.
  useEffect(() => {
    try {
      window.dispatchEvent(new CustomEvent("canopy-hunter-modal", { detail: { open: expeditionOpen } }));
    } catch {}
    return () => {
      try {
        window.dispatchEvent(new CustomEvent("canopy-hunter-modal", { detail: { open: false } }));
      } catch {}
    };
  }, [expeditionOpen]);

  useEffect(() => {
    if (!hydrated) return;
    const updatedAt = Date.now();
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
      careerReputation,
      facilityRooms,
      facilityConstruction,
      breedingCycle,
      geneticTestsPending,
      femaleRecovery,
      seasonCarePaid,
      breedingMessage,
      clutchEstablished,
      cinematicSeen,
      expeditionNextAt,
      regionRecovery,
      updatedAt,
    };
    latestSaveRef.current = save;
    lastSelfWriteAt.current = updatedAt;
    if (cinematicSeen) writeCinematicSeenMirror();
    try {
      window.localStorage.setItem(LOCAL_SAVE_KEY, JSON.stringify(save));
      window.dispatchEvent(new Event("arboreal-chondro-breeder-save-change"));
    } catch {}
    if (!cloudSave) return;
    const timer = window.setTimeout(() => {
      void fetch("/api/hatchery/chondro-breeder/save", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(save),
      }).catch(() => undefined);
    }, 650);
    return () => window.clearTimeout(timer);
  }, [hydrated, cloudSave, started, cash, colony, tested, damId, sireId, clutch, clutchHistory, holdbacks, season, sales, transfers, enclosures, purchasedStoreIds, careerReputation, facilityRooms, facilityConstruction, breedingCycle, geneticTestsPending, femaleRecovery, seasonCarePaid, breedingMessage, clutchEstablished, cinematicSeen, expeditionNextAt, regionRecovery]);

  useEffect(() => {
    const flushLatestSave = () => {
      const save = latestSaveRef.current;
      if (!save) return;
      try {
        window.localStorage.setItem(LOCAL_SAVE_KEY, JSON.stringify(save));
      } catch {}
      if (cloudSaveRef.current) {
        void fetch("/api/hatchery/chondro-breeder/save", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(save),
          keepalive: true,
        }).catch(() => undefined);
      }
    };
    window.addEventListener("pagehide", flushLatestSave);
    return () => {
      window.removeEventListener("pagehide", flushLatestSave);
      flushLatestSave();
    };
  }, [hydrated, applySave]);

  // Adopt saves written by other parts of the app (standalone store,
  // pairing planner, shows panel, etc.) so the core game reflects purchases
  // without a reload. Own writes are echoed through the same event, so they
  // are ignored via lastSelfWriteAt.
  useEffect(() => {
    if (!hydrated) return;
    const adoptExternalSave = () => {
      let parsed: unknown = null;
      try {
        const raw = window.localStorage.getItem(LOCAL_SAVE_KEY);
        parsed = raw ? JSON.parse(raw) : null;
      } catch {
        return;
      }
      if (!isGameSave(parsed)) return;
      if (Number(parsed.updatedAt ?? 0) <= lastSelfWriteAt.current) return;
      applySave(parsed);
    };
    window.addEventListener("arboreal-chondro-breeder-save-change", adoptExternalSave);
    return () => window.removeEventListener("arboreal-chondro-breeder-save-change", adoptExternalSave);
  }, [hydrated, applySave]);

  useEffect(() => {
    if (!hydrated) return;
    let cancelled = false;
    async function loadMarket() {
      try {
        const response = await fetch("/api/hatchery/chondro-breeder/player-market", { cache: "no-store" });
        const data = await response.json();
        if (!cancelled) {
          setPlayerMarket(
            (data.listings ?? []).map((listing: PlayerMarketListing) => ({
              ...listing,
              snake: normalizeSnake(listing.snake),
            })),
          );
          if (response.status === 401) setMarketStatus("Sign in to buy or sell snakes with other players.");
        }
      } catch {
        if (!cancelled) setMarketStatus("The player market is temporarily unavailable.");
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
        const response = await fetch("/api/hatchery/chondro-breeder/breeder-identity", { cache: "no-store" });
        const data = await response.json();
        if (!cancelled && response.ok) setBreederInitials(data.initials ?? null);
      } catch {} finally {
        if (!cancelled) setBreederIdentityLoaded(true);
      }
    }
    void loadBreederIdentity();
    return () => {
      cancelled = true;
    };
  }, [hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    let cancelled = false;
    async function loadFavorites() {
      try {
        const response = await fetch("/api/hatchery/chondro-breeder/favorites", { cache: "no-store" });
        const data = await response.json();
        if (!cancelled && response.ok && Array.isArray(data.favoriteIds)) setFavoriteIds(data.favoriteIds.map((item: unknown) => String(item)));
      } catch {}
    }
    void loadFavorites();
    return () => { cancelled = true; };
  }, [hydrated]);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!hydrated) return;
    if (facilityConstruction && facilityConstruction.completesAt <= now) {
      const room = ROOM_EXPANSIONS.find((item) => item.id === facilityConstruction.roomId);
      if (room) {
        setFacilityRooms((current) => ({ ...current, [room.id]: Number(current[room.id] ?? 0) + 1 }));
        setBreedingMessage(`${room.name} is ready.`);
      }
      setFacilityConstruction(null);
      return;
    }
    const readyTests = geneticTestsPending.filter((job) => job.completesAt <= now);
    if (readyTests.length) {
      const readyIds = new Set(readyTests.map((job) => job.snakeId));
      setColony((current) => current.map((animal) => readyIds.has(animal.id) ? { ...animal, geneticsTested: true } : animal));
      setGeneticTestsPending((current) => current.filter((job) => !readyIds.has(job.snakeId)));
      setBreedingMessage(`${readyTests.length} genetic test${readyTests.length === 1 ? " is" : "s are"} ready.`);
      return;
    }
    // A wild-caught gravid female lays her clutch once her timer runs out.
    // She waits if another clutch still needs establishing or a breeding
    // cycle is running — this effect retries on the next tick.
    const readyLayer = colony.find(
      (animal) => animal.gravid && typeof animal.gravidLaysAt === "number" && animal.gravidLaysAt <= now,
    );
    if (readyLayer && !clutch && !breedingCycle) {
      if (!breederIdentityLoaded) return;
      if (!breederInitials) {
        setInitialsPrompt(true);
        setBreedingMessage("Choose breeder initials before the wild clutch can be recorded. Her eggs are being held safely until initials are confirmed.");
        return;
      }
      const wildSire = makeWildSire(readyLayer);
      setColony((current) =>
        current.map((animal) =>
          animal.id === readyLayer.id ? { ...animal, gravid: false, gravidLaysAt: undefined } : animal,
        ),
      );
      setClutch(createClutch(readyLayer, wildSire, breederInitials));
      setClutchEstablished(false);
      setHoldbacks([]);
      setBreedingMessage(`${readyLayer.name} laid her clutch — pure ${readyLayer.locality} babies, sired wild in the canopy. The clutch hatched and now needs to be established.`);
      return;
    }
    if (!breedingCycle || breedingCycle.completesAt > now) return;
    const cycleDam = colony.find((animal) => animal.id === breedingCycle.damId);
    const cycleSire = colony.find((animal) => animal.id === breedingCycle.sireId);
    if (!cycleDam || !cycleSire) {
      setBreedingCycle(null);
      setBreedingMessage("Breeding cycle cancelled because one selected animal is no longer in the colony.");
      return;
    }
    if (breedingCycle.stage === "pairing") {
      if (Math.random() > pairingChance(cycleDam, cycleSire)) {
        const pairingStage = BREEDING_STAGES.find((stage) => stage.id === "pairing");
        const retryHours = pairingStage?.hours ?? 8;
        setBreedingCycle({ ...breedingCycle, stage: "pairing", completesAt: Date.now() + retryHours * 3_600_000 });
        setBreedingMessage(`${pairingFailureReason(cycleDam, cycleSire)} The pair remains in the breeding window at cycling temperatures; another pairing attempt has started without re-cycling.`);
        return;
      }
      const positiveIds = [cycleDam, cycleSire].filter((animal) => animal.nidoStatus === "Positive").filter(() => Math.random() < 0.60).map((animal) => animal.id);
      if (positiveIds.length) {
        const names = colony.filter((animal) => positiveIds.includes(animal.id)).map((animal) => animal.name);
        setColony((current) => current.filter((animal) => !positiveIds.includes(animal.id)));
        if (positiveIds.includes(damId)) setDamId("");
        if (positiveIds.includes(sireId)) setSireId("");
        setBreedingCycle(null);
        setBreedingMessage(`${names.join(" and ")} ${names.length === 1 ? "was" : "were"} lost following the high-risk Nido-positive breeding attempt.`);
        return;
      }
      if (cycleDam.nidoStatus === "Positive" && cycleSire.nidoStatus !== "Positive" && Math.random() < 0.40) {
        setColony((current) => current.map((animal) => animal.id === cycleSire.id ? { ...animal, nidoStatus: "Positive" } : animal));
        setBreedingMessage(`${cycleSire.name} became Nido Positive after exposure during breeding.`);
      } else if (cycleSire.nidoStatus === "Positive" && cycleDam.nidoStatus !== "Positive" && Math.random() < 0.40) {
        setColony((current) => current.map((animal) => animal.id === cycleDam.id ? { ...animal, nidoStatus: "Positive" } : animal));
        setBreedingMessage(`${cycleDam.name} became Nido Positive after exposure during breeding.`);
      }
    }
    if (breedingCycle.stage === "incubation") {
      if (!breederIdentityLoaded) return;
      if (!breederInitials) {
        setInitialsPrompt(true);
        setBreedingMessage("Choose breeder initials before the clutch can be recorded. Your completed incubation is being held safely until initials are confirmed.");
        return;
      }
      setClutch(createClutch(cycleDam, cycleSire, breederInitials));
      setClutchEstablished(false);
      setHoldbacks([]);
      setBreedingCycle(null);
      setBreedingMessage("Incubation complete. The clutch hatched and now needs to be established.");
      return;
    }
    const stageIndex = BREEDING_STAGES.findIndex((stage) => stage.id === breedingCycle.stage);
    const nextStage = BREEDING_STAGES[stageIndex + 1];
    if (nextStage) {
      setBreedingCycle({ ...breedingCycle, stage: nextStage.id, completesAt: Date.now() + nextStage.hours * 3_600_000 });
      setBreedingMessage(nextStage.id === "development" ? "Pairing successful. The pair has separated naturally and development has started." : nextStage.id === "incubation" ? "Development complete. The eggs were laid and moved into the incubator. Incubation has started." : `${nextStage.label} started.`);
    }
  }, [hydrated, now, facilityConstruction, geneticTestsPending, breedingCycle, clutch, colony, breederInitials, breederIdentityLoaded, damId, sireId]);
  /* eslint-enable react-hooks/set-state-in-effect */

  function buyEnclosure(type: EnclosureType) {
    const price = enclosurePrices[type];
    if (cash < price || roomEnclosureSlots <= 0) return;
    setCash((value) => value - price);
    setEnclosures((current) => ({ ...current, [type]: current[type] + 1 }));
  }

  /* eslint-disable react-hooks/exhaustive-deps */
  useEffect(() => {
    function handleEnclosureAction(event: Event) {
      const detail = (event as CustomEvent<{ action?: string; type?: EnclosureType }>).detail ?? {};
      if (detail.action !== "buy-enclosure") return;
      if (detail.type !== "Chondro Dojo Bin" && detail.type !== "PVC Arboreal") return;
      buyEnclosure(detail.type);
    }
    window.addEventListener("arboreal-chondro-enclosure-action", handleEnclosureAction);
    return () => window.removeEventListener("arboreal-chondro-enclosure-action", handleEnclosureAction);
  }, [cash, roomEnclosureSlots]);
  /* eslint-enable react-hooks/exhaustive-deps */

  async function refreshPlayerMarket() {
    const response = await fetch("/api/hatchery/chondro-breeder/player-market", { cache: "no-store" });
    const data = await response.json();
    if (response.ok)
      setPlayerMarket(
        (data.listings ?? []).map((listing: PlayerMarketListing) => ({ ...listing, snake: normalizeSnake(listing.snake) })),
      );
  }

  async function buyPlayerSnake(listing: PlayerMarketListing) {
    if (marketBusy || cash < listing.price || openSlots <= 0) return;
    setMarketBusy(listing.id);
    setMarketStatus("");
    try {
      const response = await fetch("/api/hatchery/chondro-breeder/player-market", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "buy", listingId: listing.id }),
      });
      const data = await response.json();
      if (!response.ok) {
        setMarketStatus(data.error ?? "This snake is no longer available.");
        void refreshPlayerMarket();
        return;
      }
      setCash((value) => value - listing.price);
      setColony((current) => [...current, normalizeSnake(data.result.snake)]);
      setPlayerMarket((current) => current.filter((item) => item.id !== listing.id));
      setMarketStatus(`${listing.snake.name} joined your colony.`);
    } finally {
      setMarketBusy(null);
    }
  }

  /* eslint-disable react-hooks/exhaustive-deps */
  useEffect(() => {
    function handleMarketAction(event: Event) {
      const custom = event as CustomEvent<{ action?: string; listing?: PlayerMarketListing }>;
      const detail = custom.detail ?? {};
      if (detail.action === "buy-player-snake" && detail.listing) {
        void buyPlayerSnake(detail.listing);
      }
    }
    window.addEventListener("arboreal-chondro-market-action", handleMarketAction);
    return () => window.removeEventListener("arboreal-chondro-market-action", handleMarketAction);
  }, [cash, openSlots, marketBusy]);
  /* eslint-enable react-hooks/exhaustive-deps */

  function startBreedingCycle() {
    if (!dam || !sire || clutch || breedingCycle) return;
    if (seasonCarePaid !== season) {
      setBreedingMessage("Provide this season's food and care before starting a breeding cycle.");
      return;
    }
    const recoverySeason = Number(femaleRecovery[dam.id] ?? 0);
    if (recoverySeason > season) {
      setBreedingMessage(`${dam.name} needs another full year of recovery before breeding again.`);
      return;
    }
    if ((dam.nidoStatus === "Positive" || sire.nidoStatus === "Positive") && !window.confirm("HIGH RISK PAIRING: A Nido Positive animal has a 60% chance of dying when bred and may infect its partner. Continue?")) return;
    const first = BREEDING_STAGES[0];
    const start = Date.now();
    setBreedingCycle({ damId: dam.id, sireId: sire.id, stage: first.id, startedAt: start, completesAt: start + first.hours * 3_600_000 });
    setBreedingMessage("Cycling started. Progress continues while you are offline.");
  }

  function breedSelected() {
    if (!dam || !sire) return;
    if (dam.gravid) {
      setBreedingMessage(`${dam.name} is already gravid from the wild — she'll lay her own clutch soon. Pick another dam.`);
      return;
    }
    if (!breederInitials) {
      setInitialsPrompt(true);
      setInitialsStatus("");
      return;
    }
    startBreedingCycle();
  }

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!hydrated || !breederIdentityLoaded || !breederInitials || breedingCycle || clutch) return;
    if (!breedingMessage.startsWith("Choose breeder initials before the clutch can be recorded")) return;
    const recoveryDam = colony.find((animal) => animal.id === damId);
    const recoverySire = colony.find((animal) => animal.id === sireId);
    if (!recoveryDam || !recoverySire) return;
    setClutch(createClutch(recoveryDam, recoverySire, breederInitials));
    setClutchEstablished(false);
    setHoldbacks([]);
    setInitialsPrompt(false);
    setBreedingMessage("Recovered the completed incubation after restoring your breeder initials. The clutch is ready to establish.");
  }, [hydrated, breederIdentityLoaded, breederInitials, breedingCycle, clutch, breedingMessage, colony, damId, sireId]);
  /* eslint-enable react-hooks/set-state-in-effect */

  /**
   * Intro cinematic completion (end, CTA, or skip). The $30,000 credit grant
   * is idempotent: it only tops cash up to STARTING_CASH, and the
   * cinematicSeen flag guarantees it never runs twice — skipping never
   * forfeits the credit, and replaying never re-grants it.
   */
  function handleFirstCinematicDone() {
    setCinematicSeen(true);
    writeCinematicSeenMirror();
    setCash((value) => Math.max(value, STARTING_CASH));
    setStarted(true);
  }

  function paySeasonCare() {    if (seasonCarePaid === season || cash < seasonCareCost) return;
    if (!seasonCareArmed) {
      setSeasonCareArmed(true);
      if (seasonCareArmTimer.current !== null) window.clearTimeout(seasonCareArmTimer.current);
      seasonCareArmTimer.current = window.setTimeout(() => setSeasonCareArmed(false), 5000);
      return;
    }
    if (seasonCareArmTimer.current !== null) { window.clearTimeout(seasonCareArmTimer.current); seasonCareArmTimer.current = null; }
    setSeasonCareArmed(false);
    setCash((value) => value - seasonCareCost);
    setSeasonCarePaid(season);
    setBreedingMessage(`Season ${season} food and care provided for ${money(seasonCareCost)}.`);
  }

  /* ------------------------------------------------------------------ */
  /* Canopy Hunter expedition (in-game event)                            */
  /* ------------------------------------------------------------------ */

  // The free expedition is ready when the player has never gone (0) or the
  // seven-day cooldown has elapsed — or the account is exempt, in which
  // case every trip is free with no cooldown. `now` ticks every 60s, so
  // the Home quick action and this modal refresh their cadence text
  // without a reload.
  const expeditionFreeReady = expeditionUnlimited || now >= expeditionNextAt;
  const expeditionFreeInDays = Math.max(1, Math.ceil((expeditionNextAt - now) / DAY_MS));

  /** This week's field intel: two hot regions, identical for every keeper. */
  const hotRegions = intelHotRegions();
  const isHotRegion = (id: string) => hotRegions.some((r) => r.id === id);
  const isRecovering = (id: string) => (regionRecovery[id] ?? 0) > now;
  const recoveryInDays = (id: string) =>
    Math.max(1, Math.ceil(((regionRecovery[id] ?? now) - now) / DAY_MS));

  function closeExpedition() {
    setExpeditionOpen(false);
    setExpeditionEntered(false);
    setExpeditionFeeArmed(false);
    setExpeditionRegion(null);
    setExpeditionFlightDone(false);
    setPermitActive(false);
    setPermitArmed(false);
  }

  // Back out of a finished run to the entry gate (free/paid). The gate —
  // not the game — decides whether another trip is free, paid, or locked.
  function exitExpeditionToGate() {
    setExpeditionEntered(false);
    setExpeditionFeeArmed(false);
    setExpeditionRegion(null);
    setExpeditionFlightDone(false);
    setPermitActive(false);
    setPermitArmed(false);
  }

  // Flies to a destination, queues its flight intro, and marks the player
  // as entered. Reduced-motion players skip the flight video. The hunted
  // region's groves go into recovery — no revisits for 3 days.
  function beginExpeditionFlight(region: CanopyRegion) {
    setExpeditionRegion(region);
    setRegionRecovery((r) => ({ ...r, [region.id]: Date.now() + REGION_RECOVERY_MS }));
    const skipFlight =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setExpeditionFlightDone(skipFlight);
    setExpeditionEntered(true);
    // The expedition theme fades in with the flight and carries through the hunt.
    playGameMusic(CANOPY_THEME_SRC, CANOPY_THEME_VOLUME);
  }

  /** Random destination, skipping recovering regions when any are rested. */
  function rollAvailableRegion(): CanopyRegion {
    const rested = CANOPY_REGIONS.filter((r) => !isRecovering(r.id));
    const pool = rested.length > 0 ? rested : CANOPY_REGIONS;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  // An expedition can catch up to EXPEDITION_PYTHONS snakes, so it only
  // opens when there is room for the maximum bag. Catches are never
  // partially imported or silently dropped.
  function enterExpeditionFree() {
    if (!started || !expeditionFreeReady || openSlots < EXPEDITION_PYTHONS) return;
    // Exempt accounts never burn the weekly cooldown — every trip is free.
    if (!expeditionUnlimited) setExpeditionNextAt(Date.now() + EXPEDITION_FREE_COOLDOWN_MS);
    setPermitActive(false);
    beginExpeditionFlight(rollAvailableRegion());
  }

  function enterExpeditionPaid() {
    if (!started || expeditionFreeReady || openSlots < EXPEDITION_PYTHONS) return;
    if (payWithTokens) {
      if (getTokenBalance() < TOKEN_EXTRA_EXPEDITION) return;
    } else if (cash < EXPEDITION_ENTRY_FEE) return;
    if (!expeditionFeeArmed) {
      setExpeditionFeeArmed(true);
      if (expeditionFeeArmTimer.current !== null) window.clearTimeout(expeditionFeeArmTimer.current);
      expeditionFeeArmTimer.current = window.setTimeout(() => setExpeditionFeeArmed(false), 5000);
      return;
    }
    if (payWithTokens) {
      if (!arcadeSpendTokens(TOKEN_EXTRA_EXPEDITION, "Extra expedition")) return;
    } else {
      setCash((c) => c - EXPEDITION_ENTRY_FEE);
    }
    setExpeditionFeeArmed(false);
    setPermitActive(false);
    refreshTokens();
    beginExpeditionFlight(rollAvailableRegion());
  }

  /**
   * Permit night: the keeper picks a subspecies and hunts its region —
   * longer night (6 groves), trait-boosted animals, two specialist tools.
   * Permits always cost, even on a free week. Two-tap to confirm.
   */
  function enterExpeditionPermit(sub: CanopySubspecies) {
    if (!started || openSlots < PERMIT_GROVES * PYTHONS_PER_GROVE) return;
    const region = regionForSubspecies(sub);
    if (isRecovering(region.id)) return;
    if (payWithTokens) {
      if (getTokenBalance() < TOKEN_PERMIT) return;
    } else if (cash < EXPEDITION_PERMIT_FEE) return;
    if (permitSubspecies !== sub || !permitArmed) {
      setPermitSubspecies(sub);
      setPermitArmed(true);
      if (expeditionFeeArmTimer.current !== null) window.clearTimeout(expeditionFeeArmTimer.current);
      expeditionFeeArmTimer.current = window.setTimeout(() => setPermitArmed(false), 5000);
      return;
    }
    if (payWithTokens) {
      if (!arcadeSpendTokens(TOKEN_PERMIT, `Targeting permit — ${sub}`)) return;
    } else {
      setCash((c) => c - EXPEDITION_PERMIT_FEE);
    }
    setPermitArmed(false);
    setPermitActive(true);
    refreshTokens();
    beginExpeditionFlight(region);
  }

  function handleExpeditionCatch(wilds: WildSnake[]) {
    if (!started) return;
    // Defensive re-check: the gate requires EXPEDITION_PYTHONS open slots,
    // and this refuses to drop animals if capacity somehow shrank mid-run.
    const freeSlots = unlimitedSpaces ? Number.MAX_SAFE_INTEGER : Math.max(0, animalHousingCapacity(enclosures) - colony.length);
    if (wilds.length > freeSlots) return;
    const nowStamp = Date.now();
    const imports = wilds.map((wild, i) =>
      normalizeSnake(wildSnakeToKeeperSnake(wild, `canopy-${nowStamp}-${i}`)),
    );
    setColony((current) => [...current, ...imports]);
    setLastExpeditionImports(imports);
    setExpeditionResult(
      `Expedition haul: ${wilds.length} ${wilds.length === 1 ? "snake" : "snakes"} brought home to the colony.`,
    );
    // Note: the modal stays open on purpose — CanopyHunter's own receipt
    // ("N snakes added to your colony" + "Plan another expedition") renders
    // in its results phase after bringHome() sets sent=true. Closing happens
    // via onClose (Close / backdrop / "Back to the game") or onExitToGate.
  }

  async function claimBreederInitials() {
    const initials = initialsInput.trim().toUpperCase();
    if (!/^[A-Z]{2,5}$/.test(initials)) {
      setInitialsStatus("Choose 2–5 letters.");
      return;
    }
    setInitialsStatus("Checking availability…");
    const response = await fetch("/api/hatchery/chondro-breeder/breeder-identity", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ initials }),
    });
    const data = await response.json();
    if (!response.ok) {
      setInitialsStatus(data.error ?? "Those initials could not be claimed.");
      return;
    }
    setBreederInitials(data.initials);
    setBreederIdentityLoaded(true);
    setInitialsPrompt(false);
    setInitialsStatus("");
    if (!breedingCycle) window.setTimeout(() => startBreedingCycle(), 0);
  }

  function payClutchEstablishment() {
    if (!clutch || clutchEstablished || cash < clutchEstablishmentCost) return;
    setCash((value) => value - clutchEstablishmentCost);
    setClutch((current) => current ? {
      ...current,
      offspring: current.offspring.map((baby) => ({ ...baby, lifeStage: "Neonate" as LifeStage })),
    } : current);
    setClutchEstablished(true);
    setBreedingMessage(`The entire clutch is established for ${money(clutchEstablishmentCost)}. Neonates are now ready for individual holdback, sale, naming and management.`);
  }

  function toggleHoldback(id: string) {
    if (!clutchEstablished) return;
    setHoldbacks((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : current.length < openSlots
          ? [...current, id]
          : current,
    );
  }

  async function finishClutch() {
    if (!clutch || !clutchEstablished || marketBusy) return;
    const kept = clutch.offspring.filter((baby) => holdbacks.includes(baby.id));
    const sold = clutch.offspring.filter((baby) => !holdbacks.includes(baby.id));
    const saleItems = sold.map((baby) => ({ snakeId: baby.id, price: saleValue(baby, season) }));
    const total = saleItems.reduce((sum, item) => sum + item.price, 0);
    if (sold.length) {
      setMarketBusy("clutch");
      setMarketStatus(`Listing ${sold.length} unheld offspring…`);
      try {
        const response = await fetch("/api/hatchery/chondro-breeder/player-market", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "list-clutch", clutch, holdbackIds: holdbacks, saleItems }),
        });
        const data = await response.json();
        if (!response.ok) {
          setMarketStatus(data.error ?? "The clutch could not be listed. Nothing was changed.");
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
    setClutchHistory((current) => [{ ...clutch, season, holdbackIds: [...holdbacks] }, ...current]);
    const clutchReputation = Math.min(
      250,
      clutch.offspring.reduce((sum, baby) => sum + breedingReputationGain(baby), 0),
    );
    setCareerReputation((current) => current + clutchReputation);
    const needsExtraRecovery = needsExtraRecoveryYear(
      CHONDRO_SPECIES_PROFILE,
      clutch.dam.condition,
      clutch.offspring.length,
    );
    const nextEligibleSeason = needsExtraRecovery ? season + 2 : season + 1;
    setFemaleRecovery((current) => ({ ...current, [clutch.dam.id]: nextEligibleSeason }));
    setBreedingMessage(
      needsExtraRecovery
        ? `${clutch.dam.name} needs an additional recovery year after this ${clutch.offspring.length}-egg clutch. +${clutchReputation} breeder reputation.`
        : `${clutch.dam.name} recovered in time for next season. +${clutchReputation} breeder reputation.`,
    );
    setClutch(null);
    setClutchEstablished(false);
    setHoldbacks([]);
    setDamId("");
    setSireId("");
    setSeasonCarePaid(0);
    setSeason((current) => current + 1);
    if (sold.length) {
      setMarketStatus(`${sold.length} unheld offspring listed at ${money(total)} combined asking price. Proceeds become claimable after buyers purchase them.`);
      void refreshPlayerMarket();
    }
  }

  /* eslint-disable react-hooks/exhaustive-deps */
  useEffect(() => {
    function handleClutchAction(event: Event) {
      const detail = (event as CustomEvent<{ action?: string; snakeId?: string }>).detail ?? {};
      if (detail.action === "establish") {
        payClutchEstablishment();
        return;
      }
      if (detail.action === "toggle-holdback" && typeof detail.snakeId === "string") {
        toggleHoldback(detail.snakeId);
        return;
      }
      if (detail.action === "finish") {
        void finishClutch();
      }
    }
    window.addEventListener("arboreal-chondro-clutch-action", handleClutchAction);
    return () => window.removeEventListener("arboreal-chondro-clutch-action", handleClutchAction);
  }, [clutch, clutchEstablished, cash, clutchEstablishmentCost, holdbacks, marketBusy, openSlots, season]);
  /* eslint-enable react-hooks/exhaustive-deps */


  function resetGame() {
    // The inline form already collected the exact confirmation phrase, so this
    // just performs the reset. (A native window.prompt was used here before;
    // it is unreliable in embedded/automated browsers and poor UX.)
    setResetMenuOpen(false);
    setResetArmed(false);
    setResetConfirmText("");
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
    setCareerReputation(0);
    setFacilityRooms({ "starter-room": 1 });
    setFacilityConstruction(null);
    setBreedingCycle(null);
    setGeneticTestsPending([]);
    setFemaleRecovery({});
    setSeasonCarePaid(0);
    setBreedingMessage("");
    setClutchEstablished(false);
    setFavoriteIds([]);
    setCollapsedAnimalIds([]);
    setSelectedSnakeId(null);
    setExpeditionNextAt(0);
    setExpeditionOpen(false);
    setExpeditionEntered(false);
    setExpeditionFeeArmed(false);
    setExpeditionResult(null);
    try {
      window.localStorage.removeItem(LOCAL_SAVE_KEY);
    } catch {}
  }

  if (!hydrated)
    return (
      <div className="mx-auto max-w-5xl px-5 py-16 sm:px-6">
        <div className="panel rounded-[30px] p-8 text-center text-sm text-white/45">Loading your Arboreal Keeper save…</div>
      </div>
    );

  if (replayingIntro)
    return (
      <IntroCinematic onDone={() => setReplayingIntro(false)} />
    );

  // The intro cinematic auto-plays exactly once per player — gated on
  // cinematicSeen, not on started, so store-only buyers who open a breeder
  // tab later still get their one viewing.
  if (!started && !cinematicSeen)
    return (
      <IntroCinematic onDone={handleFirstCinematicDone} />
    );

  if (!started)
    return (
      <div className="mx-auto max-w-5xl px-5 py-10 sm:px-6">
        <section className="panel rounded-[32px] p-7 sm:p-10">
          <div className="text-[10px] font-black uppercase tracking-[.2em] text-amber-200/55">Arboreal Keeper</div>
          <h1 className="mt-4 text-4xl font-semibold sm:text-5xl">Start your collection.</h1>
          <p className="mt-5 max-w-2xl text-sm leading-7 text-white/45">
            Your $30,000 credit at Hank Scale&rsquo;s Reptiles is loaded. Build a trait program, a pure locality program, or both. Most snakes now begin with little or no expression, high percentages are genuinely rare, and each subspecies has traits it is naturally more likely to express.
          </p>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-white/[.06] p-4 text-sm text-white/40">
              <div className="font-semibold text-emerald-100/65">Trait breeder</div>
              <div className="mt-1 text-xs leading-5">Breed by appearance for free, or pay for optional genetic testing to reveal exact trait percentages.</div>
            </div>
            <div className="rounded-2xl border border-white/[.06] p-4 text-sm text-white/40">
              <div className="font-semibold text-amber-100/65">Locality breeder</div>
              <div className="mt-1 text-xs leading-5">Keep named-locality lines pure and chase phenotype grades such as A+ Jayapura phenotype.</div>
            </div>
          </div>
          <div className="mt-5 text-xs text-white/32">Progress autosaves to this browser{cloudSave ? " and your Arboreal Planet account" : ""}.</div>
          <button onClick={() => setStarted(true)} className="mt-8 rounded-2xl bg-amber-200 px-6 py-3 text-sm font-black text-[#17130a]">Start your collection</button>
          {cinematicSeen ? (
            <div className="mt-4">
              <button onClick={() => setReplayingIntro(true)} className="text-xs text-white/35 underline decoration-white/20 underline-offset-4 transition hover:text-white/60">Replay the intro</button>
            </div>
          ) : null}
        </section>
      </div>
    );

  return (
    <BreederGameScreenContext.Provider value={screen}>
    <ArcadeToasts />
    <div className="mx-auto max-w-7xl px-5 py-6 sm:px-6 sm:py-8">
      {expeditionResult ? (
        <div role="status" className="mb-4 rounded-2xl border border-emerald-300/20 bg-emerald-300/[.06] p-4">
          <div className="flex items-center gap-3">
            <p className="flex-1 text-sm font-semibold text-emerald-100/85">{expeditionResult}</p>
            <button
              type="button"
              onClick={() => {
                setExpeditionResult(null);
                setLastExpeditionImports([]);
              }}
              className="shrink-0 rounded-xl border border-white/[.09] px-3 py-1.5 text-xs font-bold text-white/60 transition hover:bg-white/[.06] hover:text-white/85"
            >
              Dismiss
            </button>
          </div>
          {lastExpeditionImports.length > 0 ? (
            <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
              {lastExpeditionImports.slice(0, 8).map((animal) => (
                <div key={animal.id} className="h-20 w-20 shrink-0" title={animal.name}>
                  <ChondroSnakeIcon
                    subspecies={animal.subspecies as never}
                    name={animal.name}
                    lifeStage={animal.lifeStage as never}
                    neonateColor={animal.neonateColor}
                    locality={animal.locality}
                    classification={animal.classification as never}
                    ancestry={animal.ancestry as never}
                    localityAncestry={animal.localityAncestry}
                    phenotypeScore={animal.phenotypeScore}
                    spriteSeed={animal.spriteSeed ?? animal.id}
                    mini
                  />
                </div>
              ))}
              {lastExpeditionImports.length > 8 ? (
                <div className="grid h-20 w-20 shrink-0 place-items-center rounded-2xl border border-white/[.06] bg-black/20 text-xs font-bold text-white/50">
                  +{lastExpeditionImports.length - 8}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-white/[.06] bg-white/[.018] p-3 sm:gap-3 sm:p-4">
        <div className="mr-auto min-w-[150px]">
          <div className="text-[9px] font-black uppercase tracking-[.14em] text-emerald-200/38">Season {season}</div>
          <div className="mt-1 text-xs text-white/38">Core breeder state</div>
        </div>
        <div className="rounded-xl border border-white/[.06] bg-black/15 px-3 py-2">
          <div className="text-[8px] uppercase tracking-[.12em] text-white/22">Cash</div>
          <div className="mt-0.5 text-sm font-semibold text-emerald-200/72">{money(cash)}</div>
        </div>
        <div className="rounded-xl border border-white/[.06] bg-black/15 px-3 py-2">
          <div className="text-[8px] uppercase tracking-[.12em] text-white/22">Capacity</div>
          <div className="mt-0.5 text-sm font-semibold text-white/62">{colony.length}/{unlimitedSpaces ? "∞" : capacity}</div>
        </div>
        <div className="relative">
          <button
            type="button"
            onClick={() => {
              if (resetMenuOpen) { setResetArmed(false); setResetConfirmText(""); }
              setResetMenuOpen(!resetMenuOpen);
            }}
            aria-expanded={resetMenuOpen}
            aria-haspopup="menu"
            aria-label="Open game options"
            title="Game options"
            className="grid h-9 w-9 place-items-center rounded-xl border border-white/[.06] bg-black/15 text-base font-black tracking-[.08em] text-white/30 transition hover:border-white/[.12] hover:text-white/58"
          >
            •••
          </button>
          {resetMenuOpen ? (
            <div role="menu" className="absolute right-0 top-11 z-30 w-[min(20rem,calc(100vw-2rem))] rounded-2xl border border-white/[.08] bg-[#07100c] p-4 shadow-2xl">
              <div className="text-[9px] font-black uppercase tracking-[.14em] text-white/30">Game options</div>
              <div className="mt-2 text-sm font-semibold text-white/68">Save controls</div>
              <p className="mt-1 text-xs leading-5 text-white/34">Reset is intentionally buried here because it permanently clears your breeder progress.</p>
              {resetArmed ? (
                <div className="mt-3 rounded-xl border border-red-300/15 bg-red-300/[.03] p-3">
                  <label htmlFor="reset-confirm-input" className="text-[10px] font-bold uppercase tracking-[.08em] text-red-100/60">
                    Type RESET ARBOREAL KEEPER to erase your save
                  </label>
                  <input
                    id="reset-confirm-input"
                    value={resetConfirmText}
                    onChange={(event) => setResetConfirmText(event.target.value)}
                    placeholder="RESET ARBOREAL KEEPER"
                    autoComplete="off"
                    className="mt-2 w-full rounded-lg border border-red-300/20 bg-black/30 px-3 py-2 text-xs text-white/80 outline-none placeholder:text-white/25 focus:border-red-300/40"
                  />
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      disabled={resetConfirmText !== "RESET ARBOREAL KEEPER"}
                      onClick={resetGame}
                      className="rounded-xl border border-red-300/25 bg-red-300/[.08] px-3 py-2 text-[10px] font-bold text-red-100/80 transition hover:bg-red-300/[.14] disabled:cursor-not-allowed disabled:opacity-35"
                    >
                      Erase my save
                    </button>
                    <button
                      type="button"
                      onClick={() => { setResetArmed(false); setResetConfirmText(""); }}
                      className="rounded-xl border border-white/[.08] px-3 py-2 text-[10px] font-bold text-white/50 transition hover:text-white/75"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => setResetArmed(true)}
                  className="mt-3 rounded-xl border border-red-300/15 bg-red-300/[.025] px-3 py-2 text-[10px] font-bold text-red-100/55 transition hover:border-red-300/28 hover:text-red-100/78"
                >
                  Reset breeder save…
                </button>
              )}
            </div>
          ) : null}
        </div>
      </div>

      {(breedingCycle || geneticTestsPending.length || facilityConstruction || gravidFemales.length) ? (
        <div className="mt-4 rounded-2xl border border-emerald-300/10 bg-emerald-300/[.025] p-4">
          <div className="text-[10px] font-black uppercase tracking-[.14em] text-emerald-100/45">Operations Queue</div>
          <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {breedingCycle ? <div className="rounded-xl border border-amber-200/10 p-3"><div className="text-xs font-bold text-amber-100/65">{BREEDING_STAGES.find((stage) => stage.id === breedingCycle.stage)?.label}</div><div className="mt-1 text-[10px] text-white/35">{colony.find((animal) => animal.id === breedingCycle.damId)?.name ?? breedingCycle.damId} × {colony.find((animal) => animal.id === breedingCycle.sireId)?.name ?? breedingCycle.sireId} · {remainingTime(breedingCycle.completesAt - now)}</div></div> : null}
            {gravidFemales.map((animal) => {
              const laysAt = animal.gravidLaysAt ?? now;
              const waitReason = laysAt > now
                ? `lays in ${remainingTime(laysAt - now)}`
                : clutch
                  ? "waiting — finish the current clutch first"
                  : breedingCycle
                    ? "waiting — breeding cycle in progress"
                    : !breederInitials
                      ? "waiting — set breeder initials"
                      : "laying…";
              return (
                <div key={animal.id} className="rounded-xl border border-pink-300/10 p-3">
                  <div className="text-xs font-bold text-pink-100/65">Gravid — wild clutch coming</div>
                  <div className="mt-1 text-[10px] text-white/35">{animal.name} · {waitReason}</div>
                </div>
              );
            })}
            {geneticTestsPending.map((job) => <div key={job.snakeId} className="rounded-xl border border-sky-300/10 p-3"><div className="text-xs font-bold text-sky-100/65">Genetic Test</div><div className="mt-1 text-[10px] text-white/35">{colony.find((animal) => animal.id === job.snakeId)?.name ?? job.snakeId} · {remainingTime(job.completesAt - now)}</div></div>)}
            {facilityConstruction ? <div className="rounded-xl border border-emerald-300/10 p-3"><div className="text-xs font-bold text-emerald-100/65">Construction</div><div className="mt-1 text-[10px] text-white/35">{ROOM_EXPANSIONS.find((room) => room.id === facilityConstruction.roomId)?.name ?? facilityConstruction.roomId} · {remainingTime(facilityConstruction.completesAt - now)}</div></div> : null}
          </div>
        </div>
      ) : null}

      <CollapsibleGameSection label="Breeding room" detail={`${females.length} adult female${females.length === 1 ? "" : "s"} · ${males.length} adult male${males.length === 1 ? "" : "s"}`} defaultOpen>
        <section className="panel rounded-[28px] p-6">
          <div className="section-kicker">Breeding room</div>
          <h2 className="mt-2 text-2xl font-semibold">Select the direction of your line.</h2>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <label>
              <span className="mb-2 block text-xs font-bold text-white/38">Female</span>
              <select value={damId} onChange={(event) => setDamId(event.target.value)} className="w-full rounded-2xl border border-white/[.08] bg-black/30 px-4 py-3 text-sm">
                <option value="">Choose adult female</option>
                {females.map((a) => <option key={a.id} value={a.id}>{a.name} · {a.locality}{a.geneticsTested ? " · tested" : ""}</option>)}
              </select>
            </label>
            <label>
              <span className="mb-2 block text-xs font-bold text-white/38">Male</span>
              <select value={sireId} onChange={(event) => setSireId(event.target.value)} className="w-full rounded-2xl border border-white/[.08] bg-black/30 px-4 py-3 text-sm">
                <option value="">Choose adult male</option>
                {males.map((a) => <option key={a.id} value={a.id}>{a.name} · {a.locality}{a.geneticsTested ? " · tested" : ""}</option>)}
              </select>
            </label>
          </div>
          {dam && sire ? (
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div className="rounded-2xl border border-white/[.06] p-4 text-xs text-white/42">Projected classification: <span className="font-semibold text-amber-100/65">{classifyPair(dam, sire)}</span><br /><span className="mt-1 block text-white/30">{classifyPair(dam, sire) === "Pure" && dam.locality === sire.locality && isNamedLocality(dam.locality) ? `Named-locality line preserved: ${dam.locality}` : classifyPair(dam, sire) === "Pure" ? "Subspecies stays pure, but this becomes a Mixed Locality line." : "This pairing will not receive a pure-locality phenotype grade."}</span></div>
              <div className="rounded-2xl border border-white/[.06] p-4 text-xs text-white/42">Selected genetics: <span className="font-semibold text-emerald-100/60">{dam.geneticsTested && sire.geneticsTested ? "Both parents tested" : dam.geneticsTested || sire.geneticsTested ? "One parent tested" : "Both parents untested"}</span><br /><span className="mt-1 block text-white/30">Testing is not required to breed. You can select entirely by appearance.</span></div>
            </div>
          ) : null}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {seasonCarePaid === season ? <span className="rounded-full border border-emerald-300/15 px-3 py-2 text-[10px] font-bold text-emerald-100/60">Season {season} care paid</span> : <button disabled={cash < seasonCareCost} onClick={paySeasonCare} className="rounded-xl border border-emerald-300/15 bg-emerald-300/[.04] px-4 py-2 text-xs font-bold text-emerald-100/65 disabled:opacity-30">{seasonCareArmed ? `Tap again to confirm — ${money(seasonCareCost)}` : <>Food & care · {money(seasonCareCost)}</>}</button>}
            {breedingCycle ? <span className="rounded-full border border-amber-200/15 px-3 py-2 text-[10px] font-black text-amber-100/70">{BREEDING_STAGES.find((stage) => stage.id === breedingCycle.stage)?.label} · {remainingTime(breedingCycle.completesAt - now)}</span> : null}
          </div>
          {breedingMessage ? <div role="status" className="mt-3 rounded-xl border border-white/[.06] bg-black/10 p-3 text-xs text-white/45">{breedingMessage}</div> : null}
          <button disabled={!dam || !sire || !!clutch || !!breedingCycle || seasonCarePaid !== season} onClick={breedSelected} className="mt-5 rounded-2xl bg-amber-200 px-6 py-3 text-sm font-black text-[#17130a] disabled:opacity-30">{breedingCycle ? "Breeding cycle in progress" : "Start breeding cycle"}</button>
        </section>
      </CollapsibleGameSection>

      {selectedAnimal ? (
        <div role="dialog" aria-modal="true" aria-label={`Snake record · ${selectedAnimal.name || "Unnamed snake"}`} onClick={(event) => { if (event.target === event.currentTarget) setSelectedSnakeId(null); }} className="fixed inset-0 z-50 overflow-y-auto bg-black/80 p-3 backdrop-blur-sm sm:p-6">
          <div className="mx-auto max-w-4xl rounded-[30px] border border-white/[.09] bg-[#09120e] p-5 shadow-2xl sm:p-7">
            <div className="flex items-center justify-between gap-4"><div><div className="section-kicker">Snake record · {selectedAnimal.id}</div><h2 className="mt-2 text-3xl font-semibold">{selectedAnimal.name || "Unnamed snake"}</h2></div><button onClick={() => setSelectedSnakeId(null)} className="rounded-xl border border-white/[.09] px-4 py-2 text-sm font-bold text-white/60">Close</button></div>
            <div className="mt-6 grid gap-6 lg:grid-cols-2">
              <div>
                <ChondroSnakeIcon subspecies={selectedAnimal.subspecies} name={selectedAnimal.name} traits={portraitTraits(selectedAnimal)} lifeStage={selectedAnimal.lifeStage} neonateColor={selectedAnimal.neonateColor} locality={selectedAnimal.locality} classification={selectedAnimal.classification} ancestry={selectedAnimal.ancestry} localityAncestry={selectedAnimal.localityAncestry} phenotypeScore={selectedAnimal.phenotypeScore} spriteSeed={selectedAnimal.id} />
                <div className="mt-4"><TraitGrid animal={selectedAnimal} /></div>
                <div className="mt-4 flex flex-wrap gap-2"><PhenotypeBadge animal={selectedAnimal} /><span className="rounded-full border border-white/[.08] px-3 py-1 text-[10px] text-white/45">{selectedAnimal.classification} · {selectedAnimal.locality}</span></div>
              </div>
              <div className="space-y-4">
                <div className="rounded-2xl border border-white/[.06] p-4">
                  <div className="text-[10px] font-black uppercase tracking-[.13em] text-white/30">Pedigree</div>
                  {selectedParents.length ? <div className="mt-3 grid grid-cols-2 gap-2">{selectedParents.map((parent) => <button key={parent.id} onClick={() => setSelectedSnakeId(parent.id)} className="rounded-xl border border-white/[.06] p-3 text-left"><div className="text-[9px] uppercase text-white/25">{parent.sex === "Female" ? "Dam" : "Sire"}</div><div className="mt-1 truncate text-sm font-semibold text-white/65">{parent.name}</div><div className="mt-1 text-[9px] text-white/25">{parent.locality} · Gen {parent.generation}</div></button>)}</div> : <div className="mt-3 text-sm text-white/28">Foundation animal · no recorded parents</div>}
                  {selectedOffspring.length ? <div className="mt-5"><div className="text-[9px] font-bold uppercase tracking-[.11em] text-white/25">Offspring ({selectedOffspring.length})</div><div className="mt-2 flex flex-wrap gap-2">{selectedOffspring.map((baby) => <button key={baby.id} onClick={() => setSelectedSnakeId(baby.id)} className="rounded-lg border border-amber-200/10 px-3 py-2 text-xs text-amber-100/60">{baby.name}</button>)}</div></div> : null}
                  <button onClick={() => setLineageRootId(selectedAnimal.id)} className="mt-4 w-full rounded-xl border border-emerald-300/20 bg-emerald-300/[.05] px-4 py-2.5 text-xs font-bold text-emerald-100/70 transition active:scale-95">🌳 Open full lineage tree</button>
                </div>
                <div className="rounded-2xl border border-white/[.06] p-4">
                  <div className="text-[10px] font-black uppercase tracking-[.13em] text-white/30">Locality pedigree</div>
                  <div className="mt-3 space-y-2">{Object.entries(selectedAnimal.localityAncestry).map(([name, percent]) => <div key={name}><div className="flex justify-between gap-3 text-xs text-white/45"><span>{name}</span><span>{percent}%</span></div><div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/[.05]"><div className="h-full rounded-full bg-amber-200/55" style={{ width: `${percent}%` }} /></div></div>)}</div>
                </div>
                <div className="rounded-2xl border border-white/[.06] p-4">
                  <div className="text-[10px] font-black uppercase tracking-[.13em] text-white/30">Subspecies ancestry</div>
                  <div className="mt-3 space-y-2">{Object.entries(selectedAnimal.ancestry).map(([name, percent]) => <div key={name}><div className="flex justify-between gap-3 text-xs text-white/45"><span>{name}</span><span>{percent}%</span></div><div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/[.05]"><div className="h-full rounded-full bg-emerald-300/55" style={{ width: `${percent}%` }} /></div></div>)}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* Lineage tree — two generations up and down from the root animal.
          Tap any node to re-root the tree there. */}
      {lineageTree ? (
        <div role="dialog" aria-modal="true" aria-label={`Lineage tree · ${lineageTree.root.name}`} onClick={(event) => { if (event.target === event.currentTarget) setLineageRootId(null); }} className="fixed inset-0 z-[60] overflow-y-auto bg-black/85 p-3 backdrop-blur-sm sm:p-6">
          <div className="mx-auto max-w-3xl rounded-[30px] border border-white/[.09] bg-[#09120e] p-5 shadow-2xl sm:p-7">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="section-kicker">Lineage tree</div>
                <h2 className="mt-2 text-2xl font-semibold">{lineageTree.root.name || "Unnamed snake"}</h2>
              </div>
              <button onClick={() => setLineageRootId(null)} className="rounded-xl border border-white/[.09] px-4 py-2 text-sm font-bold text-white/60">Close</button>
            </div>
            <div className="mt-6 flex flex-col items-center gap-1">
              {lineageTree.grandparents.length ? (
                <>
                  <div className="text-[10px] font-black uppercase tracking-[.15em] text-white/30">Grandparents</div>
                  <div className="mt-2 flex flex-wrap justify-center gap-2">
                    {lineageTree.grandparents.map((a) => <LineageNode key={a.id} animal={a} onPick={setLineageRootId} />)}
                  </div>
                  <div className="my-1 h-5 w-px bg-white/15" aria-hidden />
                </>
              ) : null}
              {lineageTree.parents.length ? (
                <>
                  <div className="text-[10px] font-black uppercase tracking-[.15em] text-white/30">Parents</div>
                  <div className="mt-2 flex flex-wrap justify-center gap-2">
                    {lineageTree.parents.map((a) => <LineageNode key={a.id} animal={a} onPick={setLineageRootId} />)}
                  </div>
                  <div className="my-1 h-5 w-px bg-white/15" aria-hidden />
                </>
              ) : (
                <p className="mb-1 text-[11px] italic text-white/30">Foundation animal — no recorded parents</p>
              )}
              <LineageNode animal={lineageTree.root} highlight onPick={setLineageRootId} />
              {lineageTree.mateGroups.length ? <div className="my-1 h-5 w-px bg-white/15" aria-hidden /> : null}
              {lineageTree.mateGroups.map((group, gi) => (
                <div key={group.mate?.id ?? `unknown-${gi}`} className="flex w-full flex-col items-center">
                  <div className="text-[10px] font-black uppercase tracking-[.15em] text-white/30">
                    Offspring{group.mate ? <> × {group.mate.name || "Unnamed"}</> : null} ({group.babies.length})
                  </div>
                  <div className="mt-2 flex max-w-full flex-wrap justify-center gap-2">
                    {group.babies.slice(0, 12).map((a) => <LineageNode key={a.id} animal={a} onPick={setLineageRootId} />)}
                    {group.babies.length > 12 ? <div className="self-center text-[11px] text-white/35">+{group.babies.length - 12} more</div> : null}
                  </div>
                  {gi < lineageTree.mateGroups.length - 1 ? <div className="my-3 h-px w-16 bg-white/10" aria-hidden /> : null}
                </div>
              ))}
              {lineageTree.grandchildren.length ? (
                <>
                  <div className="my-1 h-5 w-px bg-white/15" aria-hidden />
                  <div className="text-[10px] font-black uppercase tracking-[.15em] text-white/30">Grand-offspring ({lineageTree.grandchildren.length})</div>
                  <div className="mt-2 flex max-w-full flex-wrap justify-center gap-2">
                    {lineageTree.grandchildren.slice(0, 12).map((a) => <LineageNode key={a.id} animal={a} onPick={setLineageRootId} />)}
                    {lineageTree.grandchildren.length > 12 ? <div className="self-center text-[11px] text-white/35">+{lineageTree.grandchildren.length - 12} more</div> : null}
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {/* Canopy Hunter expedition (in-game event). Backdrop click and Escape
          close it; the game inside reports catches via onCatch and closes
          itself via onClose. Entry is gated on colony space before the game
          starts, and the catch handler re-checks capacity before importing —
          catches are never partially imported or dropped. */}
      {expeditionOpen ? (
        <div role="dialog" aria-modal="true" aria-label="Canopy Hunter expedition" onClick={(event) => { if (event.target === event.currentTarget && !expeditionEntered) closeExpedition(); }} className="fixed inset-0 z-[90] overflow-y-auto bg-black/80 p-3 backdrop-blur-sm sm:p-6" style={{ touchAction: "pan-x pan-y" }}>
          <div className="mx-auto w-full max-w-4xl overflow-x-hidden rounded-[30px] border border-white/[.09] bg-[#09120e] p-5 shadow-2xl sm:p-7">
            {!expeditionEntered ? (
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="section-kicker">Special event</div>
                <h2 className="mt-2 text-3xl font-semibold">Canopy Hunter</h2>
              </div>
              <button onClick={closeExpedition} className="rounded-xl border border-white/[.09] px-4 py-2 text-sm font-bold text-white/60">Close</button>
            </div>
            ) : null}
            {!expeditionEntered ? (
              <div className="mt-6">
                <p className="text-sm leading-7 text-white/55">
                  Head into the night canopy for a field expedition. Search the trees, grab the
                  green tree pythons you find, and bring them home to your colony.
                </p>
                {/* Arcade token wallet + payment toggle */}
                <div className="mt-4 flex flex-wrap items-center gap-2 rounded-2xl border border-amber-200/20 bg-amber-200/[.05] p-3">
                  <span className="text-sm font-black text-amber-100">🪙 {tokenBal.toLocaleString()}</span>
                  <span className="text-xs text-white/50">arcade tokens — earn them playing the arcade games</span>
                  <div className="ml-auto flex items-center gap-1 rounded-xl border border-white/10 bg-black/40 p-1">
                    <button
                      type="button"
                      onClick={() => setPayWithTokens(false)}
                      className={`rounded-lg px-3 py-1.5 text-xs font-black uppercase tracking-[.08em] transition ${!payWithTokens ? "bg-emerald-300 text-[#06100c]" : "text-white/50 hover:text-white/80"}`}
                    >
                      Cash
                    </button>
                    <button
                      type="button"
                      onClick={() => setPayWithTokens(true)}
                      className={`rounded-lg px-3 py-1.5 text-xs font-black uppercase tracking-[.08em] transition ${payWithTokens ? "bg-amber-200 text-[#171106]" : "text-white/50 hover:text-white/80"}`}
                    >
                      🪙 Tokens
                    </button>
                  </div>
                </div>
                {openSlots < EXPEDITION_PYTHONS ? (
                  <div role="status" className="mt-4 rounded-2xl border border-red-400/20 bg-red-400/[.06] p-4 text-sm leading-6 text-red-100/80">
                    Not enough room for an expedition — it can catch up to {EXPEDITION_PYTHONS} snakes
                    and you have space for {openSlots}. Free up housing first so no catch goes without a home.
                  </div>
                ) : expeditionFreeReady ? (
                  <div className="mt-4">
                    <div role="status" className="rounded-2xl border border-emerald-300/20 bg-emerald-300/[.06] p-4 text-sm leading-6 text-emerald-100/85">
                      {expeditionUnlimited
                        ? "Unlimited expeditions on your account — head out whenever you like, every trip is free."
                        : "Your free weekly expedition is ready. There is room for the whole catch."}
                    </div>
                    <button
                      type="button"
                      onClick={enterExpeditionFree}
                      className="mt-4 w-full rounded-2xl bg-emerald-300 px-6 py-4 text-base font-bold text-[#06100c] transition hover:bg-emerald-200 active:scale-[.99]"
                    >
                      Head out — free
                    </button>
                  </div>
                ) : (
                  <div className="mt-4">
                    <div role="status" className="rounded-2xl border border-white/[.07] bg-white/[.02] p-4 text-sm leading-6 text-white/55">
                      Next free expedition in {expeditionFreeInDays} {expeditionFreeInDays === 1 ? "day" : "days"}.
                      Can&apos;t wait? Fund an extra trip out of pocket.
                    </div>
                    <button
                      type="button"
                      disabled={payWithTokens ? tokenBal < TOKEN_EXTRA_EXPEDITION : cash < EXPEDITION_ENTRY_FEE}
                      onClick={enterExpeditionPaid}
                      className="mt-4 w-full rounded-2xl border border-amber-200/25 bg-amber-200/[.07] px-6 py-4 text-base font-bold text-amber-100 transition hover:bg-amber-200/[.12] disabled:opacity-30"
                    >
                      {expeditionFeeArmed
                        ? `Tap again to confirm — ${payWithTokens ? `${TOKEN_EXTRA_EXPEDITION} 🪙` : money(EXPEDITION_ENTRY_FEE)}`
                        : `Extra expedition · ${payWithTokens ? `${TOKEN_EXTRA_EXPEDITION} 🪙` : money(EXPEDITION_ENTRY_FEE)}`}
                    </button>
                  </div>
                )}

                {/* Field intel + permits */}
                <div className="mt-6 rounded-2xl border border-white/[.07] bg-white/[.02] p-4">
                  <p className="text-[11px] font-black uppercase tracking-[.16em] text-white/45">
                    📡 Field intel — this week
                  </p>
                  <p className="mt-1 text-sm leading-6 text-white/65">
                    🔥 Hot: {hotRegions.map((r) => r.name).join(" · ")} — trophy signs twice as common there.
                  </p>
                  {CANOPY_REGIONS.some((r) => isRecovering(r.id)) && (
                    <p className="mt-1 text-xs leading-5 text-white/40">
                      🌿 Recovering:{" "}
                      {CANOPY_REGIONS.filter((r) => isRecovering(r.id))
                        .map((r) => `${r.name} (${recoveryInDays(r.id)}d)`)
                        .join(" · ")}
                    </p>
                  )}
                  <p className="mt-3 text-[11px] font-black uppercase tracking-[.16em] text-amber-200/70">
                    🎫 Targeting permit · {payWithTokens ? `${TOKEN_PERMIT} 🪙` : money(EXPEDITION_PERMIT_FEE)}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-white/50">
                    Choose your subspecies — {PERMIT_GROVES} groves, trait-boosted animals, and 2 specialist tools (scent lure + sure grip). Rare localities stay rare.
                  </p>
                  {openSlots < PERMIT_GROVES * PYTHONS_PER_GROVE && (
                    <p className="mt-2 text-xs font-bold text-red-300/80">
                      Permits bring home up to {PERMIT_GROVES * PYTHONS_PER_GROVE} snakes — free up housing first.
                    </p>
                  )}
                  <div className="mt-3 grid grid-cols-1 gap-2">
                    {(Object.keys(SUBSPECIES_REGION_ID) as CanopySubspecies[]).map((sub) => {
                      const region = regionForSubspecies(sub);
                      const recovering = isRecovering(region.id);
                      const hot = isHotRegion(region.id);
                      const selected = permitSubspecies === sub;
                      const short = sub.replace("Morelia ", "").replace("azurea ", "a. ");
                      return (
                        <button
                          key={sub}
                          type="button"
                          disabled={recovering || openSlots < PERMIT_GROVES || (payWithTokens ? tokenBal < TOKEN_PERMIT : cash < EXPEDITION_PERMIT_FEE)}
                          onClick={() => enterExpeditionPermit(sub)}
                          className={`rounded-xl border px-4 py-3 text-left transition active:scale-[.99] disabled:opacity-40 ${
                            selected
                              ? "border-amber-200/50 bg-amber-200/[.1]"
                              : "border-white/10 bg-white/[.03] hover:bg-white/[.06]"
                          }`}
                        >
                          <span className="flex items-center justify-between gap-2">
                            <span className="text-sm font-bold text-white/85">
                              <em>{short}</em>
                            </span>
                            <span className="text-[11px] font-bold uppercase tracking-[.1em] text-white/40">
                              {recovering ? `🌿 ${recoveryInDays(region.id)}d` : hot ? "🔥 hot" : region.name}
                            </span>
                          </span>
                          <span className="mt-0.5 block text-xs text-white/45">
                            {region.name} — {region.tagline}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  <button
                    type="button"
                    disabled={!permitSubspecies || openSlots < PERMIT_GROVES || (payWithTokens ? tokenBal < TOKEN_PERMIT : cash < EXPEDITION_PERMIT_FEE) || isRecovering(regionForSubspecies(permitSubspecies).id)}
                    onClick={() => permitSubspecies && enterExpeditionPermit(permitSubspecies)}
                    className="mt-3 w-full rounded-2xl bg-amber-200 px-6 py-4 text-base font-bold text-[#171106] transition hover:bg-amber-100 active:scale-[.99] disabled:opacity-30"
                  >
                    {!permitSubspecies
                      ? "Pick a subspecies above"
                      : permitArmed
                        ? `Tap again to confirm — ${payWithTokens ? `${TOKEN_PERMIT} 🪙` : money(EXPEDITION_PERMIT_FEE)}`
                        : `Buy permit & head out · ${payWithTokens ? `${TOKEN_PERMIT} 🪙` : money(EXPEDITION_PERMIT_FEE)}`}
                  </button>
                  {/* Token → cash exchange */}
                  <div className="mt-3 flex items-center justify-between gap-2 rounded-xl border border-white/[.07] bg-black/30 px-3 py-2.5">
                    <span className="text-xs text-white/55">
                      Flush with tokens? Exchange 10 🪙 → {money(10 * TOKEN_CASH_RATE)} operating cash.
                    </span>
                    <button
                      type="button"
                      disabled={tokenBal < 10}
                      onClick={() => {
                        if (!arcadeSpendTokens(10, "Token → cash exchange")) return;
                        setCash((c) => c + 10 * TOKEN_CASH_RATE);
                        refreshTokens();
                      }}
                      className="shrink-0 rounded-xl border border-amber-200/25 bg-amber-200/[.08] px-3 py-1.5 text-xs font-black uppercase tracking-[.08em] text-amber-100 transition hover:bg-amber-200/[.15] disabled:opacity-30"
                    >
                      Exchange
                    </button>
                  </div>
                </div>
              </div>
            ) : expeditionEntered && expeditionRegion && !expeditionFlightDone ? (
              <div role="dialog" aria-modal="true" aria-label={`Flying to ${expeditionRegion.name}`} className="fixed inset-0 z-[70] bg-black">
                <video
                  key={expeditionRegion.id}
                  className="h-full w-full object-contain"
                  src={flightVideoForRegion(expeditionRegion)}
                  autoPlay
                  muted
                  playsInline
                  preload="auto"
                  onPlay={() => playGameMusic(CANOPY_THEME_SRC, CANOPY_THEME_VOLUME)}
                  onEnded={() => setExpeditionFlightDone(true)}
                />
                <button
                  type="button"
                  onClick={() => setExpeditionFlightDone(true)}
                  className="absolute bottom-5 right-5 rounded-xl border border-white/15 bg-black/60 px-4 py-2 text-sm font-bold text-white/70 backdrop-blur transition hover:bg-black/80"
                >
                  Skip flight
                </button>
              </div>
            ) : (
              <div className="mt-4">
                <CanopyHunter
                  region={expeditionRegion}
                  permit={permitActive}
                  hot={expeditionRegion ? isHotRegion(expeditionRegion.id) : false}
                  portStopEnabled={portStopEnabled}
                  onCatch={handleExpeditionCatch}
                  onClose={closeExpedition}
                  onExitToGate={exitExpeditionToGate}
                />
              </div>
            )}
          </div>
        </div>
      ) : null}

      {initialsPrompt ? (
        <div role="dialog" aria-modal="true" aria-label="Choose your breeder initials" onClick={(event) => { if (event.target === event.currentTarget) setInitialsPrompt(false); }} className="fixed inset-0 z-[60] grid place-items-center bg-black/85 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-[28px] border border-amber-200/15 bg-[#0a130f] p-6 shadow-2xl">
            <div className="section-kicker">Your first clutch</div>
            <h2 className="mt-3 text-3xl font-semibold">Choose your breeder initials</h2>
            <p className="mt-3 text-sm leading-6 text-white/42">Choose 2–5 letters. They become part of every offspring ID you produce.</p>
            <input autoFocus value={initialsInput} onChange={(event) => setInitialsInput(event.target.value.replace(/[^a-z]/gi, "").toUpperCase().slice(0, 5))} maxLength={5} placeholder="ABB" className="mt-5 h-14 w-full rounded-2xl border border-white/[.09] bg-black/25 px-4 text-center text-2xl font-black uppercase tracking-[.25em] text-amber-100 outline-none" />
            {initialsStatus ? <div role="status" className="mt-3 text-sm text-amber-100/70">{initialsStatus}</div> : null}
            <div className="mt-6 flex justify-end gap-2"><button onClick={() => setInitialsPrompt(false)} className="rounded-xl border border-white/[.08] px-4 py-3 text-xs font-bold text-white/50">Cancel</button><button onClick={() => void claimBreederInitials()} className="rounded-xl bg-amber-200 px-5 py-3 text-xs font-black text-[#17130a]">Claim initials & start cycle</button></div>
          </div>
        </div>
      ) : null}

      {cinematicSeen ? (
        <div className="mt-10 pb-2 text-center">
          <button onClick={() => setReplayingIntro(true)} className="text-[11px] text-white/28 underline decoration-white/15 underline-offset-4 transition hover:text-white/55">Replay the intro</button>
        </div>
      ) : null}
    </div>
    </BreederGameScreenContext.Provider>
  );
}
