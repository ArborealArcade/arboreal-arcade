"use client";

import { useEffect, useRef, useState } from "react";
import { EXPO_AUCTION_LOTS, RUMOR_MILL_LINES, type AuctionLot } from "@/lib/expo-data";
import { expoPurchase, expoCash, expoOpenSlots } from "@/lib/expo-purchase";

function fmt(n: number): string {
  return "$" + Math.round(n).toLocaleString();
}

const NPC_NAMES = ["Paddle #12", "Paddle #34", "Paddle #07", "Paddle #51"];

// ---------- Auction ----------

export function ExpoAuctionDialog({ onClose, onBought }: { onClose: () => void; onBought: (name: string) => void }) {
  const [lotIdx, setLotIdx] = useState(0);
  const lot: AuctionLot = EXPO_AUCTION_LOTS[lotIdx % EXPO_AUCTION_LOTS.length];
  const [timeLeft, setTimeLeft] = useState(lot.durationSec);
  const [highBid, setHighBid] = useState(lot.startingBid);
  const [highBidder, setHighBidder] = useState("Opening bid");
  const [bidInput, setBidInput] = useState("");
  const [over, setOver] = useState(false);
  const [won, setWon] = useState(false);
  const [notice, setNotice] = useState("");
  const [cash, setCash] = useState(() => expoCash());
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const npcRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const minBid = highBid + 50;

  function nextLot() {
    const next = EXPO_AUCTION_LOTS[(lotIdx + 1) % EXPO_AUCTION_LOTS.length];
    setLotIdx((i) => i + 1);
    setTimeLeft(next.durationSec);
    setHighBid(next.startingBid);
    setHighBidder("Opening bid");
    setOver(false);
    setWon(false);
    setNotice("");
    setBidInput("");
    setCash(expoCash());
  }

  function resolveAuction() {
    // Only the local "You" win needs purchase resolution; NPC wins need nothing.
    setHighBidder((bidder) => {
      if (bidder === "You") {
        setHighBid((bid) => {
          const result = expoPurchase(lot.animal, bid);
          if (result.ok) {
            setWon(true);
            setCash(expoCash());
            onBought(lot.animal.name);
            setNotice(`Sold! ${lot.animal.name} is yours for ${fmt(bid)}.`);
          } else if (result.reason === "no-cash") {
            setNotice("You won the bid but can't cover it — the lot goes to the underbidder. Ouch.");
          } else if (result.reason === "no-space") {
            setNotice("You won but have no open housing slots — the lot goes to the underbidder.");
          } else {
            setNotice("Couldn't complete the purchase — start a Keeper save first.");
          }
          return bid;
        });
      }
      return bidder;
    });
  }

  useEffect(() => {
    timerRef.current = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          if (npcRef.current) clearInterval(npcRef.current);
          // Auction ended — resolve the win inline (avoids setState-in-effect)
          window.setTimeout(() => resolveAuction(), 0);
          setOver(true);
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    // NPC bidders
    npcRef.current = setInterval(() => {
      setHighBid((bid) => {
        if (over) return bid;
        // NPCs bid aggressively early, taper off near the lot's value
        const lotValue = lot.animal.price;
        if (bid >= lotValue * 1.15 || Math.random() < 0.35) return bid;
        const bump = Math.round(50 + Math.random() * Math.max(50, (lotValue - bid) * 0.12));
        const next = bid + bump;
        setHighBidder(NPC_NAMES[Math.floor(Math.random() * NPC_NAMES.length)]);
        return next;
      });
    }, 2600);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (npcRef.current) clearInterval(npcRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lotIdx]);

  function placeBid() {
    const bid = Math.round(Number(bidInput));
    if (!Number.isFinite(bid) || bid < minBid) {
      setNotice(`Minimum bid is ${fmt(minBid)}.`);
      return;
    }
    if (bid > cash) {
      setNotice("You don't have that much cash.");
      return;
    }
    setHighBid(bid);
    setHighBidder("You");
    setBidInput("");
    setNotice("");
  }

  const mm = Math.floor(timeLeft / 60);
  const ss = String(timeLeft % 60).padStart(2, "0");

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/70 p-3 backdrop-blur-sm sm:items-center">
      <div className="w-full max-w-lg overflow-hidden rounded-[26px] border border-amber-200/20 bg-[#120c06] shadow-2xl">
        <div className="border-b border-amber-200/15 bg-amber-950/40 p-4 sm:p-5">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-[9px] font-black uppercase tracking-[.18em] text-amber-200/70">🔨 Live auction</div>
              <h2 className="mt-1 text-xl font-bold text-white">{lot.animal.name}</h2>
              <p className="text-xs text-white/45">
                {lot.animal.species} · {lot.animal.locality} · {lot.animal.morph} · {lot.animal.sex}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-white/10 bg-white/[.04] text-white/60 hover:text-white"
              aria-label="Close auction"
            >
              ✕
            </button>
          </div>
          <p className="mt-2 text-xs italic leading-5 text-white/55">“{lot.animal.blurb}”</p>
        </div>

        <div className="p-4 sm:p-5">
          <div className="flex items-center justify-between rounded-2xl border border-white/[.07] bg-black/30 p-4">
            <div>
              <div className="text-[10px] uppercase tracking-[.14em] text-white/40">Current bid</div>
              <div className="text-2xl font-black text-amber-200">{fmt(highBid)}</div>
              <div className="text-xs text-white/50">{highBidder}</div>
            </div>
            <div className={`text-3xl font-black tabular-nums ${timeLeft <= 15 ? "text-red-400" : "text-white/80"}`}>
              {mm}:{ss}
            </div>
          </div>

          {!over ? (
            <div className="mt-3 flex gap-2">
              <input
                type="number"
                inputMode="numeric"
                value={bidInput}
                onChange={(e) => setBidInput(e.target.value)}
                placeholder={`Min ${fmt(minBid)}`}
                className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/40 px-3 py-2.5 text-sm text-white placeholder:text-white/25 focus:border-amber-300/40 focus:outline-none"
              />
              <button
                type="button"
                onClick={placeBid}
                className="shrink-0 rounded-xl bg-amber-300/20 px-5 py-2.5 text-xs font-bold text-amber-100 hover:bg-amber-300/30"
              >
                Bid
              </button>
            </div>
          ) : (
            <div className="mt-3 rounded-2xl border border-white/[.07] bg-black/30 p-4 text-center">
              <div className="text-lg font-bold text-white">{won ? "🎉 You won the lot!" : highBidder === "You" ? "Auction ended" : "Sold to " + highBidder}</div>
              <button
                type="button"
                onClick={nextLot}
                className="mt-3 rounded-xl border border-amber-200/25 bg-amber-200/10 px-5 py-2.5 text-xs font-bold text-amber-100 hover:bg-amber-200/20"
              >
                Next lot →
              </button>
            </div>
          )}

          {notice ? (
            <div className="mt-3 rounded-2xl border border-amber-200/15 bg-amber-200/[.06] p-3 text-xs text-amber-100/90">
              {notice}
            </div>
          ) : null}

          <div className="mt-3 text-center text-[11px] text-white/35">
            Your cash: <span className="font-bold text-emerald-200/80">{fmt(cash)}</span> · {expoOpenSlots()} open slots
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------- Rumor mill ----------

export function ExpoRumorDialog({ onClose }: { onClose: () => void }) {
  const [rumor] = useState(
    () => RUMOR_MILL_LINES[Math.floor(Math.random() * RUMOR_MILL_LINES.length)]
  );
  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/70 p-3 backdrop-blur-sm sm:items-center">
      <div className="w-full max-w-md overflow-hidden rounded-[26px] border border-white/10 bg-[#0a120e] shadow-2xl">
        <div className="p-5">
          <div className="flex items-start justify-between">
            <div className="text-4xl">🧥</div>
            <button
              type="button"
              onClick={onClose}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-white/10 bg-white/[.04] text-white/60 hover:text-white"
              aria-label="Close"
            >
              ✕
            </button>
          </div>
          <div className="text-[9px] font-black uppercase tracking-[.18em] text-white/35">Mysterious stranger</div>
          <p className="mt-3 rounded-2xl border border-white/[.06] bg-white/[.02] p-4 text-sm italic leading-6 text-white/75">
            “{rumor}”
          </p>
          <button
            type="button"
            onClick={onClose}
            className="mt-4 w-full rounded-xl bg-emerald-400/15 px-3 py-2.5 text-xs font-bold text-emerald-100 hover:bg-emerald-400/25"
          >
            Thanks for the tip
          </button>
        </div>
      </div>
    </div>
  );
}
