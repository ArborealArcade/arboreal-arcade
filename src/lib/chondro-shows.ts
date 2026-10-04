import type { ChondroClassification, ChondroSubspecies, ChondroTraitKey } from "@/lib/chondro-progression";

export type ShowAnimal = {
  id: string;
  name: string;
  subspecies: ChondroSubspecies;
  classification: ChondroClassification;
  generation: number;
  condition: "Excellent" | "Good" | "Fair";
  nidoStatus: "Unknown" | "Negative" | "Positive";
  highBlack: number;
  highWhite: number;
  blueStripe: number;
  yellowRetention: number;
  blotches: number;
};

export type ShowTier = {
  id: string;
  name: string;
  entryFee: number;
  reputationRequired: number;
  reputationPrize: number;
  cashPrize: number;
  difficulty: number;
};

export const SHOW_TIERS: ShowTier[] = [
  { id: "local", name: "Local Reptile Expo", entryFee: 500, reputationRequired: 0, reputationPrize: 75, cashPrize: 1500, difficulty: 52 },
  { id: "regional", name: "Regional Arboreal Showcase", entryFee: 1500, reputationRequired: 1000, reputationPrize: 180, cashPrize: 5000, difficulty: 64 },
  { id: "national", name: "National Chondro Showcase", entryFee: 4000, reputationRequired: 3500, reputationPrize: 400, cashPrize: 15000, difficulty: 75 },
  { id: "invitational", name: "Arboreal Planet Invitational", entryFee: 10000, reputationRequired: 7500, reputationPrize: 850, cashPrize: 40000, difficulty: 86 },
];

const traitValues = (animal: ShowAnimal) => [
  animal.highBlack,
  animal.highWhite,
  animal.blueStripe,
  animal.yellowRetention,
  animal.blotches,
];

export function showScore(animal: ShowAnimal) {
  const traits = traitValues(animal);
  const strongest = Math.max(...traits);
  const average = traits.reduce((sum, value) => sum + value, 0) / traits.length;
  const eliteCount = traits.filter((value) => value >= 85).length;
  const conditionBonus = animal.condition === "Excellent" ? 8 : animal.condition === "Good" ? 4 : 0;
  const healthBonus = animal.nidoStatus === "Negative" ? 3 : animal.nidoStatus === "Positive" ? -8 : 0;
  const generationBonus = Math.min(10, Math.max(0, animal.generation - 1) * 2);
  const classificationBonus = animal.classification === "Designer" ? 4 : animal.classification === "Pure" ? 3 : 2;
  return Math.round(
    average * 0.45 +
      strongest * 0.28 +
      eliteCount * 4 +
      conditionBonus +
      healthBonus +
      generationBonus +
      classificationBonus,
  );
}

export function showPlacement(animal: ShowAnimal, tier: ShowTier, season: number) {
  const seed = [...`${animal.id}:${tier.id}:${season}`].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const variance = ((seed * 9301 + 49297) % 233280) / 233280;
  const adjusted = showScore(animal) + (variance - 0.5) * 12;
  const margin = adjusted - tier.difficulty;
  if (margin >= 18) return "Best in Show" as const;
  if (margin >= 10) return "First Place" as const;
  if (margin >= 4) return "Second Place" as const;
  if (margin >= 0) return "Third Place" as const;
  return "No Placement" as const;
}

export function showRewards(tier: ShowTier, placement: ReturnType<typeof showPlacement>) {
  const multiplier =
    placement === "Best in Show"
      ? 1.8
      : placement === "First Place"
        ? 1.25
        : placement === "Second Place"
          ? 0.75
          : placement === "Third Place"
            ? 0.45
            : 0;
  return {
    cash: Math.round(tier.cashPrize * multiplier),
    reputation: Math.round(tier.reputationPrize * multiplier),
  };
}

export const SHOW_CATEGORIES: Array<{ id: string; name: string; trait?: ChondroTraitKey }> = [
  { id: "overall", name: "Overall Chondro" },
  { id: "blue", name: "Blue Expression", trait: "blueStripe" },
  { id: "white", name: "High White", trait: "highWhite" },
  { id: "black", name: "High Black", trait: "highBlack" },
  { id: "yellow", name: "Yellow Expression", trait: "yellowRetention" },
  { id: "blotches", name: "Blotched Pattern", trait: "blotches" },
];
