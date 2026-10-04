export type ContractTraitKey =
  | "highBlack"
  | "highWhite"
  | "blueStripe"
  | "yellowRetention"
  | "blotches";

export type ContractAnimal = {
  id: string;
  sex: "Male" | "Female";
  locality: string;
  subspecies: string;
  classification: "Pure" | "Hybrid" | "Designer";
  generation: number;
  neonateColor: "Red" | "Yellow";
  nidoStatus: "Unknown" | "Negative" | "Positive";
  highBlack: number;
  highWhite: number;
  blueStripe: number;
  yellowRetention: number;
  blotches: number;
};

export type BreederContract = {
  id: string;
  client: string;
  title: string;
  description: string;
  expiresSeason: number;
  rewardCash: number;
  rewardReputation: number;
  requirements: {
    sex?: ContractAnimal["sex"];
    locality?: string;
    subspecies?: string;
    classification?: ContractAnimal["classification"];
    generationAtLeast?: number;
    neonateColor?: ContractAnimal["neonateColor"];
    nidoNegative?: boolean;
    traits?: Partial<Record<ContractTraitKey, number>>;
  };
};

const CLIENTS = [
  "Locality Breeder",
  "Private Collector",
  "Regional Chondro Keeper",
  "Show Breeder",
  "Boutique Reptile Shop",
  "Established Breeding Partner",
  "Research Collection",
  "Long-Term Line Breeder",
];

const TRAITS: ContractTraitKey[] = [
  "highBlack",
  "highWhite",
  "blueStripe",
  "yellowRetention",
  "blotches",
];

const SUBSPECIES = [
  "Morelia azurea azurea",
  "Morelia azurea pulcher",
  "Morelia azurea utaraensis",
  "Morelia viridis",
] as const;

const LOCALITIES = [
  "Biak",
  "Numfor",
  "Manokwari",
  "Sorong",
  "Timika",
  "Cyclops",
  "Jayapura",
  "Lereh",
  "Wamena",
  "Aru",
  "Merauke",
] as const;

