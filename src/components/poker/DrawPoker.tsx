"use client";

import Link from "next/link";
import { useCallback, useRef, useState } from "react";
import { CardView } from "@/components/poker/CardView";
import { TableFelt } from "@/components/poker/TableFelt";
import { useBankroll } from "@/components/poker/useBankroll";
import { reportArcadeEvent } from "@/lib/arcade";
import {
  dealDrawHand,
  doubleOrNothing,
  redrawHand,
  scoreVideoPoker,
  type BJCard,
} from "@/lib/poker/videopoker";
import { createShoe } from "@/lib/poker/blackjack";
import { playSfx, unlockAudio } from "@/lib/poker/sfx";

const DENOM = 10; // lifesap per coin
const MAX_GAMBLES = 5;

type Phase = "betting" | "hold" | "gamble" | "done";

export function DrawPoker() {
  const { balance, loading, placeBet, settleBet } = useBankroll();
  const [coins, setCoins] = useState(5);
  const [phase, setPhase] = useState<Phase>("betting");
  const [hand, setHand] = useState<BJCard[]>([]);
  const [holds, setHolds] = useState<boolean[]>([false, false, false, false, false]);
  const [roundId, setRoundId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [winCoins, setWinCoins] = useState(0);
  const [winLabel, setWinLabel] = useState("");
  const [gambles, setGambles] = useState(0);
  const [gambleCards, setGambleCards] = useState<{ player: BJCard; dealer: BJCard } | null>(null);
  const [gambleMsg, setGambleMsg] = useState("");
  const stubRef = useRef<BJCard[]>([]);
  const [collected, setCollected] = useState(0);

  const deal = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      unlockAudio();
      const id = await placeBet("draw", coins * DENOM);
      const deck = createShoe(1, Math.random);
      const h = dealDrawHand(deck);
      stubRef.current = deck.slice(0, deck.length - 5);
      setHand(h);
      setHolds([false, false, false, false, false]);
      setRoundId(id);
      setWinCoins(0);
      setGambles(0);
      setGambleCards(null);
      setGambleMsg("");
      setCollected(0);
      setPhase("hold");
      playSfx("shuffle");
      playSfx("deal");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not deal.");
    } finally {
      setBusy(false);
    }
  }, [busy, coins, placeBet]);

  const draw = useCallback(() => {
    if (phase !== "hold" || busy) return;
    unlockAudio();
    const stub = stubRef.current;
    const replaced = holds.filter((x) => !x).length;
    const newHand = redrawHand(hand, holds, stub);
    stubRef.current = stub.slice(0, stub.length - replaced);
    setHand(newHand);
    playSfx("deal");
    const score = scoreVideoPoker(newHand, coins);
    setWinLabel(score.handName);
    setWinCoins(score.payoutCoins);
    if (score.payoutCoins > 0) {
      setPhase("gamble");
      playSfx("win", score.payoutCoins * DENOM);
    } else {
      setPhase("done");
      setCollected(0);
      playSfx("lose");
    }
  }, [phase, busy, hand, holds, coins]);

  const collect = useCallback(async () => {
    if (!roundId || busy) return;
    setBusy(true);
    setError(null);
    try {
      const payout = winCoins * DENOM;
      setCollected(payout);
      await settleBet(roundId, payout, { risked: coins * DENOM, bet: coins * DENOM });
      setRoundId(null);
      setPhase("done");
      reportArcadeEvent({ type: "poker-hand", game: "draw", net: payout - coins * DENOM });
      if (payout > 0) playSfx("win", payout);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not settle.");
    } finally {
      setBusy(false);
    }
  }, [roundId, busy, winCoins, coins, settleBet]);

  const gamble = useCallback(() => {
    if (phase !== "gamble" || busy || gambles >= MAX_GAMBLES) return;
    unlockAudio();
    const stub = stubRef.current;
    if (stub.length < 2) {
      void collect();
      return;
    }
    const [player, dealer] = stub.slice(stub.length - 2);
    stubRef.current = stub.slice(0, stub.length - 2);
    setGambleCards({ player, dealer });
    const before = winCoins;
    const res = doubleOrNothing(winCoins, player, dealer);
    setGambles((g) => g + 1);
    if (res > before) {
      setWinCoins(res);
      setGambleMsg(`Dealer ${label(dealer)} — your ${label(player)} takes it. Streak ${gambles + 1}.`);
      playSfx("win", res * DENOM);
    } else if (res === before) {
      setGambleMsg(`Push — both ${label(player)}. Streak kept.`);
      playSfx("click");
    } else {
      setWinCoins(0);
      setGambleMsg(`Dealer ${label(dealer)} beats your ${label(player)}. Gamble lost.`);
      playSfx("lose");
    }
  }, [phase, busy, gambles, winCoins, collect]);

  // Auto-settle a losing hand right after the draw.
  const settleLoss = useCallback(async () => {
    if (!roundId || busy) return;
    setBusy(true);
    try {
      await settleBet(roundId, 0, { risked: coins * DENOM, bet: coins * DENOM });
      setRoundId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not settle.");
    } finally {
      setBusy(false);
    }
  }, [roundId, busy, coins, settleBet]);

  const newRound = () => {
    setPhase("betting");
    setError(null);
    setHand([]);
  };

  return (
    <TableFelt className="min-h-dvh">
      <div className="mx-auto w-full max-w-3xl px-4 py-6">
        <div className="flex items-center justify-between">
          <Link href="/arcade/snake-poker" className="text-sm text-emerald-100/60 hover:text-amber-200">
            ← The Den
          </Link>
          <div className="text-sm text-emerald-100/80">
            <span className="font-bold text-amber-200">{loading ? "…" : balance.toLocaleString()}</span> lifesap
          </div>
        </div>

        <h1 className="mt-4 text-2xl font-black text-amber-100">Serpent Draw</h1>
        <p className="text-xs text-emerald-100/50">Jacks or better · 9/6 paytable · 1–5 coins @ 10 lifesap</p>

        {error && (
          <div className="mt-4 rounded-xl border border-red-400/40 bg-red-950/60 px-4 py-2 text-sm text-red-200">
            {error}
          </div>
        )}

        {phase === "betting" && (
          <div className="mt-8 rounded-2xl border border-emerald-200/15 bg-black/45 p-6 text-center">
            <p className="text-sm text-emerald-100/70">Coins per hand (10 lifesap each)</p>
            <div className="mt-3 flex justify-center gap-2">
              {[1, 2, 3, 4, 5].map((c) => (
                <button
                  key={c}
                  onClick={() => {
                    setCoins(c);
                    playSfx("chip");
                  }}
                  className={`h-11 w-11 rounded-full border-2 text-sm font-bold ${
                    coins === c
                      ? "border-amber-300 bg-amber-300 text-black"
                      : "border-emerald-200/30 text-emerald-100/80"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
            <button
              onClick={deal}
              disabled={busy}
              className="mt-5 rounded-full bg-emerald-500 px-8 py-2.5 font-bold text-black disabled:opacity-50"
            >
              {busy ? "Dealing…" : `Deal for ${coins * DENOM} lifesap`}
            </button>
          </div>
        )}

        {phase !== "betting" && hand.length > 0 && (
          <div className="mt-6">
            <div className="flex justify-center gap-2">
              {hand.map((c, i) => (
                <button
                  key={i}
                  onClick={() => {
                    if (phase !== "hold") return;
                    unlockAudio();
                    setHolds((h) => {
                      const next = [...h];
                      next[i] = !next[i];
                      return next;
                    });
                    playSfx("click");
                  }}
                  className={`relative min-w-0 flex-1 max-w-[104px] rounded-xl transition ${holds[i] ? "-translate-y-2" : ""}`}
                  aria-label={`${label(c)} ${holds[i] ? "held" : "not held"}`}
                >
                  <CardView rank={c.rank} suit={c.suit} size="fluid" />
                  {holds[i] && (
                    <span className="absolute -top-2 left-1/2 -translate-x-1/2 rounded-full bg-amber-300 px-2 py-0.5 text-[10px] font-bold text-black">
                      HELD
                    </span>
                  )}
                </button>
              ))}
            </div>

            {phase === "hold" && (
              <div className="mt-5 text-center">
                <button
                  onClick={draw}
                  disabled={busy}
                  className="rounded-full bg-emerald-500 px-8 py-2.5 font-bold text-black disabled:opacity-50"
                >
                  Draw
                </button>
              </div>
            )}

            {(phase === "gamble" || phase === "done") && (
              <div className="mt-5 rounded-2xl border border-amber-200/25 bg-black/50 p-4 text-center">
                <p className="text-lg font-black text-amber-100">{winLabel}</p>
                <p className="text-sm text-emerald-100/70">
                  Won <span className="font-bold text-emerald-300">{(winCoins * DENOM).toLocaleString()}</span> lifesap
                </p>

                {phase === "gamble" && (
                  <>
                    {gambleCards && (
                      <div className="mt-3 flex items-center justify-center gap-4">
                        <div className="text-center">
                          <CardView rank={gambleCards.player.rank} suit={gambleCards.player.suit} size="md" />
                          <p className="mt-1 text-[11px] text-emerald-100/60">You</p>
                        </div>
                        <p className="text-xs text-emerald-100/50">vs</p>
                        <div className="text-center">
                          <CardView rank={gambleCards.dealer.rank} suit={gambleCards.dealer.suit} size="md" />
                          <p className="mt-1 text-[11px] text-emerald-100/60">Dealer</p>
                        </div>
                      </div>
                    )}
                    {gambleMsg && <p className="mt-2 text-sm text-emerald-100/75">{gambleMsg}</p>}
                    {winCoins > 0 && gambles < MAX_GAMBLES ? (
                      <div className="mt-3 flex justify-center gap-2">
                        <button
                          onClick={gamble}
                          disabled={busy}
                          className="rounded-full bg-red-500 px-5 py-2 text-sm font-bold text-white disabled:opacity-50"
                        >
                          Double it ({gambles + 1}/{MAX_GAMBLES})
                        </button>
                        <button
                          onClick={collect}
                          disabled={busy}
                          className="rounded-full bg-emerald-500 px-5 py-2 text-sm font-bold text-black disabled:opacity-50"
                        >
                          Collect
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={collect}
                        disabled={busy}
                        className="mt-3 rounded-full bg-emerald-500 px-6 py-2 text-sm font-bold text-black disabled:opacity-50"
                      >
                        {winCoins > 0 ? "Collect" : "Continue"}
                      </button>
                    )}
                  </>
                )}

                {phase === "done" && (
                  <>
                    {roundId ? (
                      <button
                        onClick={settleLoss}
                        disabled={busy}
                        className="mt-3 rounded-full bg-emerald-500 px-6 py-2 text-sm font-bold text-black disabled:opacity-50"
                      >
                        {busy ? "…" : "Continue"}
                      </button>
                    ) : (
                      <>
                        {collected > 0 && (
                          <p className="mt-1 text-sm font-bold text-emerald-300">
                            +{collected.toLocaleString()} lifesap collected
                          </p>
                        )}
                        <button
                          onClick={newRound}
                          className="mt-3 rounded-full bg-amber-300 px-6 py-2 text-sm font-bold text-black"
                        >
                          New hand
                        </button>
                      </>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </TableFelt>
  );
}

function label(c: BJCard): string {
  const ranks = ["?", "A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
  const suits: Record<string, string> = { S: "♠", H: "♥", D: "♦", C: "♣" };
  return `${ranks[c.rank] ?? c.rank}${suits[c.suit] ?? ""}`;
}
