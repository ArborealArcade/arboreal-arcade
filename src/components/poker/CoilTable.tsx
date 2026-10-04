"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { CardView } from "@/components/poker/CardView";
import { ChipStack } from "@/components/poker/ChipStack";
import { TableFelt } from "@/components/poker/TableFelt";
import { useBankroll } from "@/components/poker/useBankroll";
import { reportArcadeEvent } from "@/lib/arcade";
import {
  aiTakeTurn,
  applyAction,
  createTable,
  getLegalActions,
  makeDeck,
  makeRng,
  shuffle,
  type LegalAction,
  type TableState,
} from "@/lib/poker/holdem";
import { pickTalk, type TalkEvent } from "@/lib/poker/talk";
import { playSfx, unlockAudio } from "@/lib/poker/sfx";

const BUY_IN = 500;

/** Deal the next hand on an existing table, keeping stacks and rotating the button. */
function dealNextHand(prev: TableState): TableState {
  const seats = prev.seats.map((s) => ({
    ...s,
    bet: 0,
    hole: [],
    folded: false,
    allIn: false,
    hasActed: false,
  }));
  const live = (i: number) => seats[i].stack > 0;
  const deck = shuffle(makeDeck(), makeRng((Math.random() * 1e9) | 0));
  const t: TableState = {
    seats,
    board: [],
    deck,
    dealer: prev.dealer,
    street: "preflop",
    actingSeat: -1,
    minRaise: prev.bigBlind,
    currentBet: 0,
    pending: [],
    actedSinceFullRaise: [],
    contributed: seats.map(() => 0),
    handNo: prev.handNo + 1,
    smallBlind: prev.smallBlind,
    bigBlind: prev.bigBlind,
    results: undefined,
  };
  let d = t.dealer;
  for (let k = 1; k <= 6; k++) {
    d = (d + 1) % 6;
    if (live(d)) break;
  }
  t.dealer = d;
  let sb = d;
  for (let k = 1; k <= 6; k++) {
    const i = (d + k) % 6;
    if (live(i)) {
      sb = i;
      break;
    }
  }
  let bb = sb;
  for (let k = 1; k <= 6; k++) {
    const i = (sb + k) % 6;
    if (live(i)) {
      bb = i;
      break;
    }
  }
  const post = (i: number, amt: number) => {
    const p = t.seats[i];
    const paid = Math.min(amt, p.stack);
    p.stack -= paid;
    p.bet += paid;
    t.contributed[i] += paid;
    if (p.stack === 0) p.allIn = true;
  };
  post(sb, t.smallBlind);
  post(bb, t.bigBlind);
  t.currentBet = Math.max(t.seats[sb].bet, t.seats[bb].bet);
  for (let round = 0; round < 2; round++) {
    for (let k = 1; k <= 6; k++) {
      const i = (t.dealer + k) % 6;
      const c = t.deck.pop();
      if (c) t.seats[i].hole.push(c);
    }
  }
  const canAct = (i: number) => !t.seats[i].folded && !t.seats[i].allIn && t.seats[i].stack > 0;
  t.pending = t.seats.map((_, i) => i).filter(canAct);
  let first = -1;
  for (let k = 1; k <= 6; k++) {
    const i = (bb + k) % 6;
    if (canAct(i)) {
      first = i;
      break;
    }
  }
  t.actingSeat = first;
  return t;
}

type Phase = "lobby" | "playing" | "over";

