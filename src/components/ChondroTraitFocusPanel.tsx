"use client";

import { useEffect, useState } from "react";
import type { ChondroTraitKey } from "@/lib/chondro-progression";
import {
  DEFAULT_TRAIT_FOCUS,
  TRAIT_FOCUS_LABELS,
  normalizeTraitFocus,
  removeTraitFocusTarget,
  setTraitFocusTarget,
  type TraitFocusPreferences,
} from "@/lib/chondro-focus";

type Props = {
  value?: TraitFocusPreferences;
  onChange?: (next: TraitFocusPreferences) => void;
};

export const TRAIT_FOCUS_STORAGE_KEY = "arboreal_chondro_trait_focus_v1";
export const TRAIT_FOCUS_EVENT = "arboreal-chondro-trait-focus-change";

const traitKeys = Object.keys(TRAIT_FOCUS_LABELS) as ChondroTraitKey[];

export function ChondroTraitFocusPanel({ value, onChange }: Props) {
  const controlled = value !== undefined;
  const [storedValue, setStoredValue] = useState<TraitFocusPreferences>(DEFAULT_TRAIT_FOCUS);
  const focus = normalizeTraitFocus(controlled ? value : storedValue);

  useEffect(() => {
    if (controlled) return;
    try {
      const raw = window.localStorage.getItem(TRAIT_FOCUS_STORAGE_KEY);
      if (raw) setStoredValue(normalizeTraitFocus(JSON.parse(raw)));
    } catch {}
  }, [controlled]);

  function commit(nextValue: TraitFocusPreferences) {
    const next = normalizeTraitFocus(nextValue);
    if (!controlled) {
      setStoredValue(next);
      try {
        window.localStorage.setItem(TRAIT_FOCUS_STORAGE_KEY, JSON.stringify(next));
        window.dispatchEvent(new CustomEvent(TRAIT_FOCUS_EVENT, { detail: next }));
      } catch {}
    }
    onChange?.(next);
  }

  const targetFor = (key: ChondroTraitKey) => focus.targets.find((target) => target.key === key);

  return (
    <section className="panel rounded-2xl p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm font-bold text-white/80">Trait Focus</div>
          <div className="mt-1 text-[11px] leading-5 text-white/40">
            Pick the traits you are actively hunting. Your choices are saved for this player and can be used to
            highlight matching animals without changing genetics or odds.
          </div>
        </div>
        <button
          type="button"
          onClick={() => commit({ ...focus, enabled: !focus.enabled && focus.targets.length > 0 })}
          className="rounded-full border border-white/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[.18em] text-white/60"
        >
          {focus.enabled ? "On" : "Off"}
        </button>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        {traitKeys.map((key) => {
          const target = targetFor(key);
          return (
            <div key={key} className="rounded-xl border border-white/[.07] bg-black/20 p-3">
              <label className="flex items-center gap-2 text-xs font-semibold text-white/70">
                <input
                  type="checkbox"
                  checked={!!target}
                  onChange={(event) => {
                    if (event.target.checked) commit(setTraitFocusTarget(focus, key, 70, "Primary"));
                    else commit(removeTraitFocusTarget(focus, key));
                  }}
                />
                {TRAIT_FOCUS_LABELS[key]}
              </label>

              {target ? (
                <div className="mt-3 space-y-2">
                  <label className="block text-[10px] uppercase tracking-[.15em] text-white/30">Target</label>
                  <select
                    value={target.minimum}
                    onChange={(event) =>
                      commit(setTraitFocusTarget(focus, key, Number(event.target.value), target.priority))
                    }
                    className="w-full rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-xs text-white/70"
                  >
                    {[25, 50, 60, 70, 80, 85, 90, 95, 100].map((amount) => (
                      <option key={amount} value={amount}>{amount}%+</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() =>
                      commit(
                        setTraitFocusTarget(
                          focus,
                          key,
                          target.minimum,
                          target.priority === "Primary" ? "Secondary" : "Primary",
                        ),
                      )
                    }
                    className="w-full rounded-lg border border-white/[.07] px-2 py-1.5 text-[10px] font-semibold text-white/45"
                  >
                    {target.priority === "Primary" ? "★ Primary" : "Secondary"}
                  </button>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {focus.targets.length > 0 ? (
        <div className="mt-3 text-[10px] text-white/35">
          {focus.enabled ? "Highlighting enabled" : "Targets saved — highlighting paused"} · {focus.targets.length} trait{focus.targets.length === 1 ? "" : "s"} tracked
        </div>
      ) : null}
    </section>
  );
}