const TRAIT_LABELS: Record<ContractTraitKey, string> = {
  highBlack: "High Black",
  highWhite: "High White",
  blueStripe: "Blue",
  yellowRetention: "Yellow Retention",
  blotches: "Blotches",
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

function rewardFor(difficulty: number, longevityBonus = 0) {
  return {
    rewardCash: Math.round((3500 + difficulty * 260 + longevityBonus) / 250) * 250,
    rewardReputation: Math.round(80 + difficulty * 3.5 + longevityBonus / 180),
  };
}

export function contractsForSeason(season: number, reputation: number): BreederContract[] {
  const random = seeded(season * 1879 + Math.floor(reputation / 100) * 17 + 93);
  const count = reputation >= 6500 || season >= 20 ? 5 : reputation >= 3500 || season >= 10 ? 4 : reputation >= 1000 ? 3 : 2;

  return Array.from({ length: count }, (_, index) => {
    const trait = TRAITS[Math.floor(random() * TRAITS.length)];
    const minimum = Math.min(95, 42 + Math.floor(random() * 35) + Math.floor(reputation / 1800) * 3 + Math.floor(season / 12));
    const generationAtLeast = random() < Math.min(0.58, 0.25 + season * 0.012) ? 2 + Math.floor(random() * Math.min(4, 1 + Math.floor(season / 8))) : undefined;
    const nidoNegative = reputation >= 750 && random() < 0.38;
    const client = CLIENTS[Math.floor(random() * CLIENTS.length)];
    const archetype = Math.floor(random() * 5);
    const base = {
      id: `CONTRACT-${season}-${index}`,
      client,
      expiresSeason: season + 2,
    };

    if (archetype === 0) {
      const difficulty = minimum + (generationAtLeast ?? 1) * 8 + (nidoNegative ? 10 : 0);
      return {
        ...base,
        title: `${minimum}%+ ${TRAIT_LABELS[trait]} request`,
        description: "A collector is looking for a strong expression animal and will pay more for a deeper documented line.",
        ...rewardFor(difficulty),
        requirements: {
          generationAtLeast,
          nidoNegative,
          traits: { [trait]: minimum },
        },
      };
    }

    if (archetype === 1) {
      const locality = LOCALITIES[Math.floor(random() * LOCALITIES.length)];
      const depth = Math.max(2, generationAtLeast ?? (season >= 12 ? 3 : 2));
      const difficulty = 58 + depth * 12 + (nidoNegative ? 10 : 0);
      return {
        ...base,
        title: `${locality} line request`,
        description: `A locality-focused breeder wants a pure ${locality} animal from a documented generation ${depth}+ line.`,
        ...rewardFor(difficulty, season >= 15 ? 2500 : 0),
        requirements: {
          locality,
          classification: "Pure" as const,
          generationAtLeast: depth,
          nidoNegative,
        },
      };
    }

    if (archetype === 2) {
      const subspecies = SUBSPECIES[Math.floor(random() * SUBSPECIES.length)];
      const difficulty = minimum + 20 + (generationAtLeast ?? 1) * 8;
      return {
        ...base,
        title: `${TRAIT_LABELS[trait]} ${subspecies.replace("Morelia ", "")} commission`,
        description: "A breeder wants a specific subspecies rather than an interchangeable high-expression animal.",
        ...rewardFor(difficulty),
        requirements: {
          subspecies,
          classification: "Pure" as const,
          generationAtLeast,
          traits: { [trait]: minimum },
        },
      };
    }

    if (archetype === 3) {
      const designerMinimum = Math.max(50, Math.min(90, minimum - 5));
      const secondTrait = TRAITS[(TRAITS.indexOf(trait) + 1 + Math.floor(random() * (TRAITS.length - 1))) % TRAITS.length];
      const dual = season >= 8 && random() < 0.45;
      const traits = dual ? { [trait]: designerMinimum, [secondTrait]: Math.max(45, designerMinimum - 8) } : { [trait]: designerMinimum };
      const difficulty = designerMinimum + 24 + (dual ? 22 : 0) + (generationAtLeast ?? 1) * 6;
      return {
        ...base,
        title: dual ? "Dual-trait designer request" : "Designer project request",
        description: dual
          ? `A designer breeder wants ${TRAIT_LABELS[trait]} and ${TRAIT_LABELS[secondTrait]} expressed together.`
          : `A designer breeder wants a project animal centered on ${TRAIT_LABELS[trait]}.`,
        ...rewardFor(difficulty, dual ? 3500 : 0),
        requirements: {
          classification: "Designer" as const,
          generationAtLeast,
          nidoNegative,
          traits,
        },
      };
    }

    const sex = random() < 0.5 ? "Male" as const : "Female" as const;
    const subspecies = SUBSPECIES[Math.floor(random() * SUBSPECIES.length)];
    const redEligible = subspecies !== "Morelia viridis";
    const neonateColor = redEligible && random() < 0.32 ? "Red" as const : undefined;
    const depth = season >= 10 ? Math.max(2, generationAtLeast ?? 2) : generationAtLeast;
    const difficulty = 55 + (depth ?? 1) * 10 + (neonateColor ? 12 : 0) + 10;
    return {
      ...base,
      title: "Documented breeding-stock request",
      description: `A breeding partner wants a Nido-negative ${sex.toLowerCase()} ${subspecies.replace("Morelia ", "")} with a traceable history${neonateColor ? " and red neonate color" : ""}.`,
      ...rewardFor(difficulty, season >= 18 ? 3000 : 0),
      requirements: {
        sex,
        subspecies,
        generationAtLeast: depth,
        neonateColor,
        nidoNegative: true,
      },
    };
  });
}

export function animalMeetsContract(contract: BreederContract, animal: ContractAnimal) {
  const req = contract.requirements;
  if (req.sex && animal.sex !== req.sex) return false;
  if (req.locality && animal.locality !== req.locality) return false;
  if (req.subspecies && animal.subspecies !== req.subspecies) return false;
  if (req.classification && animal.classification !== req.classification) return false;
  if (req.generationAtLeast && animal.generation < req.generationAtLeast) return false;
  if (req.neonateColor && animal.neonateColor !== req.neonateColor) return false;
  if (req.nidoNegative && animal.nidoStatus !== "Negative") return false;
  if (req.traits) {
    for (const [key, minimum] of Object.entries(req.traits) as Array<[ContractTraitKey, number]>) {
      if (animal[key] < minimum) return false;
    }
  }
  return true;
}
