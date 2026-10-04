"use client";

import { useCallback, useEffect, useReducer, useState } from "react";
import {
  ACHIEVEMENTS,
  BOARD_META,
  type BoardId,
  claimQuest,
  dailyKey,
  dailyQuests,
  getBoard,
  getDisplayName,
  getTokenBalance,
  getTokenTx,
  isUnlocked,
  questStreak,
  setDisplayName,
  unlockedAchievements,
  type QuestState,
} from "@/lib/arcade";

/** Live token balance chip. */
export function TokenChip({ dark = false }: { dark?: boolean }) {
  const [bal, setBal] = useState(0);
  useEffect(() => {
    const refresh = () => setBal(getTokenBalance());
    refresh();
    window.addEventListener("arcade-balance", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      window.removeEventListener("arcade-balance", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, []);
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-bold ${
        dark
          ? "border-amber-200/25 bg-amber-200/[.07] text-amber-100"
          : "border-amber-200/25 bg-amber-200/[.07] text-amber-100"
      }`}
      title="Arcade tokens — earned across arcade games, spent in Arboreal Keeper"
    >
      🪙 {bal.toLocaleString()}
    </span>
  );
}

function useQuests() {
  const [quests, setQuests] = useState<QuestState[]>(() => dailyQuests());
  const refresh = useCallback(() => setQuests(dailyQuests()), []);
  useEffect(() => {
    window.addEventListener("arcade-quests", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      window.removeEventListener("arcade-quests", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, [refresh]);
  return { quests, refresh };
}

/** Today's seeded quests + claim buttons + streak. */
export function DailyQuests() {
  const { quests, refresh } = useQuests();
  const [streak, setStreak] = useState(() => questStreak());
  useEffect(() => {
    const onQ = () => setStreak(questStreak());
    window.addEventListener("arcade-quests", onQ);
    return () => window.removeEventListener("arcade-quests", onQ);
  }, []);

  return (
    <div className="rounded-[26px] border border-white/[.07] bg-white/[.02] p-5 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="section-kicker">Daily quests</div>
          <h3 className="mt-1 text-lg font-semibold text-white">Today · {dailyKey()}</h3>
        </div>
        {streak > 0 && (
          <span className="rounded-full border border-orange-300/30 bg-orange-400/10 px-3 py-1 text-xs font-black uppercase tracking-[.12em] text-orange-200">
            🔥 {streak}-day streak
          </span>
        )}
      </div>
      <div className="mt-4 space-y-2">
        {quests.map((q) => (
          <div
            key={q.id}
            className={`flex items-center gap-3 rounded-2xl border p-3 ${
              q.claimed
                ? "border-emerald-300/20 bg-emerald-300/[.05]"
                : q.done
                  ? "border-amber-200/25 bg-amber-200/[.05]"
                  : "border-white/[.07] bg-black/30"
            }`}
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-white">
                {q.claimed ? "✅" : q.done ? "🎉" : "📜"} {q.title}
              </p>
              <p className="truncate text-xs text-white/50">{q.desc}</p>
              {!q.done && q.target > 1 && (
                <p className="mt-1 text-[11px] font-bold text-white/40">
                  {q.progress}/{q.target}
                </p>
              )}
            </div>
            {q.done && !q.claimed ? (
              <button
                type="button"
                onClick={() => {
                  claimQuest(q.id);
                  refresh();
                }}
                className="shrink-0 rounded-xl bg-amber-200 px-4 py-2 text-xs font-black uppercase tracking-[.1em] text-[#171106] transition hover:bg-amber-100 active:scale-95"
              >
                Claim +{q.tokens} 🪙
              </button>
            ) : (
              <span className="shrink-0 text-xs font-bold text-white/40">+{q.tokens} 🪙</span>
            )}
          </div>
        ))}
      </div>
      <p className="mt-3 text-[11px] leading-5 text-white/35">
        New quests every day, same for every keeper. Claiming on consecutive days adds a streak bonus.
      </p>
    </div>
  );
}

/** Tabbed top-10 leaderboards. */
export function Leaderboards() {
  const boards = Object.keys(BOARD_META) as BoardId[];
  const [tab, setTab] = useState<BoardId>("sorting");
  const [, bump] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    const onFocus = () => bump();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);
  const entries = getBoard(tab);

  return (
    <div className="rounded-[26px] border border-white/[.07] bg-white/[.02] p-5 sm:p-6">
      <div className="section-kicker">Leaderboards</div>
      <h3 className="mt-1 text-lg font-semibold text-white">Top keepers</h3>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {boards.map((b) => (
          <button
            key={b}
            type="button"
            onClick={() => setTab(b)}
            className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${
              tab === b
                ? "bg-amber-200 text-[#171106]"
                : "border border-white/10 bg-white/[.03] text-white/60 hover:bg-white/[.07]"
            }`}
          >
            {BOARD_META[b].title}
          </button>
        ))}
      </div>
      <ol className="mt-4 space-y-1.5">
        {entries.length === 0 && (
          <li className="rounded-xl border border-white/[.06] bg-black/30 p-4 text-center text-xs text-white/40">
            No scores yet — be the first on the board.
          </li>
        )}
        {entries.map((e, i) => (
          <li
            key={`${e.date}-${i}`}
            className="flex items-center gap-3 rounded-xl border border-white/[.06] bg-black/30 px-3 py-2"
          >
            <span
              className={`w-6 text-center text-sm font-black ${
                i === 0 ? "text-amber-200" : i === 1 ? "text-white/70" : i === 2 ? "text-orange-300/70" : "text-white/30"
              }`}
            >
              {i + 1}
            </span>
            <span className="min-w-0 flex-1 truncate text-sm font-semibold text-white/85">{e.name}</span>
            {e.detail && <span className="hidden text-[11px] text-white/35 sm:inline">{e.detail}</span>}
            <span className="text-sm font-black text-amber-100">
              {e.score.toLocaleString()} <span className="text-[10px] font-bold text-white/35">{BOARD_META[tab].unit}</span>
            </span>
          </li>
        ))}
      </ol>
      <p className="mt-3 text-[11px] leading-5 text-white/35">Your best nights, kept on this device.</p>
    </div>
  );
}

