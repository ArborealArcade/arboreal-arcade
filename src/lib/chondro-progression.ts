export type ChondroTraitKey =
  | "highBlack"
  | "highWhite"
  | "blueStripe"
  | "yellowRetention"
  | "blotches";

export type ChondroSubspecies =
  | "Morelia azurea azurea"
  | "Morelia azurea pulcher"
  | "Morelia azurea utaraensis"
  | "Morelia viridis";

export type ChondroClassification = "Pure" | "Hybrid" | "Designer";
export type ChondroSource = "Captive Bred" | "Import";

export type ReputationRank = {
  id: string;
  name: string;
  minReputation: number;
  storeQualityBonus: number;
  saleBonus: number;
};

export const REPUTATION_RANKS: ReputationRank[] = [
  { id: "hobbyist", name: "Hobbyist", minReputation: 0, storeQualityBonus: 0, saleBonus: 0 },
  { id: "keeper", name: "Keeper", minReputation: 250, storeQualityBonus: 0.01, saleBonus: 0.01 },
  { id: "breeder", name: "Breeder", minReputation: 750, storeQualityBonus: 0.025, saleBonus: 0.025 },
  { id: "established", name: "Established Breeder", minReputation: 1800, storeQualityBonus: 0.04, saleBonus: 0.04 },
  { id: "regional", name: "Regional Breeder", minReputation: 3500, storeQualityBonus: 0.06, saleBonus: 0.06 },
  { id: "national", name: "National Breeder", minReputation: 6500, storeQualityBonus: 0.08, saleBonus: 0.08 },
  { id: "legacy", name: "Legacy Breeder", minReputation: 11000, storeQualityBonus: 0.1, saleBonus: 0.1 },
];

export type FacilityTier = {
  id: string;
  name: string;
  description: string;
  purchaseCost: number;
  reputationRequired: number;
  baseCapacityBonus: number;
  freeStoreScoutsPerSeason: number;
  clutchCapacityBonus: number;
};

export const FACILITY_TIERS: FacilityTier[] = [
  {
    id: "spare-room",
    name: "Spare Room Setup",
    description: "A compact home setup with just enough space to get a serious project started.",
    purchaseCost: 0,
    reputationRequired: 0,
    baseCapacityBonus: 0,
    freeStoreScoutsPerSeason: 0,
    clutchCapacityBonus: 0,
  },
  {
    id: "reptile-room",
    name: "Dedicated Reptile Room",
    description: "A climate-controlled room with better workflow and room for a growing collection.",
    purchaseCost: 25000,
    reputationRequired: 500,
    baseCapacityBonus: 8,
    freeStoreScoutsPerSeason: 1,
    clutchCapacityBonus: 1,
  },
  {
    id: "small-facility",
    name: "Small Breeding Facility",
    description: "Your first dedicated off-site operation with meaningful expansion potential.",
    purchaseCost: 75000,
    reputationRequired: 1500,
    baseCapacityBonus: 20,
    freeStoreScoutsPerSeason: 2,
    clutchCapacityBonus: 2,
  },
  {
    id: "professional-facility",
    name: "Professional Arboreal Facility",
    description: "A purpose-built breeding space with dedicated quarantine, incubation and grow-out areas.",
    purchaseCost: 180000,
    reputationRequired: 3500,
    baseCapacityBonus: 45,
    freeStoreScoutsPerSeason: 3,
    clutchCapacityBonus: 4,
  },
  {
    id: "research-center",
    name: "Arboreal Research Center",
    description: "A top-tier operation built around long-term lines, conservation projects and elite breeding stock.",
    purchaseCost: 450000,
    reputationRequired: 7500,
    baseCapacityBonus: 90,
    freeStoreScoutsPerSeason: 5,
    clutchCapacityBonus: 7,
  },
];

export type WardrobeUnlock = {
  id: string;
  name: string;
  description: string;
  reputationRequired: number;
  cashCost: number;
  prestige: number;
};

