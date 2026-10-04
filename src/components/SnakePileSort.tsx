"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import {
  HOUSES,
  PILE_BEST_KEY,
  PILE_CORRECT_POINTS,
  PILE_HINT_COST,
  dailyBestKey,
  pileSortDailyDeal,
  pileSortDeal,
  prettyDailyKey,
  readBest,
  writeBest,
  type HouseId,
  type SortingSnake,
} from "@/lib/snake-sorting";
import { addTokens, recordScore, reportArcadeEvent } from "@/lib/arcade";

/* Tiny local bleeps — the pile table has its own voice. */
function blip(freq: number, dur = 0.09, type: OscillatorType = "sine", delay = 0) {
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.09, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g);
    g.connect(ctx.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
    void ctx.resume?.();
  } catch {
    /* audio unavailable — the game plays on silently */
  }
}
const pop = () => blip(520, 0.08, "triangle");

/* The Hat accepts every placement and reveals nothing until the tally. */
const ACCEPT_LINES = [
  "The Hat accepts it. It reveals nothing.",
  "Placed. The Hat's brim twitches… or does it?",
  "Into the pile. True or false — you'll learn at the tally.",
  "The Hat keeps your secret.",
];
const DRAW_LINES = [
  "The Hat rummages… a serpent emerges!",
  "The Hat offers you a serpent. Where does it belong?",
  "Out it slides — sort it true, keeper.",
];
const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
const shortHouse = (id: HouseId) =>
  HOUSES.find((h) => h.id === id)?.name.replace("House ", "") ?? id;

const PILE_HOUSES = HOUSES.filter((h) => h.id !== "designer");

/* The Sorting Hat is the cursor for the whole pile table (mouse users).
   Touch players get the Hat itself as a visible, tappable character instead. */
const HAT_CURSOR = `url("/arcade/snake-sorting/sorting-hat-cursor-v2.png") 52 10, auto`;
const HAT_ART = "/arcade/snake-sorting/sorting-hat-v2.png";
const HAT_MINI = "/arcade/snake-sorting/sorting-hat-cursor-v2.png";

type DragState = { id: string; x: number; y: number };
type HatMood = "idle" | "dealing" | "happy" | "no";
const DRAG_THRESHOLD = 10;

