"use client";

import { useMemo, useState } from "react";
import { CardView, type CardSuit } from "@/components/poker/CardView";
import {
  addTokens,
  dailyKey,
  hashStr,
  mulberry32,
  recordScore,
  reportArcadeEvent,
} from "@/lib/arcade";

/**
 * Daily Blackjack — one seeded 10-hand challenge per day, identical shoe for
 * every keeper. Fixed 25-chip bets, blackjack pays 3:2, dealer stands on 17.
 * Total profit is your score; profit converts to arcade tokens.
 */

interface Card {
  rank: number; // 2..14
  suit: CardSuit;
}

const HANDS = 10;
const BET = 25;
const DONE_KEY = "arcade-daily-poker-done-v1";

function buildShoe(day: string): Card[] {
  const rand = mulberry32(hashStr(`daily-poker:${day}`));
  const suits: CardSuit[] = ["S", "H", "D", "C"];
  const shoe: Card[] = [];
  // 4 decks — 10 hands can draw well past 52 cards.
  for (let d = 0; d < 4; d++)
    for (const suit of suits) for (let rank = 2; rank <= 14; rank++) shoe.push({ rank, suit });
  for (let i = shoe.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [shoe[i], shoe[j]] = [shoe[j], shoe[i]];
  }
  return shoe;
}

function handValue(cards: Card[]): { total: number; soft: boolean } {
  let total = 0;
  let aces = 0;
  for (const c of cards) {
    if (c.rank === 14) {
      aces++;
      total += 11;
    } else if (c.rank >= 11) total += 10;
    else total += c.rank;
  }
  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }
  return { total, soft: aces > 0 };
}

type Stage = "bet" | "play" | "done";

