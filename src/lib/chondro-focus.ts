import type { ChondroTraitKey } from "@/lib/chondro-progression";

export const TRAIT_FOCUS_LABELS: Record<ChondroTraitKey, string> = {
  highBlack: "High Black",
  highWhite: "High White",
  blueStripe: "Blue",
  yellowRetention: "Yellow",
  blotches: "Blotches",
};

export type TraitFocusTarget = {
  key: ChondroTraitKey;
  minimum: number;
  priority: "Primary" | "Secondary";
};

export type TraitFocusPreferences = {
  enabled: boolean;
  targets: TraitFocusTarget[];
};

export const DEFAULT_TRAIT_FOCUS: TraitFocusPreferences = {
  enabled: false,
  targets: [],
};

export type TraitFocusAnimal = Record<ChondroTraitKey, number>;

export function normalizeTraitFocus(value: Partial<TraitFocusPreferences> | null | undefined): TraitFocusPreferences {
  const targets = Array.isArray(value?.targets)
    ? value.targets
        .filter((target): target is TraitFocusTarget => {
          return (
            !!target &&
            target.key in TRAIT_FOCUS_LABELS &&
            Number.isFinite(target.minimum) &&
            (target.priority === "Primary" || target.priority === "Secondary")
          );
        })
        .map((target) => ({
          ...target,
          minimum: Math.max(0, Math.min(100, Math.round(target.minimum))),
        }))
        .slice(0, 5)
    : [];

  return {
    enabled: Boolean(value?.enabled) && targets.length > 0,
    targets,
  };
}

export function traitFocusMatch(animal: TraitFocusAnimal, preferences: TraitFocusPreferences) {
  const focus = normalizeTraitFocus(preferences);
  if (!focus.enabled || focus.targets.length === 0) {
    return {
      score: 0,
      matched: false,
      perfectMatch: false,
      matchedTargets: [] as TraitFocusTarget[],
      missedTargets: [] as TraitFocusTarget[],
    };
  }

  const matchedTargets = focus.targets.filter((target) => animal[target.key] >= target.minimum);
  const missedTargets = focus.targets.filter((target) => animal[target.key] < target.minimum);
  const weightedTotal = focus.targets.reduce(
    (sum, target) => sum + (target.priority === "Primary" ? 2 : 1),
    0,
  );
  const weightedMatch = matchedTargets.reduce(
    (sum, target) => sum + (target.priority === "Primary" ? 2 : 1),
    0,
  );

  return {
    score: weightedTotal ? Math.round((weightedMatch / weightedTotal) * 100) : 0,
    matched: matchedTargets.length > 0,
    perfectMatch: missedTargets.length === 0,
    matchedTargets,
    missedTargets,
  };
}

export function highlightedTraitKeys(animal: TraitFocusAnimal, preferences: TraitFocusPreferences) {
  return traitFocusMatch(animal, preferences).matchedTargets.map((target) => target.key);
}

export function focusSummary(preferences: TraitFocusPreferences) {
  const focus = normalizeTraitFocus(preferences);
  if (!focus.enabled || focus.targets.length === 0) return "No trait focus selected";
  return focus.targets
    .map((target) => `${TRAIT_FOCUS_LABELS[target.key]} ${target.minimum}%+${target.priority === "Primary" ? " ★" : ""}`)
    .join(" · ");
}

export function setTraitFocusTarget(
  preferences: TraitFocusPreferences,
  key: ChondroTraitKey,
  minimum: number,
  priority: TraitFocusTarget["priority"] = "Primary",
) {
  const normalized = normalizeTraitFocus(preferences);
  const targets = normalized.targets.filter((target) => target.key !== key);
  targets.push({ key, minimum: Math.max(0, Math.min(100, Math.round(minimum))), priority });
  return normalizeTraitFocus({ enabled: true, targets });
}

export function removeTraitFocusTarget(preferences: TraitFocusPreferences, key: ChondroTraitKey) {
  const normalized = normalizeTraitFocus(preferences);
  const targets = normalized.targets.filter((target) => target.key !== key);
  return normalizeTraitFocus({ enabled: targets.length > 0, targets });
}