export default function SnakePileSort({
  onExit,
  mode = "classic",
  dailyKey,
}: {
  onExit: () => void;
  mode?: "classic" | "daily";
  dailyKey?: string;
}) {
  const isDaily = mode === "daily" && !!dailyKey;
  const bestKey = isDaily && dailyKey ? dailyBestKey(dailyKey) : PILE_BEST_KEY;
  const dealFor = () => (isDaily && dailyKey ? pileSortDailyDeal(dailyKey) : pileSortDeal());
  const [order, setOrder] = useState<SortingSnake[]>(() => dealFor());
  const [remaining, setRemaining] = useState<SortingSnake[]>(order);
  const [drawn, setDrawn] = useState<SortingSnake | null>(null);
  const [placed, setPlaced] = useState<Record<string, HouseId>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [score, setScore] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [hintUsed, setHintUsed] = useState(false);
  const [hintOut, setHintOut] = useState<HouseId | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [finished, setFinished] = useState(false);
  const [timeBonus, setTimeBonus] = useState(0);
  const [hatLine, setHatLine] = useState(
    isDaily
      ? "The Daily Hat — the same eight serpents for every keeper today. No hints from yesterday's players…"
      : "Tap the Hat — eight serpents wait inside. The Hat is watching…",
  );
  const [hatMood, setHatMood] = useState<HatMood>("idle");
  const [best, setBest] = useState(0);
  const [isNewBest, setIsNewBest] = useState(false);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [hoverPile, setHoverPile] = useState<HouseId | null>(null);
  const elapsedRef = useRef(0);
  /* Refs mirror the drag/deal lifecycle so handlers always see fresh state. */
  const downRef = useRef<{ id: string; x: number; y: number; pid: number } | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const remainingRef = useRef<SortingSnake[]>(remaining);
  const pileRefs = useRef<Partial<Record<HouseId, HTMLDivElement | null>>>({});

  useEffect(() => {
    if (finished) return;
    const id = window.setInterval(() => {
      elapsedRef.current += 1;
      setElapsed(elapsedRef.current);
    }, 1000);
    return () => window.clearInterval(id);
  }, [finished]);

  /* Escape sets a carried serpent gently back down. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && dragRef.current) {
        dragRef.current = null;
        setDrag(null);
        setHoverPile(null);
        downRef.current = null;
        setHatLine("The Hat sets it gently back down.");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const syncRemaining = (pool: SortingSnake[]) => {
    remainingRef.current = pool;
    setRemaining(pool);
  };

  const calmHat = (after: number, from: HatMood) =>
    window.setTimeout(() => setHatMood((m) => (m === from ? "idle" : m)), after);

  const dealOne = () => {
    const pool = remainingRef.current;
    if (drawn || pool.length === 0 || finished) return;
    const [next, ...rest] = pool;
    syncRemaining(rest);
    setDrawn(next);
    setHatMood("dealing");
    pop();
    setHatLine(pick(DRAW_LINES));
    calmHat(650, "dealing");
  };

  const tapHat = () => {
    if (finished) return;
    if (drawn) {
      setHatLine("One at a time — sort the offered serpent first.");
      setHatMood("no");
      calmHat(500, "no");
      return;
    }
    dealOne();
  };

  const reset = () => {
    const fresh = dealFor();
    setOrder(fresh);
    syncRemaining([...fresh]);
    setDrawn(null);
    setPlaced({});
    setSelected(null);
    setScore(0);
    setCorrectCount(0);
    setHintUsed(false);
    setHintOut(null);
    setElapsed(0);
    elapsedRef.current = 0;
    setFinished(false);
    setTimeBonus(0);
    setIsNewBest(false);
    setHatMood("idle");
    dragRef.current = null;
    setDrag(null);
    setHoverPile(null);
    downRef.current = null;
    setHatLine("A fresh Hat, full of serpents. Tap it.");
  };

  /* Once per game, the Hat will whisper one wrong house — for a price. */
  const askHat = () => {
    if (finished || hintUsed || !drawn) return;
    const wrong = PILE_HOUSES.map((h) => h.id).filter((id) => id !== drawn.house);
    const out = wrong[Math.floor(Math.random() * wrong.length)];
    setHintOut(out);
    setHintUsed(true);
    setHatMood("dealing");
    calmHat(650, "dealing");
    pop();
    setHatLine(
      `The Hat leans close… "Not ${shortHouse(out)}, keeper. That wisdom costs ${PILE_HINT_COST}."`,
    );
  };

  /* A placement is final — right or wrong, the Hat keeps its counsel
     until every serpent is piled, then tallies the truth. */
  const place = (snakeId: string, houseId: HouseId) => {
    if (finished || placed[snakeId]) return;
    const snake = order.find((s) => s.id === snakeId);
    if (!snake) return;
    const next = { ...placed, [snakeId]: houseId };
    setPlaced(next);
    setSelected(null);
    setDrawn(null);
    setHintOut(null);
    pop();
    setHatMood("happy");
    calmHat(700, "happy");
    if (Object.keys(next).length >= order.length) {
      const correct = order.filter((s) => next[s.id] === s.house).length;
      const secs = elapsedRef.current;
      const bonus = Math.max(0, 150 - secs);
      setTimeBonus(bonus);
      setElapsed(secs);
      setCorrectCount(correct);
      const final = Math.max(0, correct * PILE_CORRECT_POINTS + bonus - (hintUsed ? PILE_HINT_COST : 0));
      setScore(final);
      const prev = readBest(bestKey);
      setBest(Math.max(prev, final));
      if (final > prev) {
        writeBest(bestKey, final);
        setIsNewBest(true);
      }
      setFinished(true);
      setHatLine(
        correct === order.length
          ? "A perfect sorting! The Hat bows to your eye, keeper."
          : `The Hat tallies: ${correct} of ${order.length} true.`,
      );
      // Arcade meta-system: tokens, leaderboard, achievements, quests.
      const tokens = Math.min(16, correct * 2);
      if (tokens > 0) addTokens(tokens, `Pile Sort — ${correct}/${order.length} true`);
      recordScore("pile", final, `${correct}/${order.length}`);
      reportArcadeEvent({ type: "pile-complete", correct, total: order.length, score: final });
    } else {
      setHatLine(pick(ACCEPT_LINES));
      /* The Hat offers the next serpent after a beat. */
      window.setTimeout(dealOne, 750);
    }
  };

  const pileAt = (x: number, y: number): HouseId | null => {
    for (const h of PILE_HOUSES) {
      const el = pileRefs.current[h.id];
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return h.id;
    }
    return null;
  };

  const setDragBoth = (d: DragState | null) => {
    dragRef.current = d;
    setDrag(d);
    if (!d) setHoverPile(null);
  };

  const onCardPointerDown = (e: ReactPointerEvent<HTMLButtonElement>, id: string) => {
    if (finished || placed[id]) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    downRef.current = { id, x: e.clientX, y: e.clientY, pid: e.pointerId };
  };

  const onCardPointerMove = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const d = downRef.current;
    if (!d || e.pointerId !== d.pid) return;
    if (!dragRef.current) {
      if (Math.hypot(e.clientX - d.x, e.clientY - d.y) < DRAG_THRESHOLD) return;
      const nd = { id: d.id, x: e.clientX, y: e.clientY };
      dragRef.current = nd;
      setDrag(nd);
      setSelected(null);
      setHatLine("The Hat has it — drop it on its true pile…");
    } else {
      const nd = { id: d.id, x: e.clientX, y: e.clientY };
      dragRef.current = nd;
      setDrag(nd);
    }
    setHoverPile(pileAt(e.clientX, e.clientY));
  };

  const onCardPointerUp = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const d = downRef.current;
    if (!d || e.pointerId !== d.pid) return;
    downRef.current = null;
    const wasDrag = dragRef.current;
    setDragBoth(null);
    if (wasDrag) {
      const hp = pileAt(e.clientX, e.clientY);
      if (hp) place(d.id, hp);
      else setHatLine("Dropped on the floor — the Hat pretends not to see.");
    } else {
      /* A tap without movement toggles the pick-up selection. */
      setSelected((cur) => (cur === d.id ? null : d.id));
    }
  };

  const onCardPointerCancel = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const d = downRef.current;
    if (!d || e.pointerId !== d.pid) return;
    downRef.current = null;
    setDragBoth(null);
  };

  const inHat = remaining.length + (drawn ? 1 : 0);
  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  const hatMoodClass =
    hatMood === "dealing" ? "hat-dealing" : hatMood === "happy" ? "hat-happy" : hatMood === "no" ? "hat-no" : "";

  return (
    <div
      className="pile-sort-hat ss-rise mx-auto flex w-full max-w-2xl flex-col px-4 pb-6 pt-4"
      style={{ cursor: HAT_CURSOR }}
      onDragStart={(e) => e.preventDefault()}
    >
      <style>{`
        .pile-sort-hat, .pile-sort-hat * { cursor: ${HAT_CURSOR}; }
        @keyframes hat-dealing { 0%,100% { transform: rotate(0deg); } 25% { transform: rotate(-10deg) translateY(-6px); } 75% { transform: rotate(9deg) translateY(-4px); } }
        .hat-dealing { animation: hat-dealing .55s ease; }
        @keyframes hat-happy { 0%,100% { transform: translateY(0); } 35% { transform: translateY(-12px); } 70% { transform: translateY(2px); } }
        .hat-happy { animation: hat-happy .6s ease; }
        @keyframes hat-no { 0%,100% { transform: translateX(0) rotate(0deg); } 25% { transform: translateX(-9px) rotate(-4deg); } 75% { transform: translateX(9px) rotate(4deg); } }
        .hat-no { animation: hat-no .4s ease; }
        @keyframes hat-deal { 0% { transform: translateY(-26px) scale(.65); opacity: 0; } 60% { opacity: 1; } 100% { transform: translateY(0) scale(1); opacity: 1; } }
        .hat-deal { animation: hat-deal .45s ease-out; }
        @keyframes pile-drop { 0% { transform: scale(1.3); opacity: .3; } 100% { transform: scale(1); opacity: 1; } }
        .pile-drop { animation: pile-drop .3s ease-out; }
        @keyframes pile-lift { 0% { transform: translateY(0) scale(1); } 100% { transform: translateY(-8px) scale(1.03); } }
        .pile-lift { animation: pile-lift .18s ease-out both; }
      `}</style>

      {/* The carried serpent rides under the Hat while dragged. */}
      {drag && drawn?.photo && (
        <div
          aria-hidden
          className="pointer-events-none fixed left-0 top-0 z-[80] flex flex-col items-center"
          style={{
            transform: `translate(${drag.x}px, ${drag.y}px) translate(-50%, -108%) rotate(-5deg)`,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={HAT_MINI} alt="" draggable={false} className="relative z-10 -mb-4 h-12 w-14 drop-shadow-[0_6px_12px_rgba(0,0,0,.6)]" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={drawn.photo}
            alt=""
            draggable={false}
            className="h-24 w-32 rounded-xl border-2 border-amber-200/90 object-cover shadow-[0_18px_50px_rgba(0,0,0,.65)]"
          />
        </div>
      )}

      {/* HUD */}
      <header className="mb-3 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onExit}
          className="rounded-full border border-white/15 bg-black/60 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/70 backdrop-blur-sm transition active:scale-95"
        >
          ← Hat
        </button>
        <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-teal-200/80">
          {isDaily && dailyKey ? `🎩 Daily · ${prettyDailyKey(dailyKey)}` : "🎩 Pile sort"}
        </p>
        <div className="flex items-center gap-2 text-[12px] font-bold">
          <span className="rounded-full border border-white/15 bg-black/60 px-2.5 py-1 text-amber-200">
            {Object.keys(placed).length}/{order.length}
          </span>
          <span className="rounded-full border border-white/15 bg-black/60 px-2.5 py-1 text-white/60">
            {fmt(elapsed)}
          </span>
        </div>
      </header>

      <p className="mb-3 min-h-[20px] text-center text-[13px] italic text-amber-100/80">
        {hatLine}
      </p>

      {!finished ? (
        <>
          {/* The Hat and its offering */}
          <div className="flex items-center justify-center gap-3 sm:gap-5">
            <button
              type="button"
              onClick={tapHat}
              aria-label={drawn ? "The Sorting Hat — sort the offered serpent first" : "Tap the Sorting Hat to draw a serpent"}
              className={`relative shrink-0 touch-manipulation rounded-full transition active:scale-90 ${hatMoodClass}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={HAT_ART}
                alt="The Sorting Hat"
                draggable={false}
                className="h-28 w-28 object-contain drop-shadow-[0_10px_28px_rgba(0,0,0,.55)] sm:h-36 sm:w-36"
              />
              <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full border border-amber-200/30 bg-black/75 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-amber-200">
                {inHat} in the Hat
              </span>
            </button>

            <div className="flex min-h-[132px] flex-1 items-center justify-center rounded-2xl border-2 border-dashed border-white/15 bg-black/40 p-2 sm:min-h-[152px]">
              {drawn ? (
                <button
                  key={drawn.id}
                  type="button"
                  onPointerDown={(e) => onCardPointerDown(e, drawn.id)}
                  onPointerMove={onCardPointerMove}
                  onPointerUp={onCardPointerUp}
                  onPointerCancel={onCardPointerCancel}
                  onContextMenu={(e) => e.preventDefault()}
                  onClick={(e) => {
                    /* Keyboard activation only — pointer taps are handled on pointer-up. */
                    if (e.detail === 0) setSelected((cur) => (cur === drawn.id ? null : drawn.id));
                  }}
                  className={`hat-deal relative w-full max-w-[220px] touch-none select-none overflow-hidden rounded-2xl border bg-black/70 transition active:scale-95 ${
                    drag?.id === drawn.id ? "opacity-30" : ""
                  } ${
                    selected === drawn.id
                      ? "pile-lift border-amber-200/80 shadow-[0_0_24px_rgba(251,191,36,.35)]"
                      : "border-white/10"
                  }`}
                  aria-label="Offered serpent — drag it to its house pile, or tap to pick it up"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={drawn.photo ?? ""}
                    alt="Serpent offered by the Sorting Hat"
                    className="aspect-[4/3] w-full object-cover"
                    draggable={false}
                  />
                  {selected === drawn.id && (
                    <span className="absolute left-2 top-2 rounded-full bg-amber-300 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-black">
                      In the Hat&apos;s grip — tap a pile
                    </span>
                  )}
                  {hintOut && (
                    <span className="absolute bottom-2 left-2 rounded-full bg-black/75 px-2 py-0.5 text-[10px] font-bold text-violet-200">
                      🚫 Not {shortHouse(hintOut)}
                    </span>
                  )}
                </button>
              ) : (
                <p className="px-3 text-center text-[12px] italic text-white/35">
                  {remaining.length > 0 ? "Tap the Hat to draw a serpent…" : "The Hat is empty."}
                </p>
              )}
            </div>
          </div>

          {/* Ask the Hat — one whisper per game, for a price. */}
          {!finished && drawn && (
            <div className="mt-2 flex justify-center">
              <button
                type="button"
                onClick={askHat}
                disabled={hintUsed}
                className={`rounded-full border px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.15em] backdrop-blur-sm transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-35 ${
                  hintUsed
                    ? "border-white/10 bg-black/60 text-white/40"
                    : "border-violet-300/40 bg-violet-950/60 text-violet-100"
                }`}
              >
                {hintUsed ? "🎩 The Hat has spoken" : `🎩 Ask the Hat · −${PILE_HINT_COST}`}
              </button>
            </div>
          )}

          {/* House piles */}
          <p className="mt-4 text-center text-[11px] uppercase tracking-[0.25em] text-white/40">
            The four piles · {Object.keys(placed).length}/{order.length} sorted
          </p>
          <div className="mt-2 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            {PILE_HOUSES.map((h) => {
              const inPile = order.filter((s) => placed[s.id] === h.id);
              const hot = hoverPile === h.id;
              return (
                <div
                  key={h.id}
                  ref={(el) => {
                    pileRefs.current[h.id] = el;
                  }}
                  role="button"
                  tabIndex={0}
                  aria-label={`${h.name} pile`}
                  onClick={() => selected && drawn && place(selected, h.id)}
                  onKeyDown={(e) => {
                    if ((e.key === "Enter" || e.key === " ") && selected && drawn) {
                      e.preventDefault();
                      place(selected, h.id);
                    }
                  }}
                  className={`rounded-2xl border bg-black/60 p-2.5 backdrop-blur-sm transition ${
                    hot
                      ? "scale-[1.04] border-amber-200 shadow-[0_0_28px_rgba(251,191,36,.45)]"
                      : selected
                        ? "animate-pulse border-amber-200/60"
                        : "border-white/12"
                  }`}
                  style={{ boxShadow: hot ? undefined : `inset 0 0 0 1px ${h.glow}` }}
                >
                  <p className="text-center text-[12px] font-black" style={{ color: h.color }}>
                    {h.name.replace("House ", "")}
                  </p>
                  <p className="text-center text-[10px] uppercase tracking-wider text-white/40">
                    {inPile.length} sorted
                  </p>
                  <div className="mt-1.5 flex min-h-[44px] flex-wrap justify-center gap-1">
                    {inPile.map((s) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={s.id}
                        src={s.photo ?? ""}
                        alt=""
                        draggable={false}
                        className="pile-drop h-10 w-10 rounded-lg border border-white/20 object-cover"
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          <p className="mt-3 text-center text-[11px] text-white/35">
            Tap the Hat, then drag each serpent onto its house pile — or tap the serpent, then tap a pile.
          </p>
        </>
      ) : (
        /* Results */
        <div className="ss-rise rounded-2xl border border-white/10 bg-black/65 p-4 text-center backdrop-blur-sm">
          <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-teal-200/70">
            The Hat&apos;s tally
          </p>
          <p className="mt-1 text-4xl font-black text-amber-200">
            {correctCount}<span className="text-xl text-white/40">/{order.length}</span>
          </p>
          <p className="mt-0.5 text-[13px] font-bold text-white/60">
            {Math.round((correctCount / Math.max(1, order.length)) * 100)}% true · {score} pts
          </p>
          {isNewBest && <p className="mt-1 text-[13px] font-bold text-emerald-300">✦ New best ✦</p>}
          <div className="mx-auto mt-3 grid max-w-[320px] grid-cols-3 gap-2 text-[12px]">
            <div className="rounded-xl border border-white/10 bg-white/[.04] p-2">
              <p className="font-black text-white/90">{fmt(elapsed)}</p>
              <p className="text-white/45">time</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[.04] p-2">
              <p className="font-black text-white/90">+{timeBonus}</p>
              <p className="text-white/45">speed bonus</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[.04] p-2">
              <p className="font-black text-white/90">{correctCount * PILE_CORRECT_POINTS}</p>
              <p className="text-white/45">sort points</p>
            </div>
          </div>
          {hintUsed && (
            <p className="mt-2 text-[12px] italic text-violet-200/70">
              −{PILE_HINT_COST} pts — the Hat&apos;s wisdom isn&apos;t free
            </p>
          )}
          <ul className="mt-3 space-y-1.5 text-left">
            {order.map((s, i) => {
              const was = placed[s.id];
              const ok = was === s.house;
              return (
                <li key={s.id} className="flex items-center gap-2 text-[12px]">
                  <span className={`w-4 shrink-0 font-black ${ok ? "text-emerald-300" : "text-red-300"}`}>
                    {ok ? "✓" : "✗"}
                  </span>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={s.photo ?? ""} alt="" draggable={false} className="h-8 w-8 rounded-lg object-cover" />
                  <span className="font-semibold text-white/90">Serpent {i + 1}</span>
                  <span className="truncate text-white/50">
                    {ok ? shortHouse(was) : `piled ${shortHouse(was)}, was ${shortHouse(s.house)}`}
                  </span>
                </li>
              );
            })}
          </ul>
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={reset}
              className="flex-1 rounded-2xl bg-gradient-to-b from-amber-300 to-amber-500 px-4 py-3 text-[14px] font-black uppercase tracking-wider text-black transition active:scale-95"
            >
              Sort again
            </button>
            <button
              type="button"
              onClick={onExit}
              className="flex-1 rounded-2xl border border-white/15 bg-black/60 px-4 py-3 text-[14px] font-black uppercase tracking-wider text-white/80 transition active:scale-95"
            >
              Back to the Hat
            </button>
          </div>
          {best > 0 && (
            <p className="mt-2 text-[12px] text-white/45">
              Best pile score: <span className="font-bold text-amber-200">{best}</span>
            </p>
          )}
        </div>
      )}
    </div>
  );
}
