export type ChondroLegacyBadgeAward = {
  id: string;
  awardedAt: string;
};

export type ChondroLegacyBadgeDefinition = {
  id: string;
  name: string;
  shortLabel: string;
  description: string;
};

export const OG_PLAYER_BADGE: ChondroLegacyBadgeDefinition = {
  id: "og-player",
  name: "OG Player",
  shortLabel: "OG",
  description: "Awarded to players who started Arboreal Keeper during the original early-access era.",
};

// Keep this true while all current/new players should receive the OG badge.
// When the founding window closes, flip this to false. Existing awards stay permanent.
export const OG_PLAYER_ELIGIBILITY_OPEN = true;

export function normalizeLegacyBadges(value: unknown): ChondroLegacyBadgeAward[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const badges: ChondroLegacyBadgeAward[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const candidate = entry as { id?: unknown; awardedAt?: unknown };
    const id = String(candidate.id ?? "").slice(0, 80);
    const awardedAt = String(candidate.awardedAt ?? "").slice(0, 80);
    if (!id || !awardedAt || seen.has(id)) continue;
    seen.add(id);
    badges.push({ id, awardedAt });
  }
  return badges.slice(0, 30);
}

export function hasLegacyBadge(value: unknown, badgeId: string) {
  return normalizeLegacyBadges(value).some((badge) => badge.id === badgeId);
}

export function awardEligibleLegacyBadges(
  state: Record<string, unknown>,
  awardedAt = new Date().toISOString(),
) {
  const badges = normalizeLegacyBadges(state.legacyBadges);
  if (
    OG_PLAYER_ELIGIBILITY_OPEN &&
    state.started === true &&
    !badges.some((badge) => badge.id === OG_PLAYER_BADGE.id)
  ) {
    return {
      state: {
        ...state,
        legacyBadges: [...badges, { id: OG_PLAYER_BADGE.id, awardedAt }],
      },
      changed: true,
    };
  }
  return {
    state: { ...state, legacyBadges: badges },
    changed: !Array.isArray(state.legacyBadges),
  };
}
