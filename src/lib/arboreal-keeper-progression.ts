import type { KeeperSpeciesId } from "@/lib/arboreal-keeper-species";

export type KeeperUnlockKind =
  | "species"
  | "enclosure"
  | "equipment"
  | "facility"
  | "decor"
  | "certification";

export type KeeperUnlock = {
  id: string;
  label: string;
  kind: KeeperUnlockKind;
  description: string;
  speciesId?: KeeperSpeciesId;
};

export type KeeperLevelMilestone = {
  level: number;
  rankName?: string;
  unlocks: KeeperUnlock[];
};

export const MAX_KEEPER_LEVEL = 50;

export const KEEPER_LEVEL_MILESTONES: KeeperLevelMilestone[] = [
  {
    level: 1,
    rankName: "Keeper",
    unlocks: [
      {
        id: "species-green-tree-python",
        label: "Green Tree Python Program",
        kind: "species",
        speciesId: "green_tree_python",
        description: "Begin the original Arboreal Planet breeding program.",
      },
      {
        id: "enclosure-chondro-dojo-bin",
        label: "Chondro Dojo Bin",
        kind: "enclosure",
        description: "Starter arboreal housing for eligible Green Tree Pythons.",
      },
      {
        id: "decor-basic-perches",
        label: "Basic Perch Set",
        kind: "decor",
        description: "Simple functional perch options for starter enclosures.",
      },
    ],
  },
  {
    level: 5,
    unlocks: [
      {
        id: "enclosure-medium-vivarium",
        label: "Medium Arboreal Vivarium",
        kind: "enclosure",
        description: "A cross-compatible tropical enclosure with expanded customization slots.",
      },
      {
        id: "decor-natural-branch-pack",
        label: "Natural Branch Pack",
        kind: "decor",
        description: "Naturalistic perch options for display and grow-out setups.",
      },
      {
        id: "equipment-basic-misting",
        label: "Basic Misting Equipment",
        kind: "equipment",
        description: "A first environmental-control upgrade for tropical rooms.",
      },
    ],
  },
  {
    level: 8,
    rankName: "Advanced Keeper",
    unlocks: [
      {
        id: "species-northern-emerald-tree-boa",
        label: "Northern Emerald Tree Boa Program",
        kind: "species",
        speciesId: "northern_emerald_tree_boa",
        description: "Unlock a live-bearing Corallus breeding program, including the rare Anaconda Phase.",
      },
      {
        id: "decor-orchid-pack",
        label: "Orchid Pack",
        kind: "decor",
        description: "Add orchid accents to compatible tropical enclosures.",
      },
    ],
  },
  {
    level: 12,
    unlocks: [
      {
        id: "facility-growout-room",
        label: "Dedicated Grow-Out Room",
        kind: "facility",
        description: "Expand the facility with a room dedicated to growing animals toward adult housing.",
      },
      {
        id: "equipment-environment-controller",
        label: "Environmental Controller",
        kind: "equipment",
        description: "Improve environmental stability across compatible enclosure banks.",
      },
    ],
  },
  {
    level: 18,
    rankName: "Specialist Keeper",
    unlocks: [
      {
        id: "species-amazon-basin-emerald-tree-boa",
        label: "Amazon Basin Emerald Tree Boa Program",
        kind: "species",
        speciesId: "amazon_basin_emerald_tree_boa",
        description: "Unlock the premium Amazon Basin Corallus breeding program.",
      },
      {
        id: "enclosure-large-display",
        label: "Large Arboreal Display",
        kind: "enclosure",
        description: "A premium large enclosure shared by eligible adult arboreal species.",
      },
      {
        id: "decor-premium-tropical-pack",
        label: "Premium Tropical Plant Pack",
        kind: "decor",
        description: "Expanded bromeliad, fern, aroid and vine options for display enclosures.",
      },
    ],
  },
  {
    level: 25,
    rankName: "Breeder",
    unlocks: [
      {
        id: "facility-breeding-wing",
        label: "Breeding Wing",
        kind: "facility",
        description: "Expand the shared facility with more dedicated breeding-room capacity.",
      },
      {
        id: "equipment-advanced-climate",
        label: "Advanced Climate Control",
        kind: "equipment",
        description: "Higher-tier environmental management for demanding species.",
      },
    ],
  },
  {
    level: 35,
    rankName: "Specialist Breeder",
    unlocks: [
      {
        id: "facility-specialist-wing",
        label: "Specialist Species Wing",
        kind: "facility",
        description: "Prepare dedicated space for future high-difficulty arboreal programs.",
      },
      {
        id: "certification-advanced-husbandry",
        label: "Advanced Husbandry Certification",
        kind: "certification",
        description: "Qualify for future specialist animals and conservation projects.",
      },
    ],
  },
  {
    level: 45,
    rankName: "Conservation Specialist",
    unlocks: [
      {
        id: "facility-conservation-wing",
        label: "Conservation Wing",
        kind: "facility",
        description: "Create space for invitation-only and certification-gated programs.",
      },
    ],
  },
  {
    level: 50,
    rankName: "Arboreal Master",
    unlocks: [
      {
        id: "certification-fiji-iguana",
        label: "Fiji Iguana Conservation Certificate",
        kind: "certification",
        description: "Unlock eligibility for the future Fiji Iguana conservation program once its facility requirements are met.",
      },
    ],
  },
];

export function keeperLevelFromReputation(reputation: number) {
  const safeReputation = Math.max(0, reputation);
  const level = Math.floor(Math.sqrt(safeReputation / 5)) + 1;
  return Math.max(1, Math.min(MAX_KEEPER_LEVEL, level));
}

export function unlocksAtKeeperLevel(level: number) {
  return KEEPER_LEVEL_MILESTONES.find((milestone) => milestone.level === level)?.unlocks ?? [];
}

export function availableUnlocksThroughLevel(level: number) {
  return KEEPER_LEVEL_MILESTONES.filter((milestone) => milestone.level <= level).flatMap(
    (milestone) => milestone.unlocks,
  );
}

export function nextKeeperMilestone(level: number) {
  return KEEPER_LEVEL_MILESTONES.find((milestone) => milestone.level > level) ?? null;
}
