/**
 * Arboreal Arcade meta-system: one wallet, leaderboards, achievements,
 * and daily quests shared across every arcade game.
 *
 * Tokens are the arcade's meta-currency. Games award them for play;
 * Arboreal Keeper spends them (expedition permits, extra trips, cash
 * exchange). The wallet follows the keeper's account: the browser keeps a
 * fast localStorage cache, but signed-in players sync every earn and spend
 * to the server, so the balance is identical on every device. Signed-out
 * players keep a local-only wallet.
 */

"use client";

/* ------------------------------------------------------------------ */
/* Seeded randomness (daily boards are identical for every keeper)     */
/* ------------------------------------------------------------------ */

export function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = ((t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t) >>> 0;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Local calendar date key: "2026-09-29". */
export function dailyKey(d: Date = new Date()): string {
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/* ------------------------------------------------------------------ */
/* Wallet — arcade tokens                                              */
/* ------------------------------------------------------------------ */

const BALANCE_KEY = "arcade-tokens-balance-v1";
const TX_KEY = "arcade-tokens-tx-v1";
const NAME_KEY = "arcade-display-name-v1";

function readInt(key: string): number {
  try {
    const raw = window.localStorage.getItem(key);
    const n = raw ? parseInt(raw, 10) : 0;
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

export interface TokenTx {
  t: number;
  n: number;
  reason: string;
}

function pushTx(n: number, reason: string) {
  try {
    const raw = window.localStorage.getItem(TX_KEY);
    const txs = raw ? (JSON.parse(raw) as TokenTx[]) : [];
    txs.unshift({ t: Date.now(), n, reason });
    window.localStorage.setItem(TX_KEY, JSON.stringify(txs.slice(0, 50)));
  } catch {}
}

export interface ArcadeToast {
  id: number;
  kind: "tokens" | "achievement" | "quest";
  title: string;
  detail?: string;
}

function emitToast(kind: ArcadeToast["kind"], title: string, detail?: string) {
  try {
    window.dispatchEvent(
      new CustomEvent<ArcadeToast>("arcade-toast", {
        detail: { id: Date.now() + Math.random(), kind, title, detail },
      }),
    );
    // Balance chips listen for this too.
    window.dispatchEvent(new Event("arcade-balance"));
  } catch {}
}

export function getTokenBalance(): number {
  if (typeof window === "undefined") return 0;
  return readInt(BALANCE_KEY);
}

export function getTokenTx(): TokenTx[] {
  try {
    const raw = window.localStorage.getItem(TX_KEY);
    return raw ? (JSON.parse(raw) as TokenTx[]) : [];
  } catch {
    return [];
  }
}

/** Award tokens. Returns the new balance. */
export function addTokens(n: number, reason: string, quiet = false): number {
  if (typeof window === "undefined" || n <= 0) return getTokenBalance();
  void ensureWalletSync();
  const next = getTokenBalance() + Math.floor(n);
  try {
    window.localStorage.setItem(BALANCE_KEY, `${next}`);
  } catch {}
  pushTx(Math.floor(n), reason);
  pushWalletDelta(Math.floor(n));
  if (!quiet) emitToast("tokens", `+${Math.floor(n)} 🪙`, reason);
  else {
    try {
      window.dispatchEvent(new Event("arcade-balance"));
    } catch {}
  }
  // Token-hoarder achievement checks the balance on every award.
  checkAchievements();
  return next;
}

/** Spend tokens. Returns false when the balance is too low. */
export function spendTokens(n: number, reason: string): boolean {
  if (typeof window === "undefined" || n <= 0) return false;
  void ensureWalletSync();
  const bal = getTokenBalance();
  if (bal < n) return false;
  try {
    window.localStorage.setItem(BALANCE_KEY, `${bal - n}`);
  } catch {}
  pushTx(-n, reason);
  pushWalletDelta(-Math.floor(n));
  try {
    window.dispatchEvent(new Event("arcade-balance"));
  } catch {}
  return true;
}

/* ------------------------------------------------------------------ */
/* Wallet cloud sync — tokens follow the account, not the device       */
/* ------------------------------------------------------------------ */

// Sign-in state for the wallet: null = unknown yet, true = signed in
// (server balance is authoritative), false = signed out (local only).
let walletCloudMode: boolean | null = null;
let walletSyncPromise: Promise<void> | null = null;
let walletLastAttemptAt = 0;
// Deltas applied locally while the sign-in state was unknown or the server
// was unreachable; flushed on the next successful sync.
let walletPendingDelta = 0;

function setSyncedBalance(n: number) {
  try {
    window.localStorage.setItem(BALANCE_KEY, `${Math.max(0, Math.floor(n))}`);
  } catch {}
  try {
    window.dispatchEvent(new Event("arcade-balance"));
  } catch {}
}

async function postWallet(body: { delta?: number; seed?: number }): Promise<number | null> {
  try {
    const res = await fetch("/api/arcade/wallet", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = (await res.json().catch(() => null)) as { balance?: unknown } | null;
    return typeof data?.balance === "number" ? data.balance : null;
  } catch {
    return null;
  }
}

/**
 * Push one earn/spend to the account wallet. Fire-and-forget: the local
 * cache is already updated, so a failed push just queues the delta for the
 * next sync instead of blocking play.
 */
function pushWalletDelta(n: number) {
  if (n === 0 || typeof window === "undefined") return;
  if (walletCloudMode === false) return; // signed out — local only
  if (walletCloudMode === null) {
    walletPendingDelta += n;
    void ensureWalletSync();
    return;
  }
  void postWallet({ delta: n }).then((serverBalance) => {
    if (serverBalance === null) walletPendingDelta += n;
  });
}

/**
 * First sync: learn whether the player is signed in; when they are, seed
 * the server wallet greatest-wins so a new device never wipes earned
 * tokens, then adopt the authoritative balance.
 */
export function ensureWalletSync(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (walletSyncPromise) return walletSyncPromise;
  walletLastAttemptAt = Date.now();
  walletSyncPromise = (async () => {
    try {
      const res = await fetch("/api/arcade/wallet", { cache: "no-store" });
      if (res.status === 401) {
        walletCloudMode = false;
        walletPendingDelta = 0;
        return;
      }
      if (!res.ok) throw new Error(`wallet GET ${res.status}`);
      const data = (await res.json().catch(() => null)) as { authenticated?: unknown; balance?: unknown } | null;
      if (!data || data.authenticated !== true || typeof data.balance !== "number") {
        throw new Error("wallet GET malformed");
      }
      walletCloudMode = true;
      const local = readInt(BALANCE_KEY);
      const pendingAtSeed = walletPendingDelta;
      const seeded = await postWallet({ seed: local });
      if (seeded === null) throw new Error("wallet seed failed");
      // Mutations that landed while seeding are already in localStorage;
      // fold the ones that arrived after the seed read into the server too.
      const lateDelta = walletPendingDelta - pendingAtSeed;
      walletPendingDelta = 0;
      let authoritative = seeded;
      if (lateDelta !== 0) {
        const flushed = await postWallet({ delta: lateDelta });
        authoritative = flushed !== null ? flushed : seeded + lateDelta;
      }
      setSyncedBalance(authoritative);
    } catch {
      // Stay local for now; the next focus/resync retries the handshake.
      walletCloudMode = null;
      walletSyncPromise = null;
    }
  })();
  return walletSyncPromise;
}

/**
 * Reconcile with the server: flush any queued deltas, then adopt the
 * authoritative balance. Called when the tab regains focus so a balance
 * changed on another device shows up here.
 */
export function resyncArcadeWallet(): void {
  if (typeof window === "undefined") return;
  if (walletCloudMode !== true) {
    // Signed out, unknown, or a previous handshake failed — retry the
    // handshake at most once every five minutes so signed-out players
    // don't pay for a request on every focus.
    if (Date.now() - walletLastAttemptAt > 5 * 60 * 1000) {
      walletSyncPromise = null;
      void ensureWalletSync();
    }
    return;
  }
  void (async () => {
    if (walletPendingDelta !== 0) {
      const d = walletPendingDelta;
      walletPendingDelta = 0;
      const flushed = await postWallet({ delta: d });
      if (flushed !== null) {
        setSyncedBalance(flushed);
        return;
      }
      walletPendingDelta += d; // retry on the next resync
      return;
    }
    try {
      const res = await fetch("/api/arcade/wallet", { cache: "no-store" });
      if (res.status === 401) {
        walletCloudMode = false;
        return;
      }
      if (!res.ok) return;
      const data = (await res.json().catch(() => null)) as { authenticated?: unknown; balance?: unknown } | null;
      if (data && data.authenticated === true && typeof data.balance === "number") {
        setSyncedBalance(data.balance);
      }
    } catch {}
  })();
}

export function getDisplayName(): string {
  try {
    return window.localStorage.getItem(NAME_KEY) || "Keeper";
  } catch {
    return "Keeper";
  }
}

export function setDisplayName(name: string) {
  try {
    window.localStorage.setItem(NAME_KEY, name.trim().slice(0, 24) || "Keeper");
  } catch {}
  try {
    window.dispatchEvent(new Event("arcade-balance"));
  } catch {}
}

/* ------------------------------------------------------------------ */
/* Leaderboards                                                        */
/* ------------------------------------------------------------------ */

export type BoardId = "sorting" | "pile" | "trivia" | "hunter" | "poker-daily";

export const BOARD_META: Record<BoardId, { title: string; unit: string; higherBetter: boolean }> = {
  sorting: { title: "Snake Sorter", unit: "pts", higherBetter: true },
  pile: { title: "Pile Sort", unit: "pts", higherBetter: true },
  trivia: { title: "Reptile Trivia", unit: "pts", higherBetter: true },
  hunter: { title: "Canopy Hunter", unit: "pts", higherBetter: true },
  "poker-daily": { title: "Daily Blackjack", unit: "profit", higherBetter: true },
};

export interface BoardEntry {
  name: string;
  score: number;
  date: string;
  detail?: string;
}

function boardKey(board: BoardId): string {
  return `arcade-board-${board}-v1`;
}

export function getBoard(board: BoardId): BoardEntry[] {
  try {
    const raw = window.localStorage.getItem(boardKey(board));
    const list = raw ? (JSON.parse(raw) as BoardEntry[]) : [];
    return Array.isArray(list) ? list.slice(0, 10) : [];
  } catch {
    return [];
  }
}

/** Record a score. Returns true when it made the top 10. */
export function recordScore(board: BoardId, score: number, detail?: string): boolean {
  if (typeof window === "undefined" || !Number.isFinite(score) || score <= 0) return false;
  const list = getBoard(board);
  const entry: BoardEntry = {
    name: getDisplayName(),
    score: Math.round(score),
    date: dailyKey(),
    detail,
  };
  const next = [...list, entry]
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);
  try {
    window.localStorage.setItem(boardKey(board), JSON.stringify(next));
  } catch {}
  return next.includes(entry);
}

/* ------------------------------------------------------------------ */
/* Achievements                                                        */
/* ------------------------------------------------------------------ */

export interface AchievementDef {
  id: string;
  name: string;
  icon: string;
  desc: string;
  tokens: number;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: "first-sort", name: "First Ceremony", icon: "🎩", desc: "Complete a Sorting Ceremony.", tokens: 5 },
  { id: "hat-sharp", name: "Sharp Hat", icon: "🎯", desc: "Score 1,000+ in a Sorting Ceremony.", tokens: 10 },
  { id: "chondro-master", name: "Chondro Master", icon: "👑", desc: "Earn the Chondro Master rank.", tokens: 20 },
  { id: "pile-debut", name: "Pile Driver", icon: "🗂️", desc: "Finish a Pile Sort.", tokens: 5 },
  { id: "pile-perfect", name: "Flawless Piles", icon: "💯", desc: "Sort 8/8 correctly in Pile Sort.", tokens: 15 },
  { id: "trivia-debut", name: "Trivia Debut", icon: "❓", desc: "Finish a trivia round.", tokens: 5 },
  { id: "trivia-sharp", name: "Herp Nerd", icon: "🧠", desc: "Answer 8+ correctly in a trivia round.", tokens: 10 },
  { id: "trivia-flawless", name: "Flawless Mind", icon: "⚡", desc: "A perfect 10/10 trivia round.", tokens: 20 },
  { id: "first-catch", name: "First Blood", icon: "🐍", desc: "Bag your first wild python.", tokens: 5 },
  { id: "trophy-hunter", name: "Trophy Hunter", icon: "🏆", desc: "Bag a prime, exceptional animal.", tokens: 12 },
  { id: "hunter-s", name: "Legend of the Canopy", icon: "🌙", desc: "Earn an S-rank expedition.", tokens: 20 },
  { id: "codex-10", name: "Field Naturalist", icon: "📖", desc: "Document 10 localities in the codex.", tokens: 15 },
  { id: "poker-debut", name: "Seat Taken", icon: "🃏", desc: "Play a poker hand in the den.", tokens: 5 },
  { id: "poker-heater", name: "Heater", icon: "🔥", desc: "Win 500+ lifesap in a single hand.", tokens: 12 },
  { id: "token-100", name: "Token Hoarder", icon: "🪙", desc: "Hold 100 arcade tokens at once.", tokens: 10 },
  { id: "quester", name: "Errand Runner", icon: "📜", desc: "Complete a daily quest.", tokens: 5 },
  { id: "all-rounder", name: "All-Rounder", icon: "🌟", desc: "Play 3 different arcade games in one day.", tokens: 15 },
];

const ACH_KEY = "arcade-achievements-v1";

export function unlockedAchievements(): string[] {
  try {
    const raw = window.localStorage.getItem(ACH_KEY);
    const list = raw ? (JSON.parse(raw) as string[]) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function isUnlocked(id: string): boolean {
  return unlockedAchievements().includes(id);
}

function unlock(id: string): boolean {
  const def = ACHIEVEMENTS.find((a) => a.id === id);
  if (!def || isUnlocked(id)) return false;
  try {
    window.localStorage.setItem(ACH_KEY, JSON.stringify([...unlockedAchievements(), id]));
  } catch {}
  addTokens(def.tokens, `Achievement — ${def.name}`, true);
  emitToast("achievement", `${def.icon} ${def.name}`, `${def.desc} · +${def.tokens} 🪙`);
  return true;
}

/* ------------------------------------------------------------------ */
/* Arcade events → achievements + quest progress                       */
/* ------------------------------------------------------------------ */

export type ArcadeEvent =
  | { type: "game-play"; game: string }
  | { type: "sorting-complete"; score: number; rank: string; mode: string }
  | { type: "pile-complete"; correct: number; total: number; score: number }
  | { type: "trivia-complete"; correct: number; total: number; score: number; mode: string }
  | { type: "poker-hand"; game: string; net: number }
  | { type: "hunt-complete"; rank: string; caught: number; prime: number; newCodex: number; codexTotal: number }
  | { type: "daily-complete"; kind: "trivia" | "poker" };

const PLAYS_KEY = "arcade-plays-v1";

function trackPlay(game: string) {
  try {
    const raw = window.localStorage.getItem(PLAYS_KEY);
    const rec = raw ? (JSON.parse(raw) as Record<string, string[]>) : {};
    const today = dailyKey();
    const list = rec[today] ?? [];
    if (!list.includes(game)) {
      list.push(game);
      rec[today] = list;
      window.localStorage.setItem(PLAYS_KEY, JSON.stringify(rec));
    }
    if (list.length >= 3) unlock("all-rounder");
  } catch {}
}

/**
 * Feed a game event into the meta-system. Updates quest progress and
 * unlocks achievements. Returns newly unlocked achievement ids.
 */
export function reportArcadeEvent(e: ArcadeEvent): string[] {
  if (typeof window === "undefined") return [];
  const fresh: string[] = [];
  const give = (id: string) => {
    if (unlock(id)) fresh.push(id);
  };

  switch (e.type) {
    case "game-play":
      trackPlay(e.game);
      break;
    case "sorting-complete":
      trackPlay("sorting");
      give("first-sort");
      if (e.score >= 1000) give("hat-sharp");
      if (/chondro master/i.test(e.rank)) give("chondro-master");
      bumpQuest("q-sort-800", e.mode === "ceremony" && e.score >= 800 ? 1 : 0);
      break;
    case "pile-complete":
      trackPlay("sorting");
      give("pile-debut");
      if (e.correct >= e.total && e.total > 0) give("pile-perfect");
      bumpQuest("q-pile-6", e.correct >= 6 ? 1 : 0);
      break;
    case "trivia-complete":
      trackPlay("trivia");
      give("trivia-debut");
      if (e.correct >= 8) give("trivia-sharp");
      if (e.correct >= e.total && e.total > 0) give("trivia-flawless");
      bumpQuest("q-trivia-7", e.correct >= 7 ? 1 : 0);
      break;
    case "poker-hand":
      trackPlay("poker");
      if (e.net > 0) give("poker-debut");
      if (e.net >= 500) give("poker-heater");
      bumpQuest("q-poker-200", e.net >= 200 ? 1 : 0);
      break;
    case "hunt-complete":
      trackPlay("hunter");
      if (e.caught > 0) give("first-catch");
      if (e.prime > 0) give("trophy-hunter");
      if (e.rank === "S") give("hunter-s");
      if (e.codexTotal >= 10) give("codex-10");
      bumpQuest("q-hunt-2", e.caught >= 2 ? 1 : 0);
      bumpQuest("q-trophy", e.prime > 0 ? 1 : 0);
      break;
    case "daily-complete":
      trackPlay(e.kind === "poker" ? "poker" : "trivia");
      bumpQuest("q-daily-double", 1);
      break;
  }
  return fresh;
}

/** Balance-gated achievements (called on every token award). */
function checkAchievements() {
  if (typeof window === "undefined") return;
  if (getTokenBalance() >= 100) unlock("token-100");
}

/* ------------------------------------------------------------------ */
/* Daily quests                                                        */
/* ------------------------------------------------------------------ */

export interface QuestDef {
  id: string;
  title: string;
  desc: string;
  tokens: number;
}

const QUEST_POOL: QuestDef[] = [
  { id: "q-sort-800", title: "Hat Trick", desc: "Score 800+ in a Sorting Ceremony.", tokens: 10 },
  { id: "q-pile-6", title: "Steady Piles", desc: "Sort 6+ correctly in Pile Sort.", tokens: 10 },
  { id: "q-trivia-7", title: "Know Your Herps", desc: "Answer 7+ trivia questions correctly.", tokens: 10 },
  { id: "q-hunt-2", title: "Night's Haul", desc: "Bag 2+ pythons in one expedition.", tokens: 12 },
  { id: "q-trophy", title: "Trophy Eyes", desc: "Bag a prime, exceptional animal.", tokens: 12 },
  { id: "q-poker-200", title: "Den Profit", desc: "Win 200+ lifesap in a single poker hand.", tokens: 10 },
  { id: "q-daily-double", title: "Daily Double", desc: "Complete 2 daily challenges.", tokens: 15 },
];

export interface QuestState extends QuestDef {
  progress: number;
  target: number;
  done: boolean;
  claimed: boolean;
}

function questStoreKey(day: string): string {
  return `arcade-quests-${day}-v1`;
}

interface QuestStore {
  progress: Record<string, number>;
  claimed: Record<string, boolean>;
}

/** Seeded 3 quests for the day — identical for every keeper. */
export function dailyQuests(day: string = dailyKey()): QuestState[] {
  const rand = mulberry32(hashStr(`quests:${day}`));
  const pool = [...QUEST_POOL];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const picked = pool.slice(0, 3);
  let store: QuestStore = { progress: {}, claimed: {} };
  try {
    const raw = window.localStorage.getItem(questStoreKey(day));
    if (raw) store = JSON.parse(raw) as QuestStore;
  } catch {}
  return picked.map((q) => {
    const target = q.id === "q-daily-double" ? 2 : 1;
    const progress = Math.min(target, store.progress[q.id] ?? 0);
    const done = progress >= target;
    return { ...q, progress, target, done, claimed: !!store.claimed[q.id] };
  });
}

function writeQuestStore(day: string, store: QuestStore) {
  try {
    window.localStorage.setItem(questStoreKey(day), JSON.stringify(store));
  } catch {}
  try {
    window.dispatchEvent(new Event("arcade-quests"));
  } catch {}
}

function readQuestStore(day: string): QuestStore {
  try {
    const raw = window.localStorage.getItem(questStoreKey(day));
    if (raw) return JSON.parse(raw) as QuestStore;
  } catch {}
  return { progress: {}, claimed: {} };
}

/** Increment quest progress (called by reportArcadeEvent). */
export function bumpQuest(id: string, n: number) {
  if (typeof window === "undefined" || n <= 0) return;
  const day = dailyKey();
  const store = readQuestStore(day);
  store.progress[id] = (store.progress[id] ?? 0) + n;
  writeQuestStore(day, store);
}

/** Consecutive days with at least one quest claimed. */
export function questStreak(): number {
  if (typeof window === "undefined") return 0;
  let streak = 0;
  const d = new Date();
  // Count back from today; allow today to be unclaimed so far.
  for (let back = 0; back < 60; back++) {
    const key = dailyKey(new Date(d.getTime() - back * 86400000));
    const store = readQuestStore(key);
    const claimedAny = Object.values(store.claimed).some(Boolean);
    if (claimedAny) {
      streak++;
    } else if (back === 0) {
      continue; // today hasn't been claimed yet — don't break the streak
    } else {
      break;
    }
  }
  return streak;
}

/** Claim a finished quest. Returns tokens awarded (0 when not claimable). */
export function claimQuest(id: string): number {
  if (typeof window === "undefined") return 0;
  const day = dailyKey();
  const quest = dailyQuests(day).find((q) => q.id === id);
  if (!quest || !quest.done || quest.claimed) return 0;
  const store = readQuestStore(day);
  store.claimed[id] = true;
  writeQuestStore(day, store);
  const streakBonus = Math.min(7, questStreak());
  const award = quest.tokens + streakBonus;
  addTokens(award, `Daily quest — ${quest.title}${streakBonus > 0 ? ` (+${streakBonus} streak)` : ""}`, true);
  emitToast("quest", `📜 ${quest.title} complete`, `+${award} 🪙${streakBonus > 0 ? ` — ${streakBonus}-day streak bonus` : ""}`);
  unlock("quester");
  return award;
    }