export const WARDROBE_UNLOCKS: WardrobeUnlock[] = [
  {
    id: "dojo-tee",
    name: "Chondro Dojo Tee",
    description: "The first breeder shirt. Purely cosmetic, but it marks the start of the operation.",
    reputationRequired: 0,
    cashCost: 250,
    prestige: 1,
  },
  {
    id: "keeper-hoodie",
    name: "Keeper Hoodie",
    description: "A clean hobbyist hoodie unlocked once the collection starts getting serious.",
    reputationRequired: 500,
    cashCost: 750,
    prestige: 2,
  },
  {
    id: "breeder-polo",
    name: "Embroidered Breeder Polo",
    description: "A professional breeder look for shows, expos and high-end sales.",
    reputationRequired: 1800,
    cashCost: 1500,
    prestige: 3,
  },
  {
    id: "expo-jacket",
    name: "Arboreal Planet Expo Jacket",
    description: "A prestige unlock for breeders known well beyond their local scene.",
    reputationRequired: 4500,
    cashCost: 4000,
    prestige: 5,
  },
  {
    id: "legacy-jacket",
    name: "Legacy Breeder Jacket",
    description: "A late-game cosmetic reserved for established lines and elite breeder reputation.",
    reputationRequired: 10000,
    cashCost: 10000,
    prestige: 8,
  },
];

export type BreedingProject = {
  id: string;
  name: string;
  description: string;
  rewardCash: number;
  rewardReputation: number;
  target: {
    subspecies?: ChondroSubspecies;
    classification?: ChondroClassification;
    locality?: string;
    generationAtLeast?: number;
    neonateColor?: "Red" | "Yellow";
    traits?: Partial<Record<ChondroTraitKey, number>>;
  };
};

export const BREEDING_PROJECTS: BreedingProject[] = [
  {
    id: "blue-utaraensis-90",
    name: "Blue Utaraensis Project",
    description: "Produce a pure Morelia azurea utaraensis with at least 90% Blue.",
    rewardCash: 15000,
    rewardReputation: 450,
    target: {
      subspecies: "Morelia azurea utaraensis",
      classification: "Pure",
      traits: { blueStripe: 90 },
    },
  },
  {
    id: "black-azurea-90",
    name: "High Black Azurea Line",
    description: "Produce a pure Morelia azurea azurea with at least 90% High Black.",
    rewardCash: 15000,
    rewardReputation: 450,
    target: {
      subspecies: "Morelia azurea azurea",
      classification: "Pure",
      traits: { highBlack: 90 },
    },
  },
  {
    id: "f3-locality",
    name: "F3 Locality Program",
    description: "Produce a third-generation or later pure locality animal.",
    rewardCash: 22000,
    rewardReputation: 650,
    target: { classification: "Pure", generationAtLeast: 3 },
  },
  {
    id: "dual-trait-designer",
    name: "Dual-Trait Designer",
    description: "Produce a designer animal with both Blue and High White at 80% or better.",
    rewardCash: 28000,
    rewardReputation: 800,
    target: {
      classification: "Designer",
      traits: { blueStripe: 80, highWhite: 80 },
    },
  },
  {
    id: "red-neonate-line",
    name: "Red Neonate Line",
    description: "Produce an F3 or later red neonate to prove the color is carrying through the project.",
    rewardCash: 18000,
    rewardReputation: 550,
    target: { generationAtLeast: 3, neonateColor: "Red" },
  },
  {
    id: "elite-five-trait",
    name: "Elite Five-Trait Animal",
    description: "Produce an animal with every tracked trait at 70% or higher.",
    rewardCash: 50000,
    rewardReputation: 1500,
    target: {
      traits: {
        highBlack: 70,
        highWhite: 70,
        blueStripe: 70,
        yellowRetention: 70,
        blotches: 70,
      },
    },
  },
];

export type MarketDemand = {
  season: number;
  hotTrait: ChondroTraitKey;
  coldTrait: ChondroTraitKey;
  hotTraitMultiplier: number;
  coldTraitMultiplier: number;
  captiveBredMultiplier: number;
  importMultiplier: number;
  pureMultiplier: number;
  designerMultiplier: number;
};

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

const TRAITS: ChondroTraitKey[] = [
  "highBlack",
  "highWhite",
  "blueStripe",
  "yellowRetention",
  "blotches",
];

export function marketDemandForSeason(season: number): MarketDemand {
  const random = seeded(season * 1217 + 411);
  const hotIndex = Math.floor(random() * TRAITS.length);
  let coldIndex = Math.floor(random() * TRAITS.length);
  if (coldIndex === hotIndex) coldIndex = (coldIndex + 1) % TRAITS.length;
  return {
    season,
    hotTrait: TRAITS[hotIndex],
    coldTrait: TRAITS[coldIndex],
    hotTraitMultiplier: 1.12 + random() * 0.12,
    coldTraitMultiplier: 0.84 + random() * 0.08,
    captiveBredMultiplier: 0.98 + random() * 0.1,
    importMultiplier: 0.88 + random() * 0.12,
    pureMultiplier: 1 + random() * 0.08,
    designerMultiplier: 0.98 + random() * 0.14,
  };
}

