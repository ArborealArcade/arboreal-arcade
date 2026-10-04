"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  QUESTIONS_PER_ROUND,
  QUESTION_SECONDS,
  TRIVIA_MODES,
  buildRound,
  modeDef,
  rankFor,
  readBestScore,
  scoreFor,
  writeBestScore,
  type TriviaMode,
  type TriviaQuestion,
} from "@/lib/reptile-trivia";
import { addTokens, recordScore, reportArcadeEvent } from "@/lib/arcade";

type Phase = "intro" | "question" | "reveal" | "results";

const LETTERS = ["A", "B", "C", "D"];

const CATEGORY_STYLES: Record<string, string> = {
  "Green Tree Pythons": "border-emerald-300/20 bg-emerald-300/[.07] text-emerald-200",
  "Emerald Tree Boas": "border-teal-300/20 bg-teal-300/[.07] text-teal-200",
  "Tree Monitors": "border-orange-300/20 bg-orange-300/[.07] text-orange-200",
  "Boiga & Cat Snakes": "border-violet-300/20 bg-violet-300/[.07] text-violet-200",
  "Arboreal Vipers": "border-red-300/20 bg-red-300/[.07] text-red-200",
  "Arboreal Geckos": "border-indigo-300/20 bg-indigo-300/[.07] text-indigo-200",
  "Snake Biology": "border-sky-300/20 bg-sky-300/[.07] text-sky-200",
  Husbandry: "border-amber-200/20 bg-amber-200/[.07] text-amber-100",
  "Arboreal Planet": "border-fuchsia-300/20 bg-fuchsia-300/[.07] text-fuchsia-200",
};

