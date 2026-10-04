"use client";

import { useEffect, useMemo, useState } from "react";
import {
  keeperLevelFromReputation,
  nextKeeperMilestone,
} from "@/lib/arboreal-keeper-progression";

const LOCAL_SAVE_KEY = "arboreal_chondro_breeder_v2";

function readCareerReputation() {
  if (typeof window === "undefined") return 0;
  try {
    const raw = window.localStorage.getItem(LOCAL_SAVE_KEY);
    if (!raw) return 0;
    const parsed = JSON.parse(raw) as { careerReputation?: unknown };
    const value = Number(parsed.careerReputation ?? 0);
    return Number.isFinite(value) ? Math.max(0, value) : 0;
  } catch {
    return 0;
  }
}

export function ArborealKeeperProgressionStrip() {
  const [reputation, setReputation] = useState(0);

  useEffect(() => {
    const sync = () => setReputation(readCareerReputation());
    const syncEconomy = (event: Event) => {
      const detail = (event as CustomEvent<{ reputation?: number }>).detail;
      if (typeof detail?.reputation === "number") {
        setReputation(Math.max(0, detail.reputation));
        return;
      }
      sync();
    };
    sync();
    window.addEventListener("storage", sync);
    window.addEventListener("focus", sync);
    window.addEventListener("arboreal-keeper-economy-updated", syncEconomy);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("focus", sync);
      window.removeEventListener("arboreal-keeper-economy-updated", syncEconomy);
    };
  }, []);

  const level = useMemo(() => keeperLevelFromReputation(reputation), [reputation]);
  const next = useMemo(() => nextKeeperMilestone(level), [level]);

  return (
    <section className="mt-4 grid gap-3 rounded-[26px] border border-amber-200/10 bg-amber-200/[.025] p-4 sm:grid-cols-[180px_1fr] sm:items-center sm:p-5">
      <div className="rounded-[20px] border border-amber-200/10 bg-black/20 px-4 py-4 text-center sm:text-left">
        <div className="text-[8px] font-black uppercase tracking-[.18em] text-amber-100/45">Keeper Level</div>
        <div className="mt-1 text-3xl font-semibold tracking-[-.04em] text-amber-100">{level}</div>
        <div className="mt-1 text-[10px] text-white/30">{Math.round(reputation).toLocaleString()} reputation</div>
      </div>

      <div>
        {next ? (
          <>
            <div className="text-[9px] font-black uppercase tracking-[.16em] text-white/30">
              Next milestone · Level {next.level}
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {next.unlocks.map((unlock) => (
                <span
                  key={unlock.id}
                  className="rounded-full border border-white/[.065] bg-white/[.025] px-3 py-1.5 text-[11px] text-white/58"
                >
                  {unlock.label}
                </span>
              ))}
            </div>
          </>
        ) : (
          <>
            <div className="text-[9px] font-black uppercase tracking-[.16em] text-amber-100/45">Arboreal Master</div>
            <div className="mt-2 text-sm text-white/58">Maximum Keeper Level reached. Conservation certification programs are available.</div>
          </>
        )}
      </div>
    </section>
  );
}
