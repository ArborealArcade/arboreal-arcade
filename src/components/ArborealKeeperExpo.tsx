"use client";

import { useState, useCallback } from "react";
import { ArborealKeeperExpoHall, type ExpoInteractable } from "@/components/ArborealKeeperExpoHall";
import { ExpoVendorDialog } from "@/components/ArborealKeeperExpoVendorDialog";
import { ExpoAuctionDialog, ExpoRumorDialog } from "@/components/ArborealKeeperExpoAuctionRumor";
import { ExpoArcadeDialog } from "@/components/ArborealKeeperExpoArcade";
import { isExpoWeekend } from "@/lib/expo-data";

type Props = {
  onBack: () => void;
};

export function ArborealKeeperExpo({ onBack }: Props) {
  const [dialog, setDialog] = useState<ExpoInteractable | null>(null);
  const [toast, setToast] = useState("");
  const weekend = isExpoWeekend();

  const handleInteract = useCallback((target: ExpoInteractable) => {
    setDialog(target);
  }, []);

  function handleBought(animalName: string) {
    setToast(`${animalName} joined your colony!`);
    window.setTimeout(() => setToast(""), 4000);
  }

  const vendorId = dialog?.kind === "vendor" ? dialog.vendorId : null;

  return (
    <div className="mx-auto max-w-7xl px-3 py-4 sm:px-6 sm:py-6">
      <div className="mb-4 flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          className="secondary-action px-3 py-2 text-[10px]"
        >
          ← Keeper Home
        </button>
        <div className={`rounded-full px-3 py-1.5 text-[9px] font-black uppercase tracking-[.14em] ${weekend ? "bg-emerald-300/15 text-emerald-100" : "bg-amber-200/15 text-amber-100"}`}>
          {weekend ? "🎪 Live this weekend" : "🎪 Setup day — vendors arriving"}
        </div>
      </div>

      <div className="mb-4 border-b border-white/[.055] pb-4">
        <div className="text-[9px] font-black uppercase tracking-[.16em] text-emerald-200/42">Weekend event</div>
        <h1 className="mt-2 text-2xl font-semibold tracking-[-.035em] text-white sm:text-3xl">Reptile Expo Hall</h1>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-white/42">
          Walk the floor, meet the vendors, haggle for snakes, catch the auction,
          and don&apos;t miss the arcade cabinet in the corner.
        </p>
      </div>

      <ArborealKeeperExpoHall onInteract={handleInteract} onExit={onBack} />

      {toast ? (
        <div className="fixed bottom-24 left-1/2 z-[95] -translate-x-1/2 rounded-full border border-emerald-300/25 bg-emerald-950/90 px-5 py-2.5 text-sm font-bold text-emerald-100 shadow-xl backdrop-blur-md">
          🐍 {toast}
        </div>
      ) : null}

      {vendorId ? (
        <ExpoVendorDialog vendorId={vendorId} onClose={() => setDialog(null)} onBought={handleBought} />
      ) : null}
      {dialog?.kind === "auction" ? (
        <ExpoAuctionDialog onClose={() => setDialog(null)} onBought={handleBought} />
      ) : null}
      {dialog?.kind === "rumor" ? (
        <ExpoRumorDialog onClose={() => setDialog(null)} />
      ) : null}
      {dialog?.kind === "arcade" ? (
        <ExpoArcadeDialog onClose={() => setDialog(null)} />
      ) : null}
    </div>
  );
}
