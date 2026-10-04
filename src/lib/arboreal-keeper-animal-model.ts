import type { KeeperLifeStage, KeeperSpeciesId } from "@/lib/arboreal-keeper-species";
import type { EmeraldAnimal } from "@/lib/arboreal-keeper-emerald-engine";

export type KeeperAnimalSex = "Male" | "Female" | "Unknown";
export type KeeperAnimalCondition = "Excellent" | "Good" | "Fair" | "Unknown";
export type KeeperAnimalSourceSystem = "gtp-legacy" | "emerald";

export type KeeperAnimalCore = {
  id: string;
  speciesId: KeeperSpeciesId;
  name: string;
  sex: KeeperAnimalSex;
  lifeStage: KeeperLifeStage | "unknown";
  generation: number;
  parentIds: string[];
  condition: KeeperAnimalCondition;
  notes: string;
  sourceSystem: KeeperAnimalSourceSystem;
};

export type GreenTreePythonSpeciesData = {
  kind: "green_tree_python";
  subspecies: string | null;
  locality: string | null;
  classification: string | null;
  neonateColor: "Red" | "Yellow" | null;
  traits: {
    highBlack: number;
    highWhite: number;
    blueStripe: number;
    yellowRetention: number;
    blotches: number;
  };
};

export type EmeraldTreeBoaSpeciesData = {
  kind: "emerald_tree_boa";
  phase: "standard" | "anaconda";
  neonateColor: string | null;
  assetId: string | null;
  traits: Record<string, number>;
};

export type KeeperAnimalRecord = KeeperAnimalCore & {
  speciesData: GreenTreePythonSpeciesData | EmeraldTreeBoaSpeciesData;
};

export type LegacyGtpAnimalInput = {
  id: string;
  name?: string;
  sex?: string;
  lifeStage?: string;
  locality?: string;
  subspecies?: string;
  neonateColor?: "Red" | "Yellow";
  generation?: number;
  classification?: string;
  ancestry?: Record<string, number>;
  localityAncestry?: Record<string, number>;
  phenotypeScore?: number;
  highBlack?: number;
  highWhite?: number;
  blueStripe?: number;
  yellowRetention?: number;
  blotches?: number;
  parentIds?: string[];
  condition?: string;
  notes?: string;
};

function finiteNumber(value: unknown, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function normalizeKeeperLifeStage(stage: string | null | undefined): KeeperAnimalCore["lifeStage"] {
  const normalized = String(stage ?? "").trim().toLowerCase();
  if (normalized === "hatchling" || normalized === "neonate") return "neonate";
  if (normalized === "subadult" || normalized === "sub-adult") return "subadult";
  if (normalized === "adult") return "adult";
  return "unknown";
}

export function keeperLifeStageLabel(stage: KeeperAnimalCore["lifeStage"]) {
  if (stage === "neonate") return "Neonate";
  if (stage === "subadult") return "Subadult";
  if (stage === "adult") return "Adult";
  return "Unknown";
}

export function normalizeKeeperSex(sex: string | null | undefined): KeeperAnimalSex {
  if (sex === "Male") return "Male";
  if (sex === "Female") return "Female";
  return "Unknown";
}

export function normalizeKeeperCondition(condition: string | null | undefined): KeeperAnimalCondition {
  if (condition === "Excellent" || condition === "Good" || condition === "Fair") return condition;
  return "Unknown";
}

export function keeperAnimalFromGtp(animal: LegacyGtpAnimalInput): KeeperAnimalRecord {
  return {
    id: animal.id,
    speciesId: "green_tree_python",
    name: animal.name || "Unnamed Green Tree Python",
    sex: normalizeKeeperSex(animal.sex),
    lifeStage: normalizeKeeperLifeStage(animal.lifeStage),
    generation: Math.max(1, Math.floor(finiteNumber(animal.generation, 1))),
    parentIds: Array.isArray(animal.parentIds) ? animal.parentIds.filter((id): id is string => typeof id === "string") : [],
    condition: normalizeKeeperCondition(animal.condition),
    notes: typeof animal.notes === "string" ? animal.notes : "",
    sourceSystem: "gtp-legacy",
    speciesData: {
      kind: "green_tree_python",
      subspecies: animal.subspecies ?? null,
      locality: animal.locality ?? null,
      classification: animal.classification ?? null,
      neonateColor: animal.neonateColor ?? null,
      traits: {
        highBlack: finiteNumber(animal.highBlack),
        highWhite: finiteNumber(animal.highWhite),
        blueStripe: finiteNumber(animal.blueStripe),
        yellowRetention: finiteNumber(animal.yellowRetention),
        blotches: finiteNumber(animal.blotches),
      },
    },
  };
}

export function keeperAnimalFromEmerald(animal: EmeraldAnimal): KeeperAnimalRecord {
  return {
    id: animal.id,
    speciesId: animal.speciesId,
    name: animal.name,
    sex: normalizeKeeperSex(animal.sex),
    lifeStage: normalizeKeeperLifeStage(animal.lifeStage),
    generation: Math.max(1, Math.floor(finiteNumber(animal.generation, 1))),
    parentIds: Array.isArray(animal.parentIds) ? animal.parentIds : [],
    condition: normalizeKeeperCondition(animal.condition),
    notes: animal.notes ?? "",
    sourceSystem: "emerald",
    speciesData: {
      kind: "emerald_tree_boa",
      phase: animal.phase,
      neonateColor: animal.neonateColor ?? null,
      assetId: animal.assetId ?? null,
      traits: Object.fromEntries(Object.entries(animal.traits).map(([key, value]) => [key, finiteNumber(value)])),
    },
  };
}

export function keeperAnimalSearchText(animal: KeeperAnimalRecord) {
  const shared = [animal.name, animal.speciesId, animal.sex, keeperLifeStageLabel(animal.lifeStage)];
  if (animal.speciesData.kind === "green_tree_python") {
    return [...shared, animal.speciesData.subspecies, animal.speciesData.locality, animal.speciesData.classification]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
  }
  return [...shared, animal.speciesData.phase, animal.speciesData.neonateColor]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}