export function CoilTable() {
  const { balance, loading, placeBet, settleBet, rebuy } = useBankroll();
  const [phase, setPhase] = useState<Phase>("lobby");
  const [table, setTable] = useState<TableState | null>(null);
  const [roundId, setRoundId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [talk, setTalk] = useState<{ name: string; text: string } | null>(null);
  const [raiseTo, setRaiseTo] = useState(0);
  const [cashedOut, setCashedOut] = useState<number | null>(null);
  const aiTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const say = useCallback((name: string, event: TalkEvent) => {
    const line = pickTalk(name, event);
    if (line) setTalk({ name, text: line });
  }, []);

  const startSession = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      unlockAudio();
      const id = await placeBet("holdem", BUY_IN);
      const t = createTable("You", BUY_IN);
      setTable(t);
      setRoundId(id);
      setPhase("playing");
      setCashedOut(null);
      playSfx("shuffle");
      playSfx("deal");
      say("Mara the Breeder", "game-start");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not buy in.");
    } finally {
      setBusy(false);
    }
  }, [placeBet, say]);

  const heroAct = useCallback(
    (action: LegalAction["action"], amount?: number) => {
      if (!table || table.actingSeat !== 0) return;
      unlockAudio();
      const t = applyAction(table, 0, action, amount);
      playSfx(action === "fold" ? "click" : action === "check" ? "click" : "chip");
      if (action === "fold") say("Slink the Poacher", "bluff");
      setTable(t);
    },
    [table, say]
  );

  // AI driver: when an AI seat is acting, take its turn after a beat.
  useEffect(() => {
    if (phase !== "playing" || !table) return;
    if (table.street === "done") return;
    if (table.actingSeat <= 0) return;
    aiTimer.current = setTimeout(() => {
      setTable((t) => (t ? aiTakeTurn(t) : t));
      playSfx("click");
    }, 750);
    return () => {
      if (aiTimer.current) clearTimeout(aiTimer.current);
    };
  }, [phase, table]);

  // Hand-end reactions (deferred so the effect body stays side-effect-light).
  const handDone = phase === "playing" && table?.street === "done";
  useEffect(() => {
    if (!handDone || !table?.results) return;
    const results = table.results;
    const id = setTimeout(() => {
      const heroWon = results.some((r) => r.seat === 0 && r.amount > 0);
      const pot = results.reduce((n, r) => n + r.amount, 0);
      if (heroWon) {
        playSfx("win", pot);
        say("Pip the Hatchling", "player-win");
      } else {
        playSfx("lose");
        const winner = results[0];
        if (winner && winner.seat !== 0) say(winner.name, pot > 400 ? "big-pot" : "ai-win");
      }
    }, 0);
    return () => clearTimeout(id);
  }, [handDone, table, say]);

  const nextHand = useCallback(async () => {
    if (!table || !roundId) return;
    setError(null);
    try {
      const hero = table.seats[0];
      let base = table;
      if (hero.stack < table.bigBlind) {
        // Auto top-up from the bankroll so the session can continue.
        await rebuy(roundId, BUY_IN);
        base = {
          ...table,
          seats: table.seats.map((s, i) => (i === 0 ? { ...s, stack: s.stack + BUY_IN } : s)),
        };
      }
      const t = dealNextHand(base);
      setTable(t);
      playSfx("shuffle");
      playSfx("deal");
      if (Math.random() < 0.3) say("Vesper", "idle");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not deal the next hand.");
    }
  }, [table, roundId, rebuy, say]);

  const cashOut = useCallback(async () => {
    if (!table || !roundId) return;
    setBusy(true);
    setError(null);
    try {
      const heroStack = table.seats[0].stack;
      await settleBet(roundId, heroStack);
      setCashedOut(heroStack);
      setRoundId(null);
      setTable(null);
      setPhase("over");
      reportArcadeEvent({ type: "poker-hand", game: "holdem", net: heroStack - BUY_IN });
      playSfx("win", heroStack);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not cash out.");
    } finally {
      setBusy(false);
    }
  }, [table, roundId, settleBet]);

  const heroStack = table?.seats[0].stack ?? 0;
  const actions: LegalAction[] = table && table.actingSeat === 0 ? getLegalActions(table) : [];
  const raiseAction = actions.find((a) => a.action === "raise");
  const pot = table ? table.contributed.reduce((n, c) => n + c, 0) : 0;

  // Raise target, clamped to the legal window; no effect needed — the slider
  // and button always display the clamped value.
  const raiseMin = raiseAction?.amount ?? 0;
  const raiseMax = raiseAction?.max ?? raiseMin;
  const raiseVal = Math.min(Math.max(raiseTo || raiseMin, raiseMin), raiseMax);

  return (
    <TableFelt className="min-h-dvh">
      <div className="mx-auto w-full max-w-4xl px-4 py-6">
        <div className="flex items-center justify-between">
          <Link href="/arcade/snake-poker" className="text-sm text-emerald-100/60 hover:text-amber-200">
            ← The Den
          </Link>
          <div className="text-sm text-emerald-100/80">
            <span className="font-bold text-amber-200">{loading ? "…" : balance.toLocaleString()}</span> lifesap
          </div>
        </div>

        <h1 className="mt-4 text-2xl font-black text-amber-100">Coil — Serpent Hold&apos;em</h1>
        <p className="text-xs text-emerald-100/50">Blinds 10/20 · Buy in 500 · Five snake pros at the table</p>

        {error && (
          <div className="mt-4 rounded-xl border border-red-400/40 bg-red-950/60 px-4 py-2 text-sm text-red-200">
            {error}
          </div>
        )}

        {talk && phase === "playing" && (
          <div className="mt-3 rounded-xl border border-emerald-200/15 bg-black/50 px-4 py-2 text-sm">
            <span className="font-bold text-amber-200">{talk.name}:</span>{" "}
            <span className="italic text-emerald-100/80">“{talk.text}”</span>
          </div>
        )}

        {phase === "lobby" && (
          <div className="mt-8 rounded-2xl border border-emerald-200/15 bg-black/45 p-6 text-center">
            <p className="text-sm text-emerald-100/70">
              Take a seat against Mara the Breeder, Slink the Poacher, Old Bark, Vesper and Pip the
              Hatchling.
            </p>
            <button
              onClick={startSession}
              disabled={busy}
              className="mt-5 rounded-full bg-emerald-500 px-8 py-2.5 font-bold text-black disabled:opacity-50"
            >
              {busy ? "Seating…" : `Buy in for ${BUY_IN} lifesap`}
            </button>
          </div>
        )}

        {phase === "over" && (
          <div className="mt-8 rounded-2xl border border-emerald-200/15 bg-black/45 p-6 text-center">
            <p className="text-lg font-black text-amber-100">Cashed out</p>
            <p className="mt-1 text-sm text-emerald-100/70">
              You left the table with{" "}
              <span className="font-bold text-emerald-300">{(cashedOut ?? 0).toLocaleString()}</span> lifesap.
            </p>
            <button
              onClick={startSession}
              disabled={busy}
              className="mt-5 rounded-full bg-emerald-500 px-8 py-2.5 font-bold text-black disabled:opacity-50"
            >
              Sit back down
            </button>
          </div>
        )}

        {phase === "playing" && table && (
          <div className="mt-6">
            {/* Board */}
            <div className="rounded-2xl border border-emerald-200/10 bg-black/40 p-4">
              <div className="flex items-center justify-between text-xs text-emerald-100/60">
                <span className="font-semibold uppercase tracking-widest">
                  {table.street === "done" ? "Hand complete" : table.street}
                </span>
                <span className="flex items-center gap-2">
                  Pot <ChipStack amount={pot} />
                </span>
              </div>
              <div className="mt-3 flex min-h-16 justify-center gap-2">
                {table.board.map((c, i) => (
                  <CardView
                    key={i}
                    rank={c.rank}
                    suit={c.suit}
                    size="fluid"
                    className="min-w-0 flex-1 max-w-[72px]"
                  />
                ))}
                {table.board.length === 0 && (
                  <p className="self-center text-xs text-emerald-100/30">No community cards yet</p>
                )}
              </div>
            </div>

            {/* Seats */}
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {table.seats.map((s, i) => {
                const isActing = table.actingSeat === i && table.street !== "done";
                const showCards =
                  i === 0 || table.street === "done" || table.street === "showdown";
                return (
                  <div
                    key={i}
                    className={`rounded-xl border p-2.5 ${
                      isActing
                        ? "border-amber-200/60 bg-black/60"
                        : "border-emerald-200/10 bg-black/35"
                    } ${s.folded ? "opacity-40" : ""}`}
                  >
                    <div className="flex items-center justify-between">
                      <p className="truncate text-xs font-bold text-amber-100/90">
                        {s.name}
                        {i === table.dealer ? " 🃏" : ""}
                      </p>
                      <p className="text-xs text-emerald-100/60">{s.stack}</p>
                    </div>
                    <div className="mt-1.5 flex gap-1">
                      {s.hole.length > 0 &&
                        (showCards ? (
                          s.hole.map((c, j) => <CardView key={j} rank={c.rank} suit={c.suit} size="sm" />)
                        ) : (
                          <>
                            <CardView rank={0} suit="S" faceDown size="sm" />
                            <CardView rank={0} suit="S" faceDown size="sm" />
                          </>
                        ))}
                    </div>
                    <p className="mt-1 h-4 text-[11px] text-emerald-100/50">
                      {s.folded ? "folded" : s.allIn ? "all in" : s.bet > 0 ? `bet ${s.bet}` : ""}
                    </p>
                  </div>
                );
              })}
            </div>

            {/* Hero actions */}
            {table.street !== "done" && table.actingSeat === 0 && (
              <div className="mt-4 rounded-2xl border border-amber-200/25 bg-black/50 p-4">
                <p className="text-xs text-emerald-100/60">
                  Your stack <span className="font-bold text-amber-200">{heroStack}</span>
                  {table.currentBet > table.seats[0].bet &&
                    ` · ${table.currentBet - table.seats[0].bet} to call`}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {actions.map((a) => {
                    if (a.action === "raise" || a.action === "allin") return null;
                    return (
                      <button
                        key={a.action}
                        onClick={() => heroAct(a.action)}
                        className="rounded-full bg-emerald-500 px-5 py-2 text-sm font-bold text-black"
                      >
                        {a.action === "fold" ? "Fold" : a.action === "check" ? "Check" : `Call ${a.amount}`}
                      </button>
                    );
                  })}
                  {raiseAction && (
                    <div className="flex w-full flex-wrap items-center gap-2 pt-1">
                      <input
                        type="range"
                        min={raiseMin}
                        max={raiseMax}
                        value={raiseVal}
                        onChange={(e) => setRaiseTo(Number(e.target.value))}
                        className="min-w-32 flex-1"
                        aria-label="Raise to"
                      />
                      <button
                        onClick={() => heroAct("raise", raiseVal)}
                        className="rounded-full bg-amber-300 px-5 py-2 text-sm font-bold text-black"
                      >
                        Raise to {raiseVal}
                      </button>
                      {actions.some((a) => a.action === "allin") && (
                        <button
                          onClick={() => heroAct("allin")}
                          className="rounded-full bg-red-500 px-5 py-2 text-sm font-bold text-white"
                        >
                          All in
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Waiting on AI */}
            {table.street !== "done" && table.actingSeat > 0 && (
              <p className="mt-4 text-center text-sm text-emerald-100/50">
                {table.seats[table.actingSeat].name} is thinking…
              </p>
            )}

            {/* Results */}
            {table.street === "done" && table.results && (
              <div className="mt-4 rounded-2xl border border-amber-200/25 bg-black/50 p-4 text-center">
                <p className="text-sm font-bold uppercase tracking-widest text-emerald-100/50">Hand result</p>
                <div className="mt-2 space-y-1">
                  {table.results.map((r, i) => (
                    <p key={i} className="text-sm text-emerald-100/80">
                      <span className="font-bold text-amber-100">{r.name}</span> wins{" "}
                      <span className="font-bold text-emerald-300">{r.amount}</span>
                      {r.handName ? ` · ${r.handName}` : ""}
                    </p>
                  ))}
                </div>
                <div className="mt-4 flex justify-center gap-2">
                  <button
                    onClick={nextHand}
                    className="rounded-full bg-emerald-500 px-6 py-2 text-sm font-bold text-black"
                  >
                    Next hand
                  </button>
                  <button
                    onClick={cashOut}
                    disabled={busy}
                    className="rounded-full border border-emerald-200/25 px-6 py-2 text-sm font-bold text-emerald-100/80 disabled:opacity-50"
                  >
                    Cash out {heroStack}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </TableFelt>
  );
}