export function DailyBlackjack() {
  const day = dailyKey();
  const shoe = useMemo(() => buildShoe(day), [day]);
  const [handIdx, setHandIdx] = useState(0);
  const [cursor, setCursor] = useState(0);
  const [player, setPlayer] = useState<Card[]>([]);
  const [dealer, setDealer] = useState<Card[]>([]);
  const [stage, setStage] = useState<Stage>("bet");
  const [profit, setProfit] = useState(0);
  const [doubled, setDoubled] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [finished, setFinished] = useState(() => {
    try {
      return window.localStorage.getItem(DONE_KEY) === day;
    } catch {
      return false;
    }
  });
  const [finalProfit, setFinalProfit] = useState<number | null>(null);

  function dealHand() {
    const p = [shoe[cursor], shoe[cursor + 2]];
    const d = [shoe[cursor + 1], shoe[cursor + 3]];
    setPlayer(p);
    setDealer(d);
    setCursor((c) => c + 4);
    setDoubled(false);
    setMessage(null);
    const pv = handValue(p).total;
    if (pv === 21) {
      // Natural — dealer peeks
      const dv = handValue(d).total;
      if (dv === 21) settle("push");
      else settle("blackjack");
    } else {
      setStage("play");
    }
  }

  function settle(
    outcome: "blackjack" | "win" | "push" | "lose" | "bust",
    wasDoubled = doubled,
  ) {
    const stake = wasDoubled ? BET * 2 : BET;
    let delta = 0;
    let label = "";
    if (outcome === "blackjack") {
      delta = Math.round(stake * 1.5);
      label = `Blackjack! +${delta}`;
    } else if (outcome === "win") {
      delta = stake;
      label = `You win +${delta}`;
    } else if (outcome === "push") {
      label = "Push — bet returned";
    } else {
      delta = -stake;
      label = outcome === "bust" ? `Bust — ${delta}` : `Dealer wins — ${delta}`;
    }
    const nextProfit = profit + delta;
    setProfit(nextProfit);
    setMessage(label);
    setStage("done");
    if (delta > 0) reportArcadeEvent({ type: "poker-hand", game: "blackjack", net: delta });
    else if (outcome !== "push") reportArcadeEvent({ type: "poker-hand", game: "blackjack", net: 0 });
    const nextIdx = handIdx + 1;
    window.setTimeout(() => {
      if (nextIdx >= HANDS) {
        finishRun(nextProfit);
      } else {
        setHandIdx(nextIdx);
        setStage("bet");
      }
    }, 1400);
  }

  function finishRun(total: number) {
    setFinalProfit(total);
    setFinished(true);
    try {
      window.localStorage.setItem(DONE_KEY, day);
    } catch {}
    const tokens = Math.max(0, Math.floor(total / 10));
    if (tokens > 0) addTokens(tokens, `Daily Blackjack — profit ${total}`);
    recordScore("poker-daily", Math.max(0, total), `daily ${day}`);
    reportArcadeEvent({ type: "daily-complete", kind: "poker" });
  }

  function hit() {
    const p = [...player, shoe[cursor]];
    setCursor((c) => c + 1);
    setPlayer(p);
    if (handValue(p).total > 21) settle("bust");
  }

  function stand() {
    let d = [...dealer];
    let c = cursor;
    while (handValue(d).total < 17) {
      d = [...d, shoe[c]];
      c++;
    }
    setDealer(d);
    setCursor(c);
    const dv = handValue(d).total;
    const pv = handValue(player).total;
    if (dv > 21) settle("win");
    else if (dv > pv) settle("lose");
    else if (dv < pv) settle("win");
    else settle("push");
  }

  function double() {
    if (player.length !== 2) return;
    const p = [...player, shoe[cursor]];
    setCursor((c) => c + 1);
    setPlayer(p);
    setDoubled(true);
    if (handValue(p).total > 21) {
      settle("bust", true);
      return;
    }
    // Stand after double
    let d = [...dealer];
    let c = cursor + 1;
    while (handValue(d).total < 17) {
      d = [...d, shoe[c]];
      c++;
    }
    setDealer(d);
    setCursor(c);
    const dv = handValue(d).total;
    const pv = handValue(p).total;
    if (dv > 21 || dv < pv) settle("win", true);
    else if (dv > pv) settle("lose", true);
    else settle("push", true);
  }

  if (finished && finalProfit !== null) {
    return (
      <div className="rounded-[26px] border border-white/[.07] bg-white/[.02] p-5 text-center sm:p-6">
        <div className="section-kicker">Daily blackjack</div>
        <p className="mt-2 text-sm text-white/60">
          ✅ Done for {day} — profit{" "}
          <span className={`font-black ${finalProfit >= 0 ? "text-emerald-300" : "text-red-300"}`}>
            {finalProfit >= 0 ? "+" : ""}
            {finalProfit}
          </span>{" "}
          over {HANDS} hands.
        </p>
        <p className="mt-1 text-xs text-white/35">A fresh shoe lands tomorrow.</p>
      </div>
    );
  }

  const pv = handValue(player);
  const dv = handValue(dealer);

  return (
    <div className="rounded-[26px] border border-white/[.07] bg-white/[.02] p-5 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="section-kicker">Daily blackjack</div>
          <h3 className="mt-1 text-lg font-semibold text-white">
            Hand {Math.min(handIdx + 1, HANDS)}/{HANDS}
          </h3>
        </div>
        <span className={`text-sm font-black ${profit >= 0 ? "text-emerald-300" : "text-red-300"}`}>
          {profit >= 0 ? "+" : ""}
          {profit}
        </span>
      </div>

      {stage === "bet" ? (
        <div className="mt-6 text-center">
          <p className="text-sm text-white/55">Bet {BET} chips · blackjack pays 3:2 · dealer stands on 17</p>
          <p className="mt-1 text-[11px] text-white/35">Same 4-deck shoe for every keeper today</p>
          <button
            type="button"
            onClick={dealHand}
            className="mt-4 rounded-2xl bg-gradient-to-b from-amber-300 to-amber-500 px-8 py-3 text-sm font-black uppercase tracking-[.12em] text-[#171106] transition active:scale-95"
          >
            Deal hand {handIdx + 1}
          </button>
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[.16em] text-white/40">
              Dealer {stage === "done" ? `· ${dv.total}` : "· ?"}
            </p>
            <div className="mt-2 flex gap-2">
              {dealer.map((c, i) => (
                <CardView key={i} rank={c.rank} suit={c.suit} faceDown={i === 1 && stage !== "done"} size="sm" />
              ))}
            </div>
          </div>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[.16em] text-white/40">
              You · {pv.total}
              {doubled ? " · doubled" : ""}
            </p>
            <div className="mt-2 flex gap-2">
              {player.map((c, i) => (
                <CardView key={i} rank={c.rank} suit={c.suit} size="sm" />
              ))}
            </div>
          </div>
          {message && <p className="text-center text-sm font-bold text-amber-100">{message}</p>}
          {stage === "play" && (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={hit}
                className="flex-1 rounded-2xl bg-emerald-400 px-4 py-3 text-sm font-black uppercase tracking-[.1em] text-[#04120c] transition active:scale-95"
              >
                Hit
              </button>
              <button
                type="button"
                onClick={stand}
                className="flex-1 rounded-2xl border border-white/15 bg-white/[.05] px-4 py-3 text-sm font-black uppercase tracking-[.1em] text-white transition active:scale-95"
              >
                Stand
              </button>
              {player.length === 2 && (
                <button
                  type="button"
                  onClick={double}
                  className="flex-1 rounded-2xl border border-amber-200/30 bg-amber-200/[.08] px-4 py-3 text-sm font-black uppercase tracking-[.1em] text-amber-100 transition active:scale-95"
                >
                  Double
                </button>
              )}
            </div>
          )}
        </div>
      )}
      <p className="mt-4 text-[11px] text-white/35">
        Profit converts to 🪙 at 10:1 when you finish all {HANDS} hands.
      </p>
    </div>
  );
}
