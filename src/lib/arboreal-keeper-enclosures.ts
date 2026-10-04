import type { KeeperLifeStage, KeeperSpeciesId } from "@/lib/arboreal-keeper-species";

export type KeeperEnclosureId = "chondro-dojo-bin" | "pvc-arboreal-medium";

export type LegacyKeeperEnclosureId =
  | KeeperEnclosureId
  | "neonate-arboreal-tub"
  | "glass-arboreal-medium"
  | "glass-arboreal-large";

export type KeeperEnclosureDefinition = {
  id: KeeperEnclosureId;
  displayName: string;
  habitatProfile: "arboreal-tropical";
  sizeClass: "small" | "medium";
  price: number;
  compatibleSpecies: Partial<Record<KeeperSpeciesId, KeeperLifeStage[]>>;
  baseCapacity: number;
  cohabitationCapable: boolean;
  customizationSlots: {
    primaryPerch: number;
    secondaryPerch: number;
    plants: number;
    background: number;
    water: number;
    environmentalEquipment: number;
  };
};

export const ARBOREAL_KEEPER_ENCLOSURES: KeeperEnclosureDefinition[] = [
  {
    id: "chondro-dojo-bin",
    displayName: "Chondro Dojo 2 Stack",
    habitatProfile: "arboreal-tropical",
    sizeClass: "small",
    price: 250,
    compatibleSpecies: {
      green_tree_python: ["neonate", "subadult", "adult"],
      northern_emerald_tree_boa: ["neonate"],
      amazon_basin_emerald_tree_boa: ["neonate"],
    },
    baseCapacity: 1,
    cohabitationCapable: false,
    customizationSlots: {
      primaryPerch: 1,
      secondaryPerch: 1,
      plants: 2,
      background: 1,
      water: 1,
      environmentalEquipment: 1,
    },
  },
  {
    id: "pvc-arboreal-medium",
    displayName: "PVC Enclosure",
    habitatProfile: "arboreal-tropical",
    sizeClass: "medium",
    price: 650,
    compatibleSpecies: {
      green_tree_python: ["subadult", "adult"],
      northern_emerald_tree_boa: ["subadult", "adult"],
      amazon_basin_emerald_tree_boa: ["subadult", "adult"],
    },
    baseCapacity: 1,
    cohabitationCapable: false,
    customizationSlots: {
      primaryPerch: 1,
      secondaryPerch: 2,
      plants: 4,
      background: 1,
      water: 1,
      environmentalEquipment: 2,
    },
  },
];

/**
 * Converts housing IDs from earlier Arboreal Keeper prototypes to one of the
 * two enclosure products that remain in the game. This preserves existing
 * saves without leaving retired enclosure products in the shop or UI.
 */
export function normalizeKeeperEnclosureId(value: unknown): KeeperEnclosureId | null {
  if (value === "chondro-dojo-bin" || value === "neonate-arboreal-tub") {
    return "chondro-dojo-bin";
  }
  if (
    value === "pvc-arboreal-medium" ||
    value === "glass-arboreal-medium" ||
    value === "glass-arboreal-large"
  ) {
    return "pvc-arboreal-medium";
  }
  return null;
}

export function enclosureSupportsAnimal(
  enclosureId: KeeperEnclosureId,
  speciesId: KeeperSpeciesId,
  stage: KeeperLifeStage,
) {
  const enclosure = ARBOREAL_KEEPER_ENCLOSURES.find((item) => item.id === enclosureId);
  return Boolean(enclosure?.compatibleSpecies[speciesId]?.includes(stage));
}

export function enclosureCapacityForSpecies(
  enclosureId: KeeperEnclosureId,
  speciesId: KeeperSpeciesId,
) {
  const enclosure = ARBOREAL_KEEPER_ENCLOSURES.find((item) => item.id === enclosureId);
  if (!enclosure?.compatibleSpecies[speciesId]) return 0;
  return enclosure.cohabitationCapable ? enclosure.baseCapacity : 1;
}
