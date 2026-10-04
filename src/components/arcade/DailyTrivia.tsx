"use client";

import { useMemo, useRef, useState } from "react";
import {
  QUESTION_SECONDS,
  TRIVIA_QUESTIONS,
  scoreFor,
  type TriviaQuestion,
} from "@/lib/reptile-trivia";
import {
  addTokens,
  dailyKey,
  hashStr,
  mulberry32,
  recordScore,
  reportArcadeEvent,
} from "@/lib/arcade";

/**
 * Daily Trivia — one seeded 10-question round per day, identical for every
 * keeper. Mixed difficulties. Completing it counts toward daily quests.
 */
function buildDailyRound(day: string): TriviaQuestion[] {
  const rand = mulberry32(hashStr(`daily-trivia:${day}`));
  const pool = [...TRIVIA_QUESTIONS];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, 10).map((q) => {
    const order = [0, 1, 2, 3];
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    const options = order.map((oi) => q.options[oi]) as [string, string, string, string];
    return { ...q, options, answer: order.indexOf(q.answer) };
  });
}

const DONE_KEY = "arcade-daily-trivia-done-v1";

export function DailyTrivia() {
  const day = dailyKey();
  const questions = useMemo(() => buildDailyRound(day), [day]);
  const [qi, setQi] = useState(0);
  const [score, setScore] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [streak, setStreak] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [done, setDone] = useState(() => {
    try {
      return window.localStorage.getItem(DONE_KEY) === day;
    } catch {
      return false;
    }
  });
  const awardedRef = useRef(false);

  const q = questions[qi];
  const isLast = qi >= questions.length - 1;

  function finish(nextScore: number, nextCorrect: number) {
    try {
      window.localStorage.setItem(DONE_KEY, day);
    } catch {}
    setDone(true);
    if (!awardedRef.current) {
      awardedRef.current = true;
      const tokens = nextCorrect * 2 + (nextCorrect === 10 ? 10 : 0);
      if (tokens > 0) addTokens(tokens, `Daily Trivia — ${nextCorrect}/10`);
      recordScore("trivia", nextScore, `daily ${day}`);
      reportArcadeEvent({ type: "trivia-complete", correct: nextCorrect, total: 10, score: nextScore, mode: "daily" });
      reportArcadeEvent({ type: "daily-complete", kind: "trivia" });
    }
  }

  function pick(i: number) {
    if (picked !== null || !q) return;
    const ok = i === q.answer;
    const nextStreak = ok ? streak + 1 : 0;
    const pts = ok ? scoreFor(q.difficulty, QUESTION_SECONDS / 2, streak) : 0;
    const nextScore = score + pts;
    const nextCorrect = correct + (ok ? 1 : 0);
    setPicked(i);
    setStreak(nextStreak);
    setScore(nextScore);
    setCorrect(nextCorrect);
    window.setTimeout(() => {
      if (isLast) {
        finish(nextScore, nextCorrect);
      } else {
        setQi((n) => n + 1);
        setPicked(null);
      }
    }, 900);
  }

  if (done) {
    return (
      <div className="rounded-[26px] border border-white/[.07] bg-white/[.02] p-5 text-center sm:p-6">
        <div className="section-kicker">Daily trivia</div>
        <p className="mt-2 text-sm text-white/60">✅ Done for {day} — {correct}/10, {score.toLocaleString()} pts.</p>
        <p className="mt-1 text-xs text-white/35">A fresh set lands tomorrow.</p>
      </div>
    );
  }

  if (!q) return null;
  return (
    <div className="rounded-[26px] border border-white/[.07] bg-white/[.02] p-5 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="section-kicker">Daily trivia</div>
          <h3 className="mt-1 text-lg font-semibold text-white">
            Question {qi + 1}/10
          </h3>
        </div>
        <span className="text-sm font-black text-amber-100">{score.toLocaleString()} pts</span>
      </div>
      <p className="mt-1 text-[11px] uppercase tracking-[.14em] text-white/35">
        {q.category} · difficulty {q.difficulty}/6
      </p>
      <p className="mt-3 text-[15px] font-semibold leading-7 text-white">{q.question}</p>
      <div className="mt-4 grid gap-2">
        {q.options.map((opt, i) => {
          const isAnswer = i === q.answer;
          const isPicked = picked === i;
          const revealed = picked !== null;
          return (
            <button
              key={i}
              type="button"
              disabled={revealed}
              onClick={() => pick(i)}
              className={`rounded-2xl border px-4 py-3 text-left text-sm font-semibold transition active:scale-[.99] disabled:cursor-default ${
                revealed && isAnswer
                  ? "border-emerald-300/50 bg-emerald-300/[.1] text-emerald-100"
                  : revealed && isPicked
                    ? "border-red-300/50 bg-red-300/[.08] text-red-100"
                    : "border-white/10 bg-white/[.03] text-white/80 hover:bg-white/[.07]"
              }`}
            >
              {opt}
            </button>
          );
        })}
      </div>
      {picked !== null && (
        <p className="mt-3 text-xs leading-5 text-white/50">{q.explanation}</p>
      )}
      <p className="mt-3 text-[11px] text-white/35">
        Same 10 questions for every keeper today · {correct} correct so far
      </p>
    </div>
  );
}
