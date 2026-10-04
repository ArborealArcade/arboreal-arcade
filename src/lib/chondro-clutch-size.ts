export type ClutchPairingAnimal = {
  subspecies: string;
  classification: "Pure" | "Hybrid" | "Designer";
  locality: string;
  condition?: "Excellent" | "Good" | "Fair";
};

export type ClutchPairingKind =
  | "pure-pure"
  | "hybrid-hybrid"
  | "designer-designer"
  | "designer-hybrid"
  | "designer-pure"
  | "hybrid-pure";

export type ClutchSizeProfile = {
  kind: ClutchPairingKind;
  label: string;
  min: number;
  max: number;
  weights: number[];
};

function parentClasses(dam: ClutchPairingAnimal, sire: ClutchPairingAnimal) {
  return new Set([dam.classification, sire.classification]);
}

export function clutchPairingKind(dam: ClutchPairingAnimal, sire: ClutchPairingAnimal): ClutchPairingKind {
  const classes = parentClasses(dam, sire);

  if (classes.size === 1) {
    if (dam.classification === "Designer") return "designer-designer";
    if (dam.classification === "Hybrid") return "hybrid-hybrid";
    // Two individually pure animals from different subspecies produce hybrid offspring,
    // but the parents are still a pure x pure outcross for fertility/clutch-size purposes.
    return dam.subspecies === sire.subspecies ? "pure-pure" : "hybrid-pure";
  }

  if (classes.has("Designer") && classes.has("Pure")) return "designer-pure";
  if (classes.has("Designer") && classes.has("Hybrid")) return "designer-hybrid";
  return "hybrid-pure";
}

export const CLUTCH_SIZE_PROFILES: Record<ClutchPairingKind, ClutchSizeProfile> = {
  "pure-pure": {
    kind: "pure-pure",
    label: "Pure same-subspecies pairing",
    min: 6,
    max: 12,
    weights: [1, 3, 6, 8, 6, 3, 1],
  },
  "hybrid-hybrid": {
    kind: "hybrid-hybrid",
    label: "Hybrid × Hybrid",
    min: 4,
    max: 8,
    weights: [2, 6, 8, 5, 2],
  },
  "designer-designer": {
    kind: "designer-designer",
    label: "Designer × Designer",
    min: 4,
    max: 7,
    weights: [3, 7, 7, 3],
  },
  "designer-hybrid": {
    kind: "designer-hybrid",
    label: "Designer × Hybrid outcross",
    min: 5,
    max: 8,
    weights: [2, 6, 7, 4],
  },
  "designer-pure": {
    kind: "designer-pure",
    label: "Designer × Pure outcross",
    min: 5,
    max: 9,
    weights: [1, 4, 7, 7, 3],
  },
  "hybrid-pure": {
    kind: "hybrid-pure",
    label: "Hybrid × Pure outcross",
    min: 5,
    max: 9,
    weights: [1, 4, 7, 7, 3],
  },
};

function weightedRoll(profile: ClutchSizeProfile, random: () => number) {
  const total = profile.weights.reduce((sum, value) => sum + value, 0);
  let roll = random() * total;
  for (let i = 0; i < profile.weights.length; i++) {
    roll -= profile.weights[i];
    if (roll <= 0) return profile.min + i;
  }
  return profile.max;
}

export function clutchSizeForPairing(
  dam: ClutchPairingAnimal,
  sire: ClutchPairingAnimal,
  random: () => number = Math.random,
) {
  const kind = clutchPairingKind(dam, sire);
  const profile = CLUTCH_SIZE_PROFILES[kind];
  let size = weightedRoll(profile, random);

  // Female condition can shift the roll inside the agreed range, but never raises
  // or lowers the actual ceiling/floor for that pairing type.
  if (dam.condition === "Excellent" && random() < 0.18) size += 1;
  if (dam.condition === "Fair" && random() < 0.45) size -= 1;

  return Math.max(profile.min, Math.min(profile.max, size));
}

export function averageClutchSize(profile: ClutchSizeProfile) {
  const totalWeight = profile.weights.reduce((sum, value) => sum + value, 0);
  const weighted = profile.weights.reduce((sum, weight, index) => sum + (profile.min + index) * weight, 0);
  return Math.round((weighted / totalWeight) * 10) / 10;
}