function subscribeReducedMotion(onChange: () => void) {
  const query = window.matchMedia("(prefers-reduced-motion: reduce)");
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function difficultyLabel(d: TriviaQuestion["difficulty"]) {
  return modeDef(TRIVIA_MODES.find((m) => m.difficulty === d)?.id ?? "normal").label;
}

export function ReptileTrivia() {
  const [phase, setPhase] = useState<Phase>("intro");
  const [questions, setQuestions] = useState<TriviaQuestion[]>([]);
  const [qi, setQi] = useState(0);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [gained, setGained] = useState(0);
  const [eliminated, setEliminated] = useState<number[]>([]);
  const [fiftyUsed, setFiftyUsed] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(QUESTION_SECONDS);
  const [best, setBest] = useState(0);
  const [isNewBest, setIsNewBest] = useState(false);
  const [mode, setMode] = useState<TriviaMode>("normal");

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const awardedRef = useRef(false);
  const reducedMotion = useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => false,
  );

  const q = questions[qi];
  const isLast = qi >= questions.length - 1;

  /* Countdown while a question is live. */
  useEffect(() => {
    if (phase !== "question") return;
    timerRef.current = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          // Time out: reveal as a miss.
          setPicked(-1);
          setStreak(0);
          setGained(0);
          setPhase("reveal");
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [phase, qi]);

  function start() {
    awardedRef.current = false;
    setQuestions(buildRound(mode));
    setQi(0);
    setScore(0);
    setStreak(0);
    setBestStreak(0);
    setCorrectCount(0);
    setPicked(null);
    setGained(0);
    setEliminated([]);
    setFiftyUsed(false);
    setSecondsLeft(QUESTION_SECONDS);
    setBest(readBestScore(mode));
    setIsNewBest(false);
    setPhase("question");
  }

  function backToIntro() {
    setBest(readBestScore(mode));
    setPhase("intro");
  }

  function pick(i: number) {
    if (phase !== "question" || !q || eliminated.includes(i)) return;
    if (timerRef.current) clearInterval(timerRef.current);
    const correct = i === q.answer;
    if (correct) {
      const pts = scoreFor(q.difficulty, secondsLeft, streak);
      const nextStreak = streak + 1;
      setScore((s) => s + pts);
      setStreak(nextStreak);
      setBestStreak((b) => Math.max(b, nextStreak));
      setCorrectCount((c) => c + 1);
      setGained(pts);
    } else {
      setStreak(0);
      setGained(0);
    }
    setPicked(i);
    setPhase("reveal");
  }

  function fiftyFifty() {
    if (phase !== "question" || fiftyUsed || !q) return;
    const wrong = [0, 1, 2, 3].filter((i) => i !== q.answer).slice(0, 2);
    setEliminated(wrong);
    setFiftyUsed(true);
  }

  function next() {
    if (isLast) {
      const newBest = score > best;
      if (newBest) {
        writeBestScore(mode, score);
        setBest(score);
      }
      setIsNewBest(newBest && score > 0);
      // Arcade meta-system: tokens, leaderboard, achievements, quests.
      if (!awardedRef.current) {
        awardedRef.current = true;
        const tokens = correctCount * 2 + (correctCount >= QUESTIONS_PER_ROUND ? 5 : 0);
        if (tokens > 0) addTokens(tokens, `Reptile Trivia — ${correctCount}/${QUESTIONS_PER_ROUND}`);
        recordScore("trivia", score, modeDef(mode).label);
        reportArcadeEvent({
          type: "trivia-complete",
          correct: correctCount,
          total: QUESTIONS_PER_ROUND,
          score,
          mode,
        });
      }
      setPhase("results");
      return;
    }
    setQi((n) => n + 1);
    setPicked(null);
    setGained(0);
    setEliminated([]);
    setSecondsLeft(QUESTION_SECONDS);
    setPhase("question");
  }

  const timerFrac = secondsLeft / QUESTION_SECONDS;
  const timerColor =
    secondsLeft <= 5 ? "bg-red-400/80" : secondsLeft <= 8 ? "bg-amber-300/80" : "bg-emerald-300/80";

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-16 pt-8 sm:px-6">
      <style>{`@keyframes rt-in { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }`}</style>

      {/* Header */}
      <div className="text-center">
        <div className="inline-flex rounded-full border border-emerald-300/15 bg-emerald-300/[.06] px-4 py-2 text-[10px] font-bold uppercase tracking-[.2em] text-emerald-200/70">
          Arboreal Arcade · Mini game
        </div>
        <h1 className="mt-4 text-4xl font-semibold tracking-[-.03em] text-white sm:text-5xl">
          Reptile Trivia
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-sm leading-7 text-white/55">
          Ten questions, fifteen seconds each — across tree pythons, tree boas,
          monitors, vipers, geckos, and more. Pick a difficulty, from canopy
          basics to taxonomy deep cuts.
        </p>
      </div>

      {/* Intro */}
      {phase === "intro" && (
        <div className="mx-auto mt-10 max-w-xl rounded-[26px] border border-white/[.07] bg-white/[.02] p-6 sm:p-8">
          <h2 className="text-lg font-semibold text-white">How it works</h2>
          <ul className="mt-4 space-y-2 text-sm leading-6 text-white/55">
            <li>· {QUESTIONS_PER_ROUND} questions per round, {QUESTION_SECONDS} seconds on the clock.</li>
            <li>· Pick a difficulty — harder modes ask tougher questions and pay more.</li>
            <li>· Speed and streaks pay extra. One 50/50 lifeline per round.</li>
            <li>· Every answer comes with a quick explanation, so you learn as you play.</li>
          </ul>
          <h3 className="mt-6 text-sm font-bold uppercase tracking-[.14em] text-white/45">
            Choose difficulty
          </h3>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {TRIVIA_MODES.map((m) => {
              const active = m.id === mode;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => {
                    setMode(m.id);
                    setBest(readBestScore(m.id));
                  }}
                  className={`rounded-2xl border px-3 py-3 text-left transition active:scale-[.98] ${
                    active
                      ? "border-emerald-300/60 bg-emerald-300/[.1]"
                      : "border-white/[.08] bg-white/[.02] hover:border-white/20 hover:bg-white/[.04]"
                  }`}
                >
                  <div className={`text-sm font-bold ${active ? "text-emerald-100" : "text-white/80"}`}>
                    {m.label}
                  </div>
                  <div className="mt-1 text-[11px] leading-4 text-white/45">{m.blurb}</div>
                </button>
              );
            })}
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            {Object.keys(CATEGORY_STYLES).map((c) => (
              <span
                key={c}
                className={`rounded-full border px-3 py-1 text-[11px] font-bold ${CATEGORY_STYLES[c]}`}
              >
                {c}
              </span>
            ))}
          </div>
          {best > 0 && (
            <p className="mt-5 text-center text-sm text-white/45">
              Your best score · <span className="font-bold text-amber-100">{best.toLocaleString()}</span>
            </p>
          )}
          <button
            type="button"
            onClick={start}
            className="mt-6 w-full rounded-2xl bg-emerald-300 px-6 py-4 text-base font-bold text-[#06100c] transition hover:bg-emerald-200 active:scale-[.99]"
          >
            Start {modeDef(mode).label} round
          </button>
        </div>
      )}

      {/* Question */}
      {phase === "question" && q && (
        <div key={qi} className="mx-auto mt-8 max-w-xl" style={reducedMotion ? undefined : { animation: "rt-in .35s ease-out" }}>
          <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-[.14em] text-white/50">
            <span>
              Question <span className="text-emerald-200">{qi + 1}</span>/{questions.length}
            </span>
            <span>
              Score <span className="text-emerald-200">{score.toLocaleString()}</span>
            </span>
            {streak >= 2 && (
              <span className="text-amber-100">🔥 {streak} streak</span>
            )}
          </div>

          <div className="mt-3 flex items-center gap-2">
            <span className={`rounded-full border px-3 py-1 text-[11px] font-bold ${CATEGORY_STYLES[q.category]}`}>
              {q.category}
            </span>
            <span className="rounded-full border border-white/10 bg-white/[.04] px-3 py-1 text-[11px] font-bold text-white/50">
              {difficultyLabel(q.difficulty)}
            </span>
            <span className="ml-auto text-xs font-bold text-white/50 tabular-nums">{secondsLeft}s</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-black/50">
            <div
              className={`h-full rounded-full transition-[width] duration-1000 ease-linear ${timerColor}`}
              style={{ width: `${timerFrac * 100}%` }}
            />
          </div>

          <h2 className="mt-5 text-xl font-semibold leading-8 text-white sm:text-2xl">{q.question}</h2>

          <div className="mt-5 grid gap-3">
            {q.options.map((opt, i) => {
              const dead = eliminated.includes(i);
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => pick(i)}
                  disabled={dead}
                  className={`flex items-center gap-4 rounded-2xl border px-4 py-4 text-left transition active:scale-[.99] ${
                    dead
                      ? "cursor-not-allowed border-white/[.04] bg-black/30 opacity-30"
                      : "border-white/[.08] bg-white/[.03] hover:border-emerald-300/40 hover:bg-emerald-300/[.06]"
                  }`}
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/15 bg-black/40 text-xs font-bold text-white/70">
                    {LETTERS[i]}
                  </span>
                  <span className="text-sm font-medium leading-6 text-white/85">{opt}</span>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={fiftyFifty}
            disabled={fiftyUsed}
            className={`mt-4 w-full rounded-2xl border px-6 py-3 text-sm font-bold transition ${
              fiftyUsed
                ? "cursor-not-allowed border-white/[.05] text-white/25"
                : "border-amber-200/25 bg-amber-200/[.06] text-amber-100 hover:bg-amber-200/[.1]"
            }`}
          >
            {fiftyUsed ? "50/50 used" : "Use 50/50 lifeline"}
          </button>
        </div>
      )}

      {/* Reveal */}
      {phase === "reveal" && q && (
        <div className="mx-auto mt-8 max-w-xl">
          <div className="flex items-center gap-2">
            <span className={`rounded-full border px-3 py-1 text-[11px] font-bold ${CATEGORY_STYLES[q.category]}`}>
              {q.category}
            </span>
            <span className="rounded-full border border-white/10 bg-white/[.04] px-3 py-1 text-[11px] font-bold text-white/50">
              {difficultyLabel(q.difficulty)}
            </span>
          </div>

          <h2 className="mt-4 text-xl font-semibold leading-8 text-white sm:text-2xl">{q.question}</h2>

          <div className="mt-5 grid gap-3">
            {q.options.map((opt, i) => {
              const isAnswer = i === q.answer;
              const wasPicked = i === picked;
              const dead = eliminated.includes(i);
              return (
                <div
                  key={i}
                  className={`flex items-center gap-4 rounded-2xl border px-4 py-4 ${
                    isAnswer
                      ? "border-emerald-300/60 bg-emerald-300/[.1]"
                      : wasPicked
                        ? "border-red-400/50 bg-red-400/[.08]"
                        : dead
                          ? "border-white/[.04] bg-black/30 opacity-30"
                          : "border-white/[.06] bg-white/[.02] opacity-60"
                  }`}
                >
                  <span
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-xs font-bold ${
                      isAnswer
                        ? "border-emerald-300/60 bg-emerald-300/20 text-emerald-100"
                        : wasPicked
                          ? "border-red-400/60 bg-red-400/20 text-red-100"
                          : "border-white/15 bg-black/40 text-white/50"
                    }`}
                  >
                    {isAnswer ? "✓" : wasPicked ? "✕" : LETTERS[i]}
                  </span>
                  <span className="text-sm font-medium leading-6 text-white/85">{opt}</span>
                </div>
              );
            })}
          </div>

          <div className="mt-4 rounded-2xl border border-white/[.07] bg-black/30 p-4">
            <p className={`text-sm font-bold ${picked === q.answer ? "text-emerald-200" : "text-white/70"}`}>
              {picked === -1
                ? "Time's up!"
                : picked === q.answer
                  ? `Correct! +${gained.toLocaleString()} points`
                  : "Not quite."}
            </p>
            <p className="mt-1 text-sm leading-6 text-white/55">{q.explanation}</p>
          </div>

          <button
            type="button"
            onClick={next}
            className="mt-5 w-full rounded-2xl bg-emerald-300 px-6 py-4 text-base font-bold text-[#06100c] transition hover:bg-emerald-200 active:scale-[.99]"
          >
            {isLast ? "See results" : "Next question"}
          </button>
        </div>
      )}

      {/* Results */}
      {phase === "results" && (
        <div className="mx-auto mt-8 max-w-xl">
          <div className="rounded-[26px] border border-white/[.07] bg-white/[.02] p-6 text-center sm:p-8">
            <div className="text-[10px] font-bold uppercase tracking-[.2em] text-amber-100/60">
              {modeDef(mode).label} · Final rank
            </div>
            <h2 className="mt-2 text-3xl font-semibold tracking-[-.02em] text-white">
              {rankFor(score, mode).title}
            </h2>
            <p className="mt-2 text-sm leading-6 text-white/55">{rankFor(score, mode).blurb}</p>
            <p className="mt-4 text-5xl font-bold tabular-nums text-emerald-200">
              {score.toLocaleString()}
            </p>
            {isNewBest && (
              <p className="mt-2 inline-block rounded-full border border-amber-200/30 bg-amber-200/[.08] px-4 py-1 text-xs font-bold text-amber-100">
                New best score!
              </p>
            )}

            <div className="mt-6 grid grid-cols-3 gap-3">
              <div className="rounded-2xl border border-white/[.06] bg-black/30 p-3">
                <div className="text-2xl font-bold text-white">{correctCount}/{questions.length}</div>
                <div className="mt-1 text-[10px] font-bold uppercase tracking-[.14em] text-white/40">Correct</div>
              </div>
              <div className="rounded-2xl border border-white/[.06] bg-black/30 p-3">
                <div className="text-2xl font-bold text-white">{bestStreak}</div>
                <div className="mt-1 text-[10px] font-bold uppercase tracking-[.14em] text-white/40">Best streak</div>
              </div>
              <div className="rounded-2xl border border-white/[.06] bg-black/30 p-3">
                <div className="text-2xl font-bold text-white">
                  {questions.length ? Math.round((correctCount / questions.length) * 100) : 0}%
                </div>
                <div className="mt-1 text-[10px] font-bold uppercase tracking-[.14em] text-white/40">Accuracy</div>
              </div>
            </div>

            {best > 0 && !isNewBest && (
              <p className="mt-4 text-xs text-white/40">
                Best score · <span className="font-bold text-white/60">{best.toLocaleString()}</span>
              </p>
            )}

            <button
              type="button"
              onClick={start}
              className="mt-6 w-full rounded-2xl bg-emerald-300 px-6 py-4 text-base font-bold text-[#06100c] transition hover:bg-emerald-200 active:scale-[.99]"
            >
              Play again
            </button>
            <button
              type="button"
              onClick={backToIntro}
              className="mt-3 w-full rounded-2xl border border-white/10 bg-white/[.03] px-6 py-3 text-sm font-bold text-white/60 transition hover:bg-white/[.06] hover:text-white"
            >
              Change difficulty
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
