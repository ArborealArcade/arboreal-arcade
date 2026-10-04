import {
  ARBOREAL_KEEPER_SPECIES_BY_ID,
  assetsForStage,
  type KeeperAssetVariant,
  type KeeperLifeStage,
  type KeeperPhase,
} from "@/lib/arboreal-keeper-species";
import { emeraldArtForAnimal } from "@/lib/arboreal-keeper-emerald-art";
import {
  ARBOREAL_KEEPER_ENCLOSURES,
  enclosureSupportsAnimal,
  type KeeperEnclosureId,
} from "@/lib/arboreal-keeper-enclosures";

export type EmeraldSpeciesId =
  | "northern_emerald_tree_boa"
  | "amazon_basin_emerald_tree_boa";

export type EmeraldSex = "Male" | "Female";
export type EmeraldCondition = "Excellent" | "Good" | "Fair";
export type EmeraldNeonateColor = "red" | "green" | "orange" | "yellow";

export type EmeraldTraitKey =
  | "whiteAmount"
  | "whiteStructure"
  | "whiteConnectivity"
  | "dorsalStripe"
  | "patternDensity"
  | "patternCleanliness"
  | "contrast"
  | "greenSaturation"
  | "darkGreen"
  | "yellowGreen"
  | "darkEdging"
  | "speckling"
  | "redIntensity"
  | "orangeIntensity"
  | "darkRed";

export type EmeraldAnimal = {
  id: string;
  name: string;
  speciesId: EmeraldSpeciesId;
  sex: EmeraldSex;
  lifeStage: KeeperLifeStage;
  phase: KeeperPhase;
  neonateColor: EmeraldNeonateColor | null;
  traits: Partial<Record<EmeraldTraitKey, number>>;
  generation: number;
  parentIds: string[];
  condition: EmeraldCondition;
  assetId: string | null;
  assetPath: string | null;
  notes: string;
  createdAt: number;
};

export type EmeraldMarketOffer = {
  id: string;
  animal: EmeraldAnimal;
  price: number;
  available: boolean;
};

export type EmeraldBreedingStage = "pairing" | "ovulation" | "gestation" | "birth";

export type EmeraldBreedingJob = {
  id: string;
  speciesId: EmeraldSpeciesId;
  damId: string;
  sireId: string;
  stage: EmeraldBreedingStage;
  startedAt: number;
  completesAt: number;
  seed: number;
};

export type EmeraldLitterRecord = {
  id: string;
  speciesId: EmeraldSpeciesId;
  damId: string;
  sireId: string;
  offspringIds: string[];
  bornAt: number;
  seasonLabel: string;
};

export type EmeraldHousingUnit = {
  id: string;
  enclosureId: KeeperEnclosureId;
  occupantId: string | null;
};

export type EmeraldKeeperSave = {
  animals: EmeraldAnimal[];
  purchasedOfferIds: string[];
  breedingJobs: EmeraldBreedingJob[];
  litters: EmeraldLitterRecord[];
  housingUnits: EmeraldHousingUnit[];
  selectedSpecies: EmeraldSpeciesId;
  updatedAt: number;
};

export const EMERALD_KEEPER_SAVE_KEY = "arboreal_keeper_emeralds_v1";
export const EMERALD_MARKET_DAY_MS = 86_400_000;
const EMERALD_V3_ATLAS_PATH = "/hatchery/animals/emerald-tree-boas/emerald-atlas-v3.webp";

const HOUR_MS = 3_600_000;

export const EMERALD_BREEDING_STAGES: Array<{
  id: EmeraldBreedingStage;
  label: string;
  durationMs: number;
}> = [
  { id: "pairing", label: "Pairing", durationMs: 4 * HOUR_MS },
  { id: "ovulation", label: "Ovulation", durationMs: 8 * HOUR_MS },
  { id: "gestation", label: "Gestation", durationMs: 24 * HOUR_MS },
  { id: "birth", label: "Birth", durationMs: 2 * HOUR_MS },
];

