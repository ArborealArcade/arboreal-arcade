"use client";

import { useMemo, useState } from "react";
import {
  EXPO_VENDORS,
  HAGGLE_PERSONALITY_INFO,
  type ExpoAnimal,
  type ExpoVendor,
} from "@/lib/expo-data";
import {
  startHaggle,
  haggleOffer,
  haggleAccept,
  haggleHearStory,
  haggleCompliment,
  type HaggleState,
} from "@/lib/expo-haggle";
import { expoPurchase, expoCash, expoOpenSlots } from "@/lib/expo-purchase";

function fmt(n: number): string {
  return "$" + Math.round(n).toLocaleString();
}

type Props = {
  vendorId: string;
  onClose: () => void;
  onBought: (animalName: string) => void;
};

type Mode = "browse" | "haggle" | "done";

export function ExpoVendorDialog({ vendorId, onClose, onBought }: Props) {
  const vendor: ExpoVendor | undefined = useMemo(
    () => EXPO_VENDORS.find((v) => v.id === vendorId),
    [vendorId]
  );
  const [mode, setMode] = useState<Mode>("browse");
  const [haggle, setHaggle] = useState<HaggleState | null>(null);
  const [offerInput, setOfferInput] = useState("");
  const [cash, setCash] = useState(expoCash);
  const [slots, setSlots] = useState(expoOpenSlots);
  const [notice, setNotice] = useState("");

  if (!vendor) return null;
  const personality = HAGGLE_PERSONALITY_INFO[vendor.personality];

  function refreshFunds() {
    setCash(expoCash());
    setSlots(expoOpenSlots());
  }

  function beginHaggle(animal: ExpoAnimal) {
    setHaggle(startHaggle(animal, vendor!.personality));
    setOfferInput("");
    setNotice("");
    setMode("haggle");
  }

  function buyNow(animal: ExpoAnimal, price: number) {
    const result = expoPurchase(animal, price);
    if (result.ok) {
      refreshFunds();
      onBought(result.animalName);
      setNotice(`${animal.name} joined your colony for ${fmt(price)}!`);
      setMode("done");
    } else if (result.reason === "no-cash") {
      setNotice("Not enough cash for that one.");
    } else if (result.reason === "no-space") {
      setNotice("No open housing slots — buy more enclosures in the Store first.");
    } else {
      setNotice("Couldn't complete the purchase. Start a Keeper save first.");
    }
  }

  function submitOffer() {
    if (!haggle) return;
    const offer = Math.round(Number(offerInput));
    if (!Number.isFinite(offer) || offer <= 0) {
      setNotice("Enter a real offer.");
      return;
    }
    const next = haggleOffer(haggle, offer);
    setHaggle(next);
    setOfferInput("");
    if (next.done && next.finalPrice != null) {
      buyNow(next.animal, next.finalPrice);
    } else if (next.done && next.walkedAway) {
      setNotice("They walked away. Maybe try a different approach.");
    }
  }

  function acceptAsk() {
    if (!haggle) return;
    const next = haggleAccept(haggle);
    setHaggle(next);
    if (next.finalPrice != null) buyNow(next.animal, next.finalPrice);
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/70 p-3 backdrop-blur-sm sm:items-center">
      <div className="max-h-[92dvh] w-full max-w-2xl overflow-y-auto rounded-[26px] border border-white/10 bg-[#0a120e] shadow-2xl">
        {/* Header */}
        <div className="sticky top-0 border-b border-white/[.07] bg-[#0a120e]/95 p-4 backdrop-blur-sm sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div
                className="inline-block rounded-full px-2.5 py-1 text-[9px] font-black uppercase tracking-[.14em] text-white"
                style={{ background: vendor.boothColor }}
              >
                {personality.label}
              </div>
              <h2 className="mt-2 text-xl font-bold text-white">{vendor.name}</h2>
              <p className="text-xs text-white/45">{vendor.tagline}</p>
            </div>
            {vendor.id === "white-wizard-serpents" ? (
              <img
                src="/hatchery/game/expo/media-generation-white-wizard-serpents-vendor-0-b46eef39-24c1-411e-ab3b-2419e1792df3.webp"
                alt="White Wizard Serpents vendor"
                className="h-24 w-24 shrink-0 rounded-2xl border border-white/10 object-cover"
              />
            ) : null}
            <button
              type="button"
              onClick={onClose}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-white/10 bg-white/[.04] text-white/60 hover:text-white"
              aria-label="Close vendor"
            >
              ✕
            </button>
          </div>
          <p className="mt-3 rounded-2xl border border-white/[.06] bg-white/[.02] p-3 text-sm italic leading-6 text-white/70">
            “{vendor.greeting}”
          </p>
          <div className="mt-2 flex items-center justify-between text-[11px] text-white/40">
            <span>💡 {vendor.haggleHint}</span>
            <span className="font-bold text-emerald-200/80">{fmt(cash)} · {slots} open {slots === 1 ? "slot" : "slots"}</span>
          </div>
        </div>

        <div className="p-4 sm:p-5">
          {mode === "browse" ? (
            <div className="grid gap-3">
              {vendor.inventory.map((animal) => (
                <div
                  key={animal.id}
                  className="rounded-[20px] border border-white/[.07] bg-white/[.02] p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-white">{animal.name}</span>
                        {animal.exclusive ? (
                          <span className="rounded-full bg-amber-300/15 px-2 py-0.5 text-[9px] font-black uppercase tracking-[.12em] text-amber-200">
                            Expo exclusive
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-1 text-[11px] text-white/45">
                        {animal.species} · {animal.locality} · {animal.morph} · {animal.sex} · {animal.lifeStage}
                      </div>
                      <p className="mt-2 text-xs leading-5 text-white/55">{animal.blurb}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-base font-black text-emerald-200">{fmt(animal.price)}</div>
                    </div>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      onClick={() => buyNow(animal, animal.price)}
                      className="flex-1 rounded-xl bg-emerald-400/20 px-3 py-2 text-xs font-bold text-emerald-100 transition hover:bg-emerald-400/30"
                    >
                      Buy {fmt(animal.price)}
                    </button>
                    {vendor.personality !== "purist" ? (
                      <button
                        type="button"
                        onClick={() => beginHaggle(animal)}
                        className="flex-1 rounded-xl border border-amber-200/25 bg-amber-200/10 px-3 py-2 text-xs font-bold text-amber-100 transition hover:bg-amber-200/20"
                      >
                        Haggle
                      </button>
                    ) : (
                      <div className="flex flex-1 items-center justify-center rounded-xl border border-white/[.06] px-3 py-2 text-[10px] uppercase tracking-[.12em] text-white/30">
                        No haggling
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : mode === "haggle" && haggle ? (
            <div>
              <div className="mb-3 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setMode("browse")}
                  className="text-xs font-bold text-white/50 hover:text-white"
                >
                  ← Back to table
                </button>
                <div className="text-xs text-white/40">
                  Round {Math.min(haggle.rounds + 1, haggle.maxRounds)} of {haggle.maxRounds} · asking {fmt(haggle.askPrice)}
                </div>
              </div>

              {/* Chat log */}
              <div className="mb-3 max-h-56 space-y-2 overflow-y-auto rounded-[18px] border border-white/[.06] bg-black/25 p-3">
                {haggle.log.map((line, i) => (
                  <div
                    key={i}
                    className={`max-w-[85%] rounded-2xl px-3 py-2 text-xs leading-5 ${
                      line.from === "you"
                        ? "ml-auto bg-emerald-400/15 text-emerald-100"
                        : "bg-white/[.05] text-white/75"
                    }`}
                  >
                    {line.text}
                  </div>
                ))}
              </div>

              {!haggle.done ? (
                <div>
                  <div className="mb-2 flex gap-2">
                    {haggle.personality === "storyteller" && !haggle.heardStory ? (
                      <button
                        type="button"
                        onClick={() => setHaggle(haggleHearStory(haggle))}
                        className="flex-1 rounded-xl border border-violet-300/25 bg-violet-300/10 px-3 py-2 text-xs font-bold text-violet-100"
                      >
                        📖 Hear the story
                      </button>
                    ) : null}
                    {haggle.personality === "softie" && !haggle.complimented ? (
                      <button
                        type="button"
                        onClick={() => setHaggle(haggleCompliment(haggle))}
                        className="flex-1 rounded-xl border border-pink-300/25 bg-pink-300/10 px-3 py-2 text-xs font-bold text-pink-100"
                      >
                        💛 Compliment their animals
                      </button>
                    ) : null}
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      inputMode="numeric"
                      value={offerInput}
                      onChange={(e) => setOfferInput(e.target.value)}
                      placeholder={`Offer (asking ${fmt(haggle.askPrice)})`}
                      className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/40 px-3 py-2.5 text-sm text-white placeholder:text-white/25 focus:border-emerald-300/40 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={submitOffer}
                      className="shrink-0 rounded-xl bg-amber-300/20 px-4 py-2.5 text-xs font-bold text-amber-100 hover:bg-amber-300/30"
                    >
                      Offer
                    </button>
                    <button
                      type="button"
                      onClick={acceptAsk}
                      className="shrink-0 rounded-xl bg-emerald-400/20 px-4 py-2.5 text-xs font-bold text-emerald-100 hover:bg-emerald-400/30"
                    >
                      Accept {fmt(haggle.askPrice)}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setMode("browse")}
                  className="w-full rounded-xl border border-white/10 bg-white/[.04] px-3 py-2.5 text-xs font-bold text-white/60 hover:text-white"
                >
                  ← Back to table
                </button>
              )}
            </div>
          ) : mode === "done" ? (
            <div className="py-6 text-center">
              <div className="text-4xl">🐍</div>
              <p className="mt-3 text-sm text-white/70">{notice || "Enjoy your new animal!"}</p>
              <button
                type="button"
                onClick={() => { setMode("browse"); setNotice(""); }}
                className="mt-4 rounded-xl border border-white/10 bg-white/[.04] px-5 py-2.5 text-xs font-bold text-white/70 hover:text-white"
              >
                Keep browsing
              </button>
            </div>
          ) : null}

          {notice && mode !== "done" ? (
            <div className="mt-3 rounded-2xl border border-amber-200/15 bg-amber-200/[.06] p-3 text-xs text-amber-100/90">
              {notice}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
