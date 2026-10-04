export type ChondroTraitKey =
  | "highBlack"
  | "highWhite"
  | "blueStripe"
  | "yellowRetention"
  | "blotches";

export type TraitInheritanceResult = {
  value: number;
  mutation: boolean;
  note: "locked-zero" | "trace-emergence" | "normal" | "rare-jump";
};

const clampTrait = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

/**
 * Trait inheritance for the breeder game.
 *
 * Important design rule: when BOTH parents are true 0% for a trait, the
 * offspring should almost always remain 0%. New expression from two zero
 * parents is deliberately possible, but exceptionally rare and usually tiny.
 */
export function inheritChondroTrait(a: number, b: number, random = Math.random): TraitInheritanceResult {
  const parentA = clampTrait(a);
  const parentB = clampTrait(b);

  if (parentA === 0 && parentB === 0) {
    const roll = random();
    if (roll < 0.99) return { value: 0, mutation: false, note: "locked-zero" };
    if (roll < 0.999) {
      return {
        value: 1 + Math.floor(random() * 3),
        mutation: true,
        note: "trace-emergence",
      };
    }
    return {
      value: 4 + Math.floor(random() * 4),
      mutation: true,
      note: "rare-jump",
    };
  }

  const midpoint = (parentA + parentB) / 2;
  const spread = 14 + Math.min(8, Math.abs(parentA - parentB) * 0.08);
  const ordinary = midpoint + (random() + random() - 1) * spread;

  // Most clutches stay near the parental midpoint. A small number of babies
  // move meaningfully up or down, which keeps selective breeding exciting.
  let rare = 0;
  let note: TraitInheritanceResult["note"] = "normal";
  if (random() < 0.04) {
    rare = random() < 0.7 ? 7 + random() * 11 : -(6 + random() * 9);
    if (rare > 0) note = "rare-jump";
  }

  let raw = ordinary + rare;

  // A zero parent should pull low-expression pairings down instead of allowing
  // a 0 x low animal to behave like two established trait animals.
  if ((parentA === 0 || parentB === 0) && Math.max(parentA, parentB) < 30) raw *= 0.72;

  // High-end traits are intentionally difficult to push to 95-100.
  if (raw > 85) raw -= (raw - 85) * 0.45;

  return { value: clampTrait(raw), mutation: note === "rare-jump", note };
}

export function inheritTraitValue(a: number, b: number, random = Math.random) {
  return inheritChondroTrait(a, b, random).value;
}

export type TraitParents = Record<ChondroTraitKey, number>;

export function inheritTraitSet(dam: TraitParents, sire: TraitParents, random = Math.random) {
  return {
    highBlack: inheritTraitValue(dam.highBlack, sire.highBlack, random),
    highWhite: inheritTraitValue(dam.highWhite, sire.highWhite, random),
    blueStripe: inheritTraitValue(dam.blueStripe, sire.blueStripe, random),
    yellowRetention: inheritTraitValue(dam.yellowRetention, sire.yellowRetention, random),
    blotches: inheritTraitValue(dam.blotches, sire.blotches, random),
  };
}