export const EMERALD_TRAIT_LABELS: Record<EmeraldTraitKey, string> = {
  whiteAmount: "White Amount",
  whiteStructure: "White Structure",
  whiteConnectivity: "White Connectivity",
  dorsalStripe: "Dorsal Stripe",
  patternDensity: "Pattern Density",
  patternCleanliness: "Pattern Cleanliness",
  contrast: "Contrast",
  greenSaturation: "Green Saturation",
  darkGreen: "Dark Green",
  yellowGreen: "Yellow-Green",
  darkEdging: "Dark Edging",
  speckling: "Speckling",
  redIntensity: "Red Intensity",
  orangeIntensity: "Orange Intensity",
  darkRed: "Dark Red",
};

const TRAITS_BY_SPECIES: Record<EmeraldSpeciesId, EmeraldTraitKey[]> = {
  northern_emerald_tree_boa: [
    "whiteAmount",
    "whiteStructure",
    "patternDensity",
    "contrast",
    "greenSaturation",
    "darkEdging",
    "speckling",
    "redIntensity",
    "orangeIntensity",
    "darkRed",
  ],
  amazon_basin_emerald_tree_boa: [
    "whiteAmount",
    "whiteConnectivity",
    "dorsalStripe",
    "patternDensity",
    "patternCleanliness",
    "contrast",
    "greenSaturation",
    "darkGreen",
    "yellowGreen",
    "speckling",
  ],
};

const BASE_MARKET_VALUE: Record<EmeraldSpeciesId, number> = {
  northern_emerald_tree_boa: 4200,
  amazon_basin_emerald_tree_boa: 6800,
};

const LITTER_RANGE: Record<EmeraldSpeciesId, readonly [number, number]> = {
  northern_emerald_tree_boa: [5, 11],
  amazon_basin_emerald_tree_boa: [4, 9],
};

export const EMPTY_EMERALD_KEEPER_SAVE: EmeraldKeeperSave = {
  animals: [],
  purchasedOfferIds: [],
  breedingJobs: [],
  litters: [],
  housingUnits: [],
  selectedSpecies: "northern_emerald_tree_boa",
  updatedAt: 0,
};

