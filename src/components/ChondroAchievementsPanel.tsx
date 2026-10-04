"use client";

import { useEffect, useMemo, useState } from "react";
import { loadChondroSaveState } from "@/lib/chondro-save";
import {
  CHONDRO_ACHIEVEMENTS,
  achievementReputation,
  completedAchievements,
  unlockedTitles,
  type AchievementSave,
} from "@/lib/chondro-achievements";
import { OG_PLAYER_BADGE, normalizeLegacyBadges, type ChondroLegacyBadgeAward } from "@/lib/chondro-badges";

type AchievementPanelSave = AchievementSave & {
  selectedBreederTitle?: string;
  legacyBadges?: ChondroLegacyBadgeAward[];
};

export function ChondroAchievementsPanel() {
  const [save, setSave] = useState<AchievementPanelSave>({});
  const [selectedTitle, setSelectedTitle] = useState("");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const { state: loaded } = await loadChondroSaveState();
        if (!cancelled && loaded) {
          const state = loaded as AchievementPanelSave;
          setSave({ ...state, legacyBadges: normalizeLegacyBadges(state.legacyBadges) });
          setSelectedTitle(typeof state.selectedBreederTitle === "string" ? state.selectedBreederTitle : "");
        }
      } catch {}
      if (!cancelled) setLoaded(true);
    }
    void load();
    return () => { cancelled = true; };
  }, []);

  const completed = useMemo(() => completedAchievements(save), [save]);
  const completedIds = useMemo(() => new Set(completed.map((item) => item.id)), [completed]);
  const titles = useMemo(() => unlockedTitles(save), [save]);
  const reputation = useMemo(() => achievementReputation(save), [save]);
  const legacyBadges = useMemo(() => normalizeLegacyBadges(save.legacyBadges), [save.legacyBadges]);
  const ogAward = legacyBadges.find((badge) => badge.id === OG_PLAYER_BADGE.id) ?? null;

  async function chooseTitle(title: string) {
    const next = { ...(save as Record<string, unknown>), selectedBreederTitle: title };
    setSelectedTitle(title);
    setSave(next as AchievementPanelSave);
    try {
      await fetch("/api/hatchery/chondro-breeder/save", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
    } catch {}
  }

  if (!loaded) return null;

  return (
    <section className="panel rounded-[28px] p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="section-kicker">Career achievements</div>
          <h2 className="mt-2 text-2xl font-semibold">Breeder milestones</h2>
          <p className="mt-2 max-w-2xl text-sm text-white/35">
            Progress is calculated from your actual save: animals produced, generations, trait milestones, sales, seasons and other breeder accomplishments.
          </p>
        </div>
        <div className="rounded-2xl border border-emerald-300/15 bg-emerald-300/[.04] px-4 py-3 text-right">
          <div className="text-[10px] uppercase tracking-[.18em] text-white/35">Achievement reputation</div>
          <div className="mt-1 text-2xl font-black text-emerald-200">{reputation.toLocaleString()}</div>
          <div className="text-[10px] text-white/30">{completed.length}/{CHONDRO_ACHIEVEMENTS.length} complete</div>
        </div>
      </div>

      {ogAward ? (
        <div className="mt-5 overflow-hidden rounded-2xl border border-amber-200/25 bg-amber-200/[.045]">
          <div className="flex flex-wrap items-center justify-between gap-4 p-4">
            <div className="flex items-center gap-3">
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full border border-amber-100/25 bg-amber-200/[.10] text-sm font-black tracking-[.12em] text-amber-100">
                {OG_PLAYER_BADGE.shortLabel}
              </div>
              <div>
                <div className="text-[10px] font-black uppercase tracking-[.16em] text-amber-100/50">Legacy badge</div>
                <div className="mt-1 text-base font-black text-amber-50/85">{OG_PLAYER_BADGE.name}</div>
                <div className="mt-1 max-w-2xl text-[11px] leading-5 text-white/40">{OG_PLAYER_BADGE.description}</div>
              </div>
            </div>
            <div className="rounded-full border border-amber-100/15 px-3 py-1.5 text-[9px] font-black uppercase tracking-[.12em] text-amber-100/65">
              Permanent
            </div>
          </div>
        </div>
      ) : null}

      {titles.length ? (
        <div className="mt-5 rounded-2xl border border-white/[.07] bg-black/15 p-4">
          <div className="text-xs font-bold text-white/65">Breeder title</div>
          <div className="mt-3 flex flex-wrap gap-2">
            {titles.map((title) => (
              <button
                type="button"
                key={title}
                onClick={() => void chooseTitle(title)}
                className={`rounded-full border px-3 py-1.5 text-[10px] font-bold ${selectedTitle === title ? "border-amber-200/35 bg-amber-200/[.08] text-amber-100" : "border-white/[.08] text-white/45"}`}
              >
                {selectedTitle === title ? "★ " : ""}{title}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {CHONDRO_ACHIEVEMENTS.map((achievement) => {
          const done = completedIds.has(achievement.id);
          return (
            <div key={achievement.id} className={`rounded-2xl border p-4 ${done ? "border-emerald-300/20 bg-emerald-300/[.035]" : "border-white/[.06] bg-black/10"}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="text-sm font-bold text-white/75">{done ? "✓ " : ""}{achievement.name}</div>
                <span className={`text-[9px] font-bold uppercase tracking-[.15em] ${done ? "text-emerald-200/70" : "text-white/25"}`}>
                  {done ? "Complete" : "+" + achievement.reputation + " rep"}
                </span>
              </div>
              <p className="mt-2 text-[11px] leading-5 text-white/35">{achievement.description}</p>
              {achievement.title ? <div className="mt-2 text-[10px] text-amber-100/50">Title: {achievement.title}</div> : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}
