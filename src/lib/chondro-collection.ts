import type { ChondroClassification, ChondroSubspecies, ChondroTraitKey } from "@/lib/chondro-progression";

export type CollectionAnimal = {
  id: string;
  name: string;
  sex: "Male" | "Female";
  source: "Captive Bred" | "Import";
  subspecies: ChondroSubspecies;
  locality: string;
  lifeStage: "Hatchling" | "Neonate" | "Subadult" | "Adult";
  classification: ChondroClassification;
  generation: number;
  nidoStatus: "Unknown" | "Negative" | "Positive";
  breederInitials: string | null;
  highBlack: number;
  highWhite: number;
  blueStripe: number;
  yellowRetention: number;
  blotches: number;
};

export type CollectionSort =
  | "name"
  | "newest-generation"
  | "highest-trait"
  | "blue"
  | "high-white"
  | "high-black"
  | "yellow"
  | "blotches";

export type CollectionFilters = {
  query?: string;
  subspecies?: ChondroSubspecies | "All";
  locality?: string | "All";
  sex?: "Male" | "Female" | "All";
  stage?: CollectionAnimal["lifeStage"] | "All";
  classification?: ChondroClassification | "All";
  source?: CollectionAnimal["source"] | "All";
  nidoStatus?: CollectionAnimal["nidoStatus"] | "All";
  breederProducedOnly?: boolean;
  minimumTrait?: { key: ChondroTraitKey; value: number } | null;
  sort?: CollectionSort;
};

const strongestTrait = (animal: CollectionAnimal) =>
  Math.max(
    animal.highBlack,
    animal.highWhite,
    animal.blueStripe,
    animal.yellowRetention,
    animal.blotches,
  );

function traitForSort(animal: CollectionAnimal, sort: CollectionSort) {
  if (sort === "blue") return animal.blueStripe;
  if (sort === "high-white") return animal.highWhite;
  if (sort === "high-black") return animal.highBlack;
  if (sort === "yellow") return animal.yellowRetention;
  if (sort === "blotches") return animal.blotches;
  return strongestTrait(animal);
}

export function filterCollection<T extends CollectionAnimal>(animals: T[], filters: CollectionFilters) {
  const query = filters.query?.trim().toLowerCase() ?? "";
  const filtered = animals.filter((animal) => {
    if (query) {
      const haystack = [
        animal.name,
        animal.id,
        animal.locality,
        animal.subspecies,
        animal.classification,
        animal.breederInitials ?? "",
      ]
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    if (filters.subspecies && filters.subspecies !== "All" && animal.subspecies !== filters.subspecies) return false;
    if (filters.locality && filters.locality !== "All" && animal.locality !== filters.locality) return false;
    if (filters.sex && filters.sex !== "All" && animal.sex !== filters.sex) return false;
    if (filters.stage && filters.stage !== "All" && animal.lifeStage !== filters.stage) return false;
    if (filters.classification && filters.classification !== "All" && animal.classification !== filters.classification) return false;
    if (filters.source && filters.source !== "All" && animal.source !== filters.source) return false;
    if (filters.nidoStatus && filters.nidoStatus !== "All" && animal.nidoStatus !== filters.nidoStatus) return false;
    if (filters.breederProducedOnly && !animal.breederInitials) return false;
    if (filters.minimumTrait && animal[filters.minimumTrait.key] < filters.minimumTrait.value) return false;
    return true;
  });

  const sort = filters.sort ?? "name";
  return [...filtered].sort((a, b) => {
    if (sort === "name") return a.name.localeCompare(b.name);
    if (sort === "newest-generation") return b.generation - a.generation || a.name.localeCompare(b.name);
    return traitForSort(b, sort) - traitForSort(a, sort) || a.name.localeCompare(b.name);
  });
}

export function collectionSummary(animals: CollectionAnimal[]) {
  const adults = animals.filter((animal) => animal.lifeStage === "Adult").length;
  const breederProduced = animals.filter((animal) => !!animal.breederInitials).length;
  const elite = animals.filter((animal) => strongestTrait(animal) >= 90).length;
  const perfect = animals.filter((animal) => strongestTrait(animal) >= 100).length;
  return {
    total: animals.length,
    adults,
    breederProduced,
    elite,
    perfect,
  };
}