/** Achievement trophy shelf. */
export function TrophyShelf() {
  const [unlocked, setUnlocked] = useState<string[]>([]);
  useEffect(() => {
    const refresh = () => setUnlocked(unlockedAchievements());
    refresh();
    window.addEventListener("arcade-toast", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      window.removeEventListener("arcade-toast", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, []);
  const done = ACHIEVEMENTS.filter((a) => unlocked.includes(a.id));
  const todo = ACHIEVEMENTS.filter((a) => !unlocked.includes(a.id));

  return (
    <div className="rounded-[26px] border border-white/[.07] bg-white/[.02] p-5 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="section-kicker">Trophy shelf</div>
          <h3 className="mt-1 text-lg font-semibold text-white">
            {done.length}/{ACHIEVEMENTS.length} achievements
          </h3>
        </div>
        <span className="text-2xl">🏆</span>
      </div>
      {done.length > 0 && (
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {done.map((a) => (
            <div key={a.id} className="rounded-2xl border border-amber-200/25 bg-amber-200/[.06] p-3 text-center">
              <p className="text-2xl">{a.icon}</p>
              <p className="mt-1 text-xs font-bold text-amber-100">{a.name}</p>
              <p className="mt-0.5 text-[10px] leading-4 text-white/45">{a.desc}</p>
            </div>
          ))}
        </div>
      )}
      {todo.length > 0 && (
        <details className="mt-4">
          <summary className="cursor-pointer text-xs font-bold uppercase tracking-[.12em] text-white/40 hover:text-white/60">
            {todo.length} still to earn
          </summary>
          <ul className="mt-2 space-y-1">
            {todo.map((a) => (
              <li key={a.id} className="flex items-center gap-2 text-xs text-white/45">
                <span className="opacity-40">{a.icon}</span>
                <span className="font-semibold text-white/60">{a.name}</span>
                <span className="truncate">— {a.desc}</span>
                <span className="ml-auto shrink-0 font-bold text-amber-100/50">+{a.tokens} 🪙</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

/** Editable keeper name for leaderboard entries. */
export function DisplayNameEditor() {
  const [name, setName] = useState(() => getDisplayName());
  const [saved, setSaved] = useState(false);
  return (
    <form
      className="flex items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        setDisplayName(name);
        setSaved(true);
        window.setTimeout(() => setSaved(false), 2000);
      }}
    >
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={24}
        aria-label="Leaderboard name"
        className="w-36 rounded-xl border border-white/10 bg-black/40 px-3 py-1.5 text-sm text-white placeholder:text-white/25"
        placeholder="Keeper"
      />
      <button
        type="submit"
        className="rounded-xl border border-white/10 bg-white/[.05] px-3 py-1.5 text-xs font-bold text-white/70 hover:bg-white/[.1]"
      >
        {saved ? "Saved ✓" : "Set name"}
      </button>
    </form>
  );
}

/** Recent token earnings. */
export function TokenHistory() {
  const [txs, setTxs] = useState(getTokenTx());
  useEffect(() => {
    const refresh = () => setTxs(getTokenTx());
    refresh();
    window.addEventListener("arcade-balance", refresh);
    return () => window.removeEventListener("arcade-balance", refresh);
  }, []);
  if (txs.length === 0) return null;
  return (
    <div className="rounded-[26px] border border-white/[.07] bg-white/[.02] p-5 sm:p-6">
      <div className="section-kicker">Wallet</div>
      <h3 className="mt-1 text-lg font-semibold text-white">Recent earnings</h3>
      <ul className="mt-3 space-y-1">
        {txs.slice(0, 8).map((t, i) => (
          <li key={`${t.t}-${i}`} className="flex items-center justify-between gap-3 text-xs">
            <span className="truncate text-white/55">{t.reason}</span>
            <span className={`shrink-0 font-black ${t.n >= 0 ? "text-emerald-300" : "text-red-300"}`}>
              {t.n >= 0 ? "+" : ""}
              {t.n} 🪙
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Full arcade meta hub for the arcade home page. */
export function ArcadeHub() {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <DailyQuests />
      <Leaderboards />
      <TrophyShelf />
      <div className="space-y-4">
        <div className="rounded-[26px] border border-white/[.07] bg-white/[.02] p-5 sm:p-6">
          <div className="section-kicker">Wallet</div>
          <div className="mt-2 flex items-center justify-between gap-3">
            <TokenChip />
            <DisplayNameEditor />
          </div>
          <p className="mt-3 text-[11px] leading-5 text-white/35">
            Earn 🪙 across every arcade game — sorting, trivia, poker, expeditions. Spend them in Arboreal Keeper on
            expedition permits, extra trips, and cash.
          </p>
        </div>
        <TokenHistory />
      </div>
    </div>
  );
}
