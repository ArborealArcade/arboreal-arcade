"use client";

import { useEffect, useRef, useState } from "react";
import { loadChondroSaveState } from "@/lib/chondro-save";

type SaveState = {
  breedingCycle?: { stage?: string } | null;
  clutch?: { offspring?: unknown[] } | null;
  geneticTestsPending?: unknown[];
  facilityConstruction?: unknown | null;
};
type MarketState = {
  pendingProceeds?: number;
  settlement?: { clearedCount?: number; conservationAcquisitions?: number; petSales?: number } | null;
};
type Snapshot = {
  stage: string;
  clutchCount: number;
  pendingTests: number;
  construction: boolean;
  proceeds: number;
};

function stageName(stage: string) {
  const labels: Record<string, string> = {
    cycling: "Cycle",
    pairing: "Pair",
    development: "Develop",
    incubation: "Incubation",
  };
  return labels[stage] ?? stage;
}

export function ChondroGameNotifications() {
  const previous = useRef<Snapshot | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    let hideTimer = 0;

    function show(next: string) {
      if (!active || !next) return;
      setMessage(next);
      window.clearTimeout(hideTimer);
      hideTimer = window.setTimeout(() => setMessage(""), 5200);
    }

    async function check() {
      try {
        const [{ state: saveState }, marketResponse] = await Promise.all([
          loadChondroSaveState(),
          fetch("/api/hatchery/chondro-breeder/player-market", { cache: "no-store" }),
        ]);
        const marketData = marketResponse.ok ? await marketResponse.json() as MarketState : null;
        const save = (saveState ?? {}) as SaveState;
        const snapshot: Snapshot = {
          stage: save.breedingCycle?.stage ?? "",
          clutchCount: Array.isArray(save.clutch?.offspring) ? save.clutch!.offspring!.length : 0,
          pendingTests: Array.isArray(save.geneticTestsPending) ? save.geneticTestsPending.length : 0,
          construction: Boolean(save.facilityConstruction),
          proceeds: Math.max(0, Number(marketData?.pendingProceeds ?? 0)),
        };

        const settlement = marketData?.settlement;
        if (Number(settlement?.clearedCount ?? 0) > 0) {
          const count = Number(settlement?.clearedCount ?? 0);
          const conservation = Number(settlement?.conservationAcquisitions ?? 0);
          const pets = Number(settlement?.petSales ?? 0);
          show(`Market sweep complete: ${count} listing${count === 1 ? "" : "s"} cleared${conservation ? ` · ${conservation} to conservation` : ""}${pets ? ` · ${pets} pet sale${pets === 1 ? "" : "s"}` : ""}.`);
        } else if (previous.current) {
          if (snapshot.clutchCount > previous.current.clutchCount) show(`Clutch hatched: ${snapshot.clutchCount} offspring now need to be established.`);
          else if (snapshot.stage && snapshot.stage !== previous.current.stage) show(`Breeding advanced to ${stageName(snapshot.stage)}.`);
          else if (snapshot.pendingTests < previous.current.pendingTests) show("Genetic test results are ready.");
          else if (!snapshot.construction && previous.current.construction) show("Facility construction is complete.");
          else if (snapshot.proceeds > previous.current.proceeds) show("A snake sold. Market proceeds are ready to collect.");
        }
        previous.current = snapshot;
      } catch {}
    }

    void check();
    const timer = window.setInterval(() => void check(), 30_000);
    const refresh = () => void check();
    window.addEventListener("arboreal-chondro-breeder-save-change", refresh);
    window.addEventListener("chondro-conservation-updated", refresh);
    return () => {
      active = false;
      window.clearTimeout(hideTimer);
      window.clearInterval(timer);
      window.removeEventListener("arboreal-chondro-breeder-save-change", refresh);
      window.removeEventListener("chondro-conservation-updated", refresh);
    };
  }, []);

  if (!message) return null;
  return (
    <div className="pointer-events-none fixed inset-x-3 bottom-[calc(94px+env(safe-area-inset-bottom))] z-[95] flex justify-center lg:bottom-[110px]" role="status" aria-live="polite">
      <div className="max-w-xl rounded-2xl border border-emerald-300/18 bg-[#07120d]/96 px-4 py-3 text-sm font-medium text-white/78 shadow-2xl backdrop-blur-xl">
        <span className="mr-2 text-emerald-200">●</span>{message}
      </div>
    </div>
  );
}