export function rankForReputation(reputation: number) {
  return [...REPUTATION_RANKS]
    .reverse()
    .find((rank) => reputation >= rank.minReputation) ?? REPUTATION_RANKS[0];
}

export function facilityForId(id: string | null | undefined) {
  return FACILITY_TIERS.find((facility) => facility.id === id) ?? FACILITY_TIERS[0];
}

export function nextFacility(currentId: string | null | undefined) {
  const index = FACILITY_TIERS.findIndex((facility) => facility.id === currentId);
  return FACILITY_TIERS[Math.min(FACILITY_TIERS.length - 1, Math.max(0, index) + 1)];
}

export function storeScoutCost(reputation: number, scoutsUsedThisSeason: number) {
  const rank = rankForReputation(reputation);
  const rankDiscount = Math.min(0.35, rank.storeQualityBonus * 2.5);
  const escalating = 3500 + scoutsUsedThisSeason * 1250;
  return Math.round((escalating * (1 - rankDiscount)) / 250) * 250;
}

export function facilityCapacityBonus(facilityId: string | null | undefined) {
  return facilityForId(facilityId).baseCapacityBonus;
}

export type ProjectCandidate = {
  subspecies: ChondroSubspecies;
  classification: ChondroClassification;
  locality: string;
  generation: number;
  neonateColor: "Red" | "Yellow";
  highBlack: number;
  highWhite: number;
  blueStripe: number;
  yellowRetention: number;
  blotches: number;
};

export function projectCompleted(project: BreedingProject, animal: ProjectCandidate) {
  const target = project.target;
  if (target.subspecies && animal.subspecies !== target.subspecies) return false;
  if (target.classification && animal.classification !== target.classification) return false;
  if (target.locality && animal.locality !== target.locality) return false;
  if (target.generationAtLeast && animal.generation < target.generationAtLeast) return false;
  if (target.neonateColor && animal.neonateColor !== target.neonateColor) return false;
  if (target.traits) {
    for (const [key, minimum] of Object.entries(target.traits) as Array<[ChondroTraitKey, number]>) {
      if (animal[key] < minimum) return false;
    }
  }
  return true;
}

export function breedingReputationGain(animal: ProjectCandidate) {
  const traits = [
    animal.highBlack,
    animal.highWhite,
    animal.blueStripe,
    animal.yellowRetention,
    animal.blotches,
  ];
  const strongest = Math.max(...traits);
  const eliteTraits = traits.filter((value) => value >= 85).length;
  let reputation = 8 + animal.generation * 2 + Math.floor(strongest / 10) + eliteTraits * 8;
  if (animal.classification === "Pure") reputation += 7;
  if (animal.classification === "Designer") reputation += 10;
  if (strongest >= 95) reputation += 18;
  if (strongest >= 100) reputation += 25;
  return Math.max(5, Math.round(reputation));
}

export function marketMultiplierForAnimal(
  demand: MarketDemand,
  animal: Pick<ProjectCandidate, ChondroTraitKey | "classification"> & { source: ChondroSource },
) {
  let multiplier = 1;
  if (animal[demand.hotTrait] >= 70) multiplier *= demand.hotTraitMultiplier;
  if (animal[demand.coldTrait] >= 70) multiplier *= demand.coldTraitMultiplier;
  multiplier *= animal.source === "Captive Bred" ? demand.captiveBredMultiplier : demand.importMultiplier;
  if (animal.classification === "Pure") multiplier *= demand.pureMultiplier;
  if (animal.classification === "Designer") multiplier *= demand.designerMultiplier;
  return multiplier;
}

export const CAREER_MILESTONES = [
  { id: "first-clutch", name: "First Clutch", description: "Produce your first clutch.", reputation: 100 },
  { id: "ten-clutches", name: "Ten Clutches", description: "Produce ten recorded clutches.", reputation: 350 },
  { id: "trait-90", name: "Elite Trait", description: "Produce any tracked trait at 90% or better.", reputation: 250 },
  { id: "trait-100", name: "Perfect Trait", description: "Produce a 100% tracked trait animal.", reputation: 500 },
  { id: "f3", name: "Established Line", description: "Produce an F3 animal.", reputation: 400 },
  { id: "facility", name: "Facility Upgrade", description: "Move beyond the starter room.", reputation: 250 },
  { id: "six-figures", name: "Six-Figure Breeder", description: "Reach $100,000 in lifetime animal sales.", reputation: 600 },
] as const;