function clamp(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function hashString(value: string) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function seededRandom(seed: number) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomBetween(random: () => number, min: number, max: number) {
  return min + random() * (max - min);
}

function randomInt(random: () => number, min: number, max: number) {
  return Math.floor(randomBetween(random, min, max + 1));
}

function rollTrait(random: () => number) {
  const roll = random();
  if (roll < 0.35) return 0;
  if (roll < 0.68) return randomInt(random, 1, 18);
  if (roll < 0.88) return randomInt(random, 19, 40);
  if (roll < 0.97) return randomInt(random, 41, 65);
  if (roll < 0.995) return randomInt(random, 66, 84);
  return randomInt(random, 85, 100);
}

function marketTraitSet(speciesId: EmeraldSpeciesId, random: () => number) {
  return Object.fromEntries(
    TRAITS_BY_SPECIES[speciesId].map((key) => [key, rollTrait(random)]),
  ) as Partial<Record<EmeraldTraitKey, number>>;
}

function assetForAnimal(
  speciesId: EmeraldSpeciesId,
  lifeStage: KeeperLifeStage,
  phase: KeeperPhase,
  neonateColor: EmeraldNeonateColor | null,
  random: () => number,
): KeeperAssetVariant | null {
  const assets = assetsForStage(speciesId, lifeStage, phase);
  if (!assets.length) return null;
  const colorMatched = neonateColor
    ? assets.filter((asset) => !asset.neonateColor || asset.neonateColor === neonateColor)
    : assets;
  const pool = colorMatched.length ? colorMatched : assets;
  return pool[Math.floor(random() * pool.length)] ?? pool[0] ?? null;
}

function randomNeonateColor(
  speciesId: EmeraldSpeciesId,
  phase: KeeperPhase,
  random: () => number,
): EmeraldNeonateColor {
  if (speciesId === "northern_emerald_tree_boa") {
    if (phase === "anaconda") return "green";
    return "red";
  }
  const colors: EmeraldNeonateColor[] = ["red", "orange", "yellow"];
  return colors[Math.floor(random() * colors.length)] ?? "red";
}

function marketPhase(speciesId: EmeraldSpeciesId, random: () => number): KeeperPhase {
  if (speciesId !== "northern_emerald_tree_boa") return "standard";
  return random() < 0.035 ? "anaconda" : "standard";
}

function phaseForOffspring(
  speciesId: EmeraldSpeciesId,
  dam: EmeraldAnimal,
  sire: EmeraldAnimal,
  random: () => number,
): KeeperPhase {
  if (speciesId !== "northern_emerald_tree_boa") return "standard";

  // Gameplay placeholder until the project's final phase inheritance model is locked.
  const phaseParents = Number(dam.phase === "anaconda") + Number(sire.phase === "anaconda");
  const chance = phaseParents === 2 ? 0.72 : phaseParents === 1 ? 0.28 : 0.005;
  return random() < chance ? "anaconda" : "standard";
}

export function createEmeraldAnimal(args: {
  id: string;
  speciesId: EmeraldSpeciesId;
  sex: EmeraldSex;
  lifeStage: KeeperLifeStage;
  phase: KeeperPhase;
  neonateColor: EmeraldNeonateColor | null;
  traits: Partial<Record<EmeraldTraitKey, number>>;
  generation?: number;
  parentIds?: string[];
  condition?: EmeraldCondition;
  name?: string;
  createdAt?: number;
  random?: () => number;
}) {
  const random = args.random ?? seededRandom(hashString(args.id));
  const asset = emeraldArtForAnimal(
    args.speciesId,
    args.lifeStage,
    args.phase,
    args.neonateColor,
    random,
  );

  return {
    id: args.id,
    name: args.name ?? ARBOREAL_KEEPER_SPECIES_BY_ID[args.speciesId].displayName,
    speciesId: args.speciesId,
    sex: args.sex,
    lifeStage: args.lifeStage,
    phase: args.phase,
    neonateColor: args.neonateColor,
    traits: Object.fromEntries(
      Object.entries(args.traits).map(([key, value]) => [key, clamp(Number(value ?? 0))]),
    ) as Partial<Record<EmeraldTraitKey, number>>,
    generation: Math.max(1, Math.round(args.generation ?? 1)),
    parentIds: args.parentIds ?? [],
    condition: args.condition ?? "Good",
    assetId: asset?.id ?? null,
    assetPath: asset ? EMERALD_V3_ATLAS_PATH : null,
    notes: "",
    createdAt: args.createdAt ?? Date.now(),
  } satisfies EmeraldAnimal;
}

export function emeraldMarketForEpoch(epoch: number, keeperLevel: number): EmeraldMarketOffer[] {
  const random = seededRandom(epoch * 6151 + 1207);
  const availableSpecies = ([
    "northern_emerald_tree_boa",
    "amazon_basin_emerald_tree_boa",
  ] as EmeraldSpeciesId[]).filter(
    (speciesId) => keeperLevel >= ARBOREAL_KEEPER_SPECIES_BY_ID[speciesId].unlockLevel,
  );

  if (!availableSpecies.length) return [];

  return Array.from({ length: 8 }, (_, index) => {
    const speciesId = availableSpecies[index % availableSpecies.length] ?? availableSpecies[0];
    const lifeStage: KeeperLifeStage = random() < 0.68 ? "adult" : "subadult";
    const phase = marketPhase(speciesId, random);
    const neonateColor = null;
    const id = `emerald-market-${epoch}-${speciesId}-${index}`;
    const animal = createEmeraldAnimal({
      id,
      speciesId,
      sex: random() < 0.5 ? "Male" : "Female",
      lifeStage,
      phase,
      neonateColor,
      traits: marketTraitSet(speciesId, random),
      condition: random() < 0.25 ? "Excellent" : "Good",
      random,
    });
    return {
      id,
      animal,
      price: emeraldMarketValue(animal),
      available: true,
    };
  });
}

export function emeraldMarketValue(animal: EmeraldAnimal) {
  const values = Object.values(animal.traits).map((value) => Number(value ?? 0));
  const strongest = values.length ? Math.max(...values) : 0;
  const strongTraits = values.filter((value) => value >= 65).length;
  const stageMultiplier = animal.lifeStage === "adult" ? 1 : animal.lifeStage === "subadult" ? 0.72 : 0.42;
  const conditionMultiplier = animal.condition === "Excellent" ? 1.08 : animal.condition === "Fair" ? 0.82 : 1;
  const phaseMultiplier = animal.phase === "anaconda" ? 2.8 : 1;
  const traitMultiplier = 1 + strongest / 350 + strongTraits * 0.08;
  return Math.round(
    (BASE_MARKET_VALUE[animal.speciesId] * stageMultiplier * conditionMultiplier * phaseMultiplier * traitMultiplier) /
      50,
  ) * 50;
}

function inheritedTrait(
  damValue: number,
  sireValue: number,
  random: () => number,
) {
  const midpoint = (damValue + sireValue) / 2;
  const spread = randomBetween(random, -14, 14);
  const rarePush = random() < 0.025 ? randomBetween(random, 6, 18) : 0;
  return clamp(midpoint + spread + rarePush);
}

export function generateEmeraldLitter(args: {
  dam: EmeraldAnimal;
  sire: EmeraldAnimal;
  seed: number;
  bornAt?: number;
}) {
  const { dam, sire } = args;
  if (dam.speciesId !== sire.speciesId) throw new Error("Emerald Tree Boa pairings must use the same species.");
  if (dam.sex !== "Female" || sire.sex !== "Male") throw new Error("Emerald Tree Boa pairing requires a female dam and male sire.");
  if (dam.lifeStage !== "adult" || sire.lifeStage !== "adult") throw new Error("Only adult Emerald Tree Boas can breed.");

  const speciesId = dam.speciesId;
  const random = seededRandom(args.seed);
  const [minimum, maximum] = LITTER_RANGE[speciesId];
  const litterSize = randomInt(random, minimum, maximum);
  const bornAt = args.bornAt ?? Date.now();
  const traitKeys = TRAITS_BY_SPECIES[speciesId];
  const generation = Math.max(dam.generation, sire.generation) + 1;

  return Array.from({ length: litterSize }, (_, index) => {
    const phase = phaseForOffspring(speciesId, dam, sire, random);
    const neonateColor = randomNeonateColor(speciesId, phase, random);
    const traits = Object.fromEntries(
      traitKeys.map((key) => [
        key,
        inheritedTrait(Number(dam.traits[key] ?? 0), Number(sire.traits[key] ?? 0), random),
      ]),
    ) as Partial<Record<EmeraldTraitKey, number>>;
    const id = `emerald-offspring-${args.seed}-${index}`;
    return createEmeraldAnimal({
      id,
      speciesId,
      sex: random() < 0.5 ? "Male" : "Female",
      lifeStage: "neonate",
      phase,
      neonateColor,
      traits,
      generation,
      parentIds: [dam.id, sire.id],
      condition: "Good",
      createdAt: bornAt,
      random,
    });
  });
}

export function startEmeraldBreedingJob(args: {
  dam: EmeraldAnimal;
  sire: EmeraldAnimal;
  now?: number;
}) {
  const now = args.now ?? Date.now();
  const firstStage = EMERALD_BREEDING_STAGES[0];
  if (args.dam.speciesId !== args.sire.speciesId) throw new Error("Pair animals from the same Emerald Tree Boa species.");
  if (args.dam.sex !== "Female" || args.sire.sex !== "Male") throw new Error("Select an adult female and adult male.");
  if (args.dam.lifeStage !== "adult" || args.sire.lifeStage !== "adult") throw new Error("Both breeders must be adults.");
  const seed = hashString(`${args.dam.id}:${args.sire.id}:${now}`);
  return {
    id: `emerald-breeding-${seed}`,
    speciesId: args.dam.speciesId,
    damId: args.dam.id,
    sireId: args.sire.id,
    stage: firstStage.id,
    startedAt: now,
    completesAt: now + firstStage.durationMs,
    seed,
  } satisfies EmeraldBreedingJob;
}

export function advanceEmeraldBreedingJob(job: EmeraldBreedingJob, now = Date.now()) {
  if (now < job.completesAt) return { job, completed: false as const };
  const currentIndex = EMERALD_BREEDING_STAGES.findIndex((stage) => stage.id === job.stage);
  const next = EMERALD_BREEDING_STAGES[currentIndex + 1];
  if (!next) return { job: null, completed: true as const };
  return {
    completed: false as const,
    job: {
      ...job,
      stage: next.id,
      startedAt: now,
      completesAt: now + next.durationMs,
    },
  };
}

export function breedingStageLabel(stage: EmeraldBreedingStage) {
  return EMERALD_BREEDING_STAGES.find((item) => item.id === stage)?.label ?? stage;
}

export function eligibleEmeraldEnclosures(animal: Pick<EmeraldAnimal, "speciesId" | "lifeStage">) {
  return ARBOREAL_KEEPER_ENCLOSURES.filter((enclosure) =>
    enclosureSupportsAnimal(enclosure.id, animal.speciesId, animal.lifeStage),
  );
}

export function availableHousingUnit(
  save: Pick<EmeraldKeeperSave, "housingUnits">,
  animal: Pick<EmeraldAnimal, "speciesId" | "lifeStage">,
) {
  return save.housingUnits.find(
    (unit) =>
      unit.occupantId === null &&
      enclosureSupportsAnimal(unit.enclosureId, animal.speciesId, animal.lifeStage),
  ) ?? null;
}

export function sanitizeEmeraldKeeperSave(value: unknown): EmeraldKeeperSave {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { ...EMPTY_EMERALD_KEEPER_SAVE };
  const input = value as Partial<EmeraldKeeperSave>;
  return {
    animals: Array.isArray(input.animals) ? input.animals : [],
    purchasedOfferIds: Array.isArray(input.purchasedOfferIds) ? input.purchasedOfferIds : [],
    breedingJobs: Array.isArray(input.breedingJobs) ? input.breedingJobs : [],
    litters: Array.isArray(input.litters) ? input.litters : [],
    housingUnits: Array.isArray(input.housingUnits) ? input.housingUnits : [],
    selectedSpecies:
      input.selectedSpecies === "amazon_basin_emerald_tree_boa"
        ? "amazon_basin_emerald_tree_boa"
        : "northern_emerald_tree_boa",
    updatedAt: Number.isFinite(Number(input.updatedAt)) ? Number(input.updatedAt) : 0,
  };
}

export function nextLifeStage(stage: KeeperLifeStage): KeeperLifeStage | null {
  if (stage === "neonate") return "subadult";
  if (stage === "subadult") return "adult";
  return null;
}

export function growthCostForEmerald(animal: EmeraldAnimal) {
  if (animal.lifeStage === "neonate") return animal.speciesId === "amazon_basin_emerald_tree_boa" ? 1800 : 1400;
  if (animal.lifeStage === "subadult") return animal.speciesId === "amazon_basin_emerald_tree_boa" ? 3400 : 2800;
  return 0;
}

export function growEmeraldAnimal(animal: EmeraldAnimal) {
  const next = nextLifeStage(animal.lifeStage);
  if (!next) return animal;
  const random = seededRandom(hashString(`${animal.id}:${next}:${Date.now()}`));
  const asset = emeraldArtForAnimal(animal.speciesId, next, animal.phase, null, random);
  return {
    ...animal,
    lifeStage: next,
    neonateColor: next === "neonate" ? animal.neonateColor : null,
    assetId: asset?.id ?? animal.assetId,
    assetPath: asset ? EMERALD_V3_ATLAS_PATH : animal.assetPath,
  };
}

export function emeraldSpeciesDisplayName(speciesId: EmeraldSpeciesId) {
  return ARBOREAL_KEEPER_SPECIES_BY_ID[speciesId].displayName;
}
