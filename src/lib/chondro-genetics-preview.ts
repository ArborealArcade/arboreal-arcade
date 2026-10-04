import { inheritTraitSet, inheritTraitValue, type ChondroTraitKey, type TraitParents } from "@/lib/chondro-genetics";

export type TraitProbabilityPreview = {
  mean: number;
  low: number;
  high: number;
  zeroChance: number;
  chance70: number;
  chance85: number;
  chance95: number;
  chance100: number;
};

export type PairingProbabilityPreview = {
  traits: Record<ChondroTraitKey, TraitProbabilityPreview>;
  sampleCount: number;
  chanceAny70: number;
  chanceAny85: number;
  chanceAny95: number;
  chanceAny100: number;
};

const TRAITS: ChondroTraitKey[] = ["highBlack", "highWhite", "blueStripe", "yellowRetention", "blotches"];

function hashSeed(value: string) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

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

function percentile(sorted: number[], p: number) {
  if (!sorted.length) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * p)));
  return sorted[index];
}

function pct(count: number, total: number) {
  return Math.round((count / Math.max(1, total)) * 1000) / 10;
}

export function previewTraitInheritance(a: number, b: number, seedKey: string, samples = 1600): TraitProbabilityPreview {
  const random = seeded(hashSeed(seedKey));
  const values = Array.from({ length: samples }, () => inheritTraitValue(a, b, random));
  const sorted = [...values].sort((x, y) => x - y);
  const total = values.length;
  return {
    mean: Math.round((values.reduce((sum, value) => sum + value, 0) / total) * 10) / 10,
    low: percentile(sorted, 0.1),
    high: percentile(sorted, 0.9),
    zeroChance: pct(values.filter((value) => value === 0).length, total),
    chance70: pct(values.filter((value) => value >= 70).length, total),
    chance85: pct(values.filter((value) => value >= 85).length, total),
    chance95: pct(values.filter((value) => value >= 95).length, total),
    chance100: pct(values.filter((value) => value >= 100).length, total),
  };
}

export function previewPairingInheritance(
  dam: TraitParents,
  sire: TraitParents,
  seedKey: string,
  samples = 1600,
): PairingProbabilityPreview {
  const random = seeded(hashSeed(seedKey));
  const byTrait = Object.fromEntries(TRAITS.map((trait) => [trait, [] as number[]])) as Record<ChondroTraitKey, number[]>;
  let any70 = 0;
  let any85 = 0;
  let any95 = 0;
  let any100 = 0;

  for (let i = 0; i < samples; i++) {
    const offspring = inheritTraitSet(dam, sire, random);
    let max = 0;
    for (const trait of TRAITS) {
      const value = offspring[trait];
      byTrait[trait].push(value);
      if (value > max) max = value;
    }
    if (max >= 70) any70++;
    if (max >= 85) any85++;
    if (max >= 95) any95++;
    if (max >= 100) any100++;
  }

  const traits = Object.fromEntries(TRAITS.map((trait) => {
    const values = byTrait[trait];
    const sorted = [...values].sort((a, b) => a - b);
    return [trait, {
      mean: Math.round((values.reduce((sum, value) => sum + value, 0) / samples) * 10) / 10,
      low: percentile(sorted, 0.1),
      high: percentile(sorted, 0.9),
      zeroChance: pct(values.filter((value) => value === 0).length, samples),
      chance70: pct(values.filter((value) => value >= 70).length, samples),
      chance85: pct(values.filter((value) => value >= 85).length, samples),
      chance95: pct(values.filter((value) => value >= 95).length, samples),
      chance100: pct(values.filter((value) => value >= 100).length, samples),
    } satisfies TraitProbabilityPreview];
  })) as Record<ChondroTraitKey, TraitProbabilityPreview>;

  return {
    traits,
    sampleCount: samples,
    chanceAny70: pct(any70, samples),
    chanceAny85: pct(any85, samples),
    chanceAny95: pct(any95, samples),
    chanceAny100: pct(any100, samples),
  };
}
