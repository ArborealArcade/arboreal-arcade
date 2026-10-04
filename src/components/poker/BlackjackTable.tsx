"use client";

import Link from "next/link";
import { useCallback, useRef, useState } from "react";
import { CardView } from "@/components/poker/CardView";
import { ChipStack } from "@/components/poker/ChipStack";
import { TableFelt } from "@/components/poker/TableFelt";
import { useBankroll } from "@/components/poker/useBankroll";
import { reportArcadeEvent } from "@/lib/arcade";
import {
  bjApply,
  bjDealerPlay,
  bjLegalActions,
  bjSettle,
  createShoe,
  dealBJ,
  handLabel,
  type BJCard,
  type BJTableState,
} from "@/lib/poker/blackjack";
import { playSfx, unlockAudio } from "@/lib/poker/sfx";
import { playHankScaleLine } from "@/lib/hank-scale-voice";

const BETS = [10, 25, 50, 100, 250, 500];

type Phase = "betting" | "playing" | "done";

export function BlackjackTable() {
  const { balance, loading, placeBet, settleBet } = useBankroll();
  const [bet, setBet] = useState(25);
  const [phase, setPhase] = useState<Phase>("betting");
  const [table, setTable] = useState<BJTableState | null>(null);
  const [roundId, setRoundId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const riskedRef = useRef(0);
  const openingBetRef = useRef(0);
  const [risked, setRisked] = useState(0);
  const [shoe, setShoe] = useState<BJCard[]>(() => createShoe(4, Math.random));

  const settleTable = useCallback(
    async (t: BJTableState, roundId: string) => {
      const settled = bjSettle(t);
      setShoe(settled.shoe);
      const payout = (settled.result ?? []).reduce((n, r) => n + r.payout, 0);
      const r = riskedRef.current;
      const opening = openingBetRef.current;
      const wins = (settled.result ?? []).filter(
        (r2) => r2.outcome === "win" || r2.outcome === "blackjack"
      ).length;
      playSfx(wins > 0 ? "win" : "lose", payout);
      playHankScaleLine(wins > 0 ? 27 : 28);
      setTable(settled);
      setPhase("done");
      await settleBet(roundId, payout, { risked: r, bet: opening });
      setRoundId(null);
      reportArcadeEvent({ type: "poker-hand", game: "blackjack", net: payout - r });
    },
    [settleBet]
  );

  const deal = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      unlockAudio();
      const id = await placeBet("blackjack", bet);
      openingBetRef.current = bet;
      riskedRef.current = bet;
      setRisked(bet);
      const t0 = dealBJ(shoe, bet, Math.random);
      setShoe(t0.shoe); // continue the same shoe; the engine reshuffles when low
      let t = t0;
      playSfx("shuffle");
      playSfx("deal");
      setTable(t);
      setRoundId(id);
      if (t.phase === "dealer") {
        // Natural at deal: run the dealer out and settle immediately.
        t = bjDealerPlay(t);
        await settleTable(t, id);
      } else {
        setPhase("playing");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not deal.");
    } finally {
      setBusy(false);
    }
  }, [busy, bet, placeBet, settleTable, shoe]);

  const act = useCallback(
    async (action: string) => {
      if (!table || busy || !roundId) return;
      setBusy(true);
      setError(null);
      try {
        unlockAudio();
        const addRisk =
          action === "double"
            ? (table.hands[table.activeHand]?.bet ?? bet)
            : action === "split"
              ? bet
              : action === "insurance-yes"
                ? bet / 2
                : 0;
        if (addRisk > 0) {
          riskedRef.current += addRisk;
          setRisked(riskedRef.current);
        }
        let t = bjApply(table, action);
        playSfx(action === "hit" ? "deal" : action === "stand" ? "click" : "chip");
        if (t.phase === "dealer") {
          // Small beat so the player sees their final cards before the dealer plays.
          await new Promise((r) => setTimeout(r, 450));
          t = bjDealerPlay(t);
          playSfx("flip");
          await settleTable(t, roundId);
          return;
        }
        setTable(t);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Illegal action.");
      } finally {
        setBusy(false);
      }
    },
    [table, busy, roundId, bet, settleTable]
  );

  const newRound = () => {
    setTable(null);
    setPhase("betting");
    setError(null);
  };

  const actions = table && phase === "playing" ? bjLegalActions(table) : [];
  const results = table?.result ?? [];
  const net =
    phase === "done" && results.length > 0
      ? results.reduce((n, r) => n + r.payout, 0) - risked
      : 0;

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

        <h1 className="mt-4 text-2xl font-black text-amber-100">Canopy Blackjack</h1>
        <p className="text-xs text-emerald-100/50">Dealer stands on all 17s · Blackjack pays 3:2 · Limits 10–500</p>

        {error && (
          <div className="mt-4 rounded-xl border border-red-400/40 bg-red-950/60 px-4 py-2 text-sm text-red-200">
            {error}
          </div>
        )}

        {phase === "betting" && (
          <div className="mt-8 rounded-2xl border border-emerald-200/15 bg-black/45 p-6 text-center">
            <p className="text-sm text-emerald-100/70">Place your bet</p>
            <div className="mt-3 flex flex-wrap justify-center gap-2">
              {BETS.map((b) => (
                <button
                  key={b}
                  onClick={() => {
                    setBet(b);
                    playSfx("chip");
                  }}
                  className={`rounded-full px-4 py-2 text-sm font-bold ${
                    bet === b ? "bg-amber-300 text-black" : "border border-emerald-200/20 text-emerald-100/80"
                  }`}
                >
                  {b}
                </button>
              ))}
            </div>
            <button
              onClick={deal}
              disabled={busy}
              className="mt-5 rounded-full bg-emerald-500 px-8 py-2.5 font-bold text-black disabled:opacity-50"
            >
              {busy ? "Dealing…" : `Deal for ${bet} lifesap`}
            </button>
          </div>
        )}

        {table && phase !== "betting" && (
          <div className="mt-6">
            {/* Dealer */}
            <div className="flex items-end justify-between">
              <p className="text-xs font-semibold uppercase tracking-widest text-emerald-100/50">Dealer</p>
              {table.phase === "done" && table.dealer.length > 0 && (
                <p className="text-xs text-emerald-100/60">{handLabel(table.dealer)}</p>
              )}
            </div>
            <div className="mt-2 flex gap-2">
              {(table.phase === "done" ? table.dealer : table.dealer.slice(0, 1)).map((c, i) => (
                <CardView
                  key={i}
                  rank={c.rank}
                  suit={c.suit}
                  size="fluid"
                  className="min-w-0 flex-1 max-w-[72px]"
                />
              ))}
              {table.phase !== "done" && table.dealer.length > 1 && (
                <CardView rank={0} suit="S" faceDown size="fluid" className="min-w-0 flex-1 max-w-[72px]" />
              )}
            </div>

            {/* Player hands */}
            <div className="mt-6 space-y-4">
              {table.hands.map((h, hi) => (
                <div
                  key={hi}
                  className={`rounded-2xl border p-3 ${
                    hi === table.activeHand && phase === "playing"
                      ? "border-amber-200/50 bg-black/50"
                      : "border-emerald-200/10 bg-black/30"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-emerald-100/60">
                      Hand {hi + 1} · bet {h.bet}
                      {h.doubled ? " (doubled)" : ""}
                    </p>
                    <p className="text-xs font-semibold text-amber-100/90">{handLabel(h.cards)}</p>
                  </div>
                  <div className="mt-2 flex gap-2">
                    {h.cards.map((c, i) => (
                      <CardView
                        key={i}
                        rank={c.rank}
                        suit={c.suit}
                        size="fluid"
                        className="min-w-0 flex-1 max-w-[72px]"
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Actions */}
            {phase === "playing" && actions.length > 0 && (
              <div className="mt-5 flex flex-wrap gap-2">
                {actions.map((a) => (
                  <button
                    key={a}
                    onClick={() => act(a)}
                    disabled={busy}
                    className="rounded-full bg-emerald-500 px-5 py-2 text-sm font-bold text-black disabled:opacity-50"
                  >
                    {a === "insurance-yes"
                      ? "Take insurance"
                      : a === "insurance-no"
                        ? "No insurance"
                        : a[0].toUpperCase() + a.slice(1)}
                  </button>
                ))}
              </div>
            )}

            {/* Results */}
            {phase === "done" && (
              <div className="mt-5 rounded-2xl border border-amber-200/25 bg-black/50 p-4 text-center">
                <div className="flex items-center justify-center gap-3">
                  <ChipStack amount={Math.abs(net)} />
                  <p className={`text-lg font-black ${net >= 0 ? "text-emerald-300" : "text-red-300"}`}>
                    {net >= 0 ? `+${net}` : net} lifesap
                  </p>
                </div>
                <div className="mt-2 space-y-1">
                  {results.map((r, i) => (
                    <p key={i} className="text-xs text-emerald-100/60">
                      Hand {r.handIndex + 1}: {r.outcome.replace(/-/g, " ")}
                    </p>
                  ))}
                </div>
                <button
                  onClick={newRound}
                  className="mt-4 rounded-full bg-amber-300 px-6 py-2 text-sm font-bold text-black"
                >
                  Next hand
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </TableFelt>
  );
}
