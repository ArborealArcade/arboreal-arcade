export type LineAnimal = {
  id: string;
  generation: number;
  breederInitials: string | null;
  classification: "Pure" | "Hybrid" | "Designer";
  locality: string;
  subspecies: string;
  parentIds: string[];
  highBlack: number;
  highWhite: number;
  blueStripe: number;
  yellowRetention: number;
  blotches: number;
};

export type BreederLine = {
  id: string;
  name: string;
  founderIds: string[];
  subspecies: string;
  locality: string;
  classification: LineAnimal["classification"];
  establishedSeason: number;
  generationsProduced: number;
  qualifyingOffspring: number;
  consistency: number;
  prestige: number;
  proven: boolean;
};

const trackedTraits = ["highBlack", "highWhite", "blueStripe", "yellowRetention", "blotches"] as const;

export function lineConsistency(animals: LineAnimal[]) {
  if (animals.length < 2) return 0;
  const traitScores = trackedTraits.map((key) => {
    const values = animals.map((animal) => animal[key]);
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    const variance = values.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / values.length;
    const deviation = Math.sqrt(variance);
    return Math.max(0, 100 - deviation * 3.5);
  });
  return Math.round(traitScores.reduce((sum, value) => sum + value, 0) / traitScores.length);
}

export function canEstablishLine(animals: LineAnimal[]) {
  if (animals.length < 6) return false;
  const breederProduced = animals.filter((animal) => !!animal.breederInitials);
  const maxGeneration = Math.max(...animals.map((animal) => animal.generation));
  const sameClassification = new Set(animals.map((animal) => animal.classification)).size === 1;
  return breederProduced.length >= 6 && maxGeneration >= 3 && sameClassification;
}

export function buildBreederLine(
  id: string,
  name: string,
  animals: LineAnimal[],
  founderIds: string[],
  season: number,
): BreederLine {
  const maxGeneration = Math.max(...animals.map((animal) => animal.generation));
  const consistency = lineConsistency(animals);
  const qualifyingOffspring = animals.filter((animal) => animal.generation >= 2).length;
  const prestige = Math.round(
    qualifyingOffspring * 8 +
      maxGeneration * 30 +
      consistency * 1.5 +
      (animals[0]?.classification === "Pure" ? 35 : 0),
  );
  return {
    id,
    name: name.trim().slice(0, 40),
    founderIds,
    subspecies: animals[0]?.subspecies ?? "Unknown",
    locality: animals[0]?.locality ?? "Designer",
    classification: animals[0]?.classification ?? "Designer",
    establishedSeason: season,
    generationsProduced: maxGeneration,
    qualifyingOffspring,
    consistency,
    prestige,
    proven: qualifyingOffspring >= 10 && maxGeneration >= 4 && consistency >= 72,
  };
}

export function lineSaleMultiplier(line: BreederLine | null | undefined) {
  if (!line) return 1;
  const consistencyBonus = Math.max(0, line.consistency - 60) * 0.0025;
  const provenBonus = line.proven ? 0.12 : 0;
  return Math.min(1.35, 1 + consistencyBonus + provenBonus);
}
