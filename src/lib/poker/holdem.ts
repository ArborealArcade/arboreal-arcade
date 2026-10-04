/**
 * Arboreal Planet — Texas Hold'em engine (pure TypeScript).
 *
 * Ported from the self-contained HTML5 "Coil Hold'em" card game. No DOM,
 * no React, no audio — importable from both client components and Node.js
 * API routes. Table flow is a JSON-serializable pure reducer: every
 * transition clones its input and returns a new TableState (no timers;
 * callers drive AI pacing themselves via aiTakeTurn).
 *
 * Simplifications vs the original HTML game (all deliberate):
 * - shuffle() returns a new array instead of shuffling in place; makeDeck()
 *   returns an ordered deck (the HTML version shuffled inside makeDeck with
 *   Math.random). createTable() composes shuffle(makeDeck(), rng).
 * - makeRng() adds a seeded mulberry32 PRNG the HTML never had, so server
 *   code can run deterministic shuffles. aiDecide/aiTakeTurn accept an
 *   optional rng (default Math.random) for the AI's bluff roll.
 * - The HTML AI's "prior aggression" read came from the last 10 render log
 *   lines; the pure reducer carries no logs, so credibleBluff treats
 *   priorAgg as false (bluffing still triggers on draws and on the river
 *   scare card when the profile bluffs enough... note: river bluffs need
 *   priorAgg, so they are quieter here).
 * - The HTML's {type:'bet'} / {type:'allin'} AI outputs are folded into
 *   {action:'raise', amount} — applyAction treats a raise to maxBet as an
 *   all-in raise, which is exactly what the HTML's applyAction did.
 * - Multi-hand bookkeeping (stats, rebuys, bankroll, talk lines, animations)
 *   is intentionally out of scope; callers re-run createTable for new hands.
 */

export type Suit = "S" | "H" | "D" | "C";

export interface Card {
  rank: number; // 2..14, 14 = Ace
  suit: Suit;
}

const SUITS: Suit[] = ["S", "H", "D", "C"];

const SUIT_NAMES: Record<Suit, string> = {
  S: "Spades",
  H: "Hearts",
  D: "Diamonds",
  C: "Clubs",
};

const RANK_LABELS: Record<number, string> = {
  14: "A",
  13: "K",
  12: "Q",
  11: "J",
  10: "T",
};

const RANK_NAMES: Record<number, string> = {
  14: "Ace",
  13: "King",
  12: "Queen",
  11: "Jack",
  10: "Ten",
  9: "Nine",
  8: "Eight",
  7: "Seven",
  6: "Six",
  5: "Five",
  4: "Four",
  3: "Three",
  2: "Two",
};

export function rankLabel(rank: number): string {
  return RANK_LABELS[rank] ?? String(rank);
}

/** "AS", "TD", "7H" … */
export function cardKey(c: Card): string {
  return `${rankLabel(c.rank)}${c.suit}`;
}

export function parseCard(key: string): Card {
  const suit = key.slice(-1);
  const rankText = key.slice(0, -1).toUpperCase();
  const faceMap: Record<string, number> = { A: 14, K: 13, Q: 12, J: 11, T: 10 };
  const rank = faceMap[rankText] ?? Number(rankText);
  if (!SUITS.includes(suit as Suit) || !Number.isInteger(rank) || rank < 2 || rank > 14) {
    throw new Error(`Invalid card key: ${key}`);
  }
  return { rank, suit: suit as Suit };
}

/** Ordered 52-card deck (spades, hearts, diamonds, clubs; 2..A). */
export function makeDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (let rank = 2; rank <= 14; rank++) deck.push({ rank, suit });
  }
  return deck;
}

/** Seeded mulberry32 PRNG — deterministic shuffles for server code. */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher-Yates; returns a new array, input untouched. */
export function shuffle<T>(arr: T[], rng: () => number): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Hand evaluator (7-card Hold'em, ported 1:1 from the HTML game)       */
/* ------------------------------------------------------------------ */

export interface EvalResult {
  category: number; // 0 high card .. 8 straight flush (royal included)
  ranks: number[]; // [category, tiebreak ranks…] — lexicographic compare
  name: string;
}

interface FiveResult {
  value: number[];
  name: string;
}

function compareValue(a: number[], b: number[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d) return d;
  }
  return 0;
}

function evaluate5(cards: Card[]): FiveResult {
  const rs = cards.map((c) => c.rank).sort((a, b) => b - a);
  const counts = new Map<number, number>();
  for (const r of rs) counts.set(r, (counts.get(r) ?? 0) + 1);
  const groups = [...counts.entries()]
    .map(([r, n]) => ({ r, n }))
    .sort((a, b) => b.n - a.n || b.r - a.r);
  const flush = cards.every((c) => c.suit === cards[0].suit);
  const uniq = [...new Set(rs)];
  if (uniq.includes(14)) uniq.push(1);
  let straightHigh = 0;
  for (let i = 0; i <= uniq.length - 5; i++) {
    if (uniq[i] - uniq[i + 4] === 4) {
      straightHigh = uniq[i];
      break;
    }
  }

  let value: number[];
  let name: string;
  if (flush && straightHigh) {
    value = [8, straightHigh];
    name = straightHigh === 14 ? "Royal flush" : `Straight flush, ${RANK_NAMES[straightHigh]} high`;
  } else if (groups[0].n === 4) {
    const quad = groups[0];
    const kicker = groups.find((g) => g.n === 1);
    value = [7, quad.r, kicker ? kicker.r : 0];
    name = `Four ${RANK_NAMES[quad.r]}s`;
  } else if (groups[0].n === 3 && groups[1] && groups[1].n === 2) {
    value = [6, groups[0].r, groups[1].r];
    name = `Full house, ${RANK_NAMES[groups[0].r]}s over ${RANK_NAMES[groups[1].r]}s`;
  } else if (flush) {
    value = [5, ...rs];
    name = `Flush, ${SUIT_NAMES[cards[0].suit]} ${RANK_NAMES[rs[0]]} high`;
  } else if (straightHigh) {
    value = [4, straightHigh];
    name = `Straight, ${RANK_NAMES[straightHigh]} high`;
  } else if (groups[0].n === 3) {
    const kick = groups
      .filter((g) => g.n === 1)
      .map((g) => g.r)
      .sort((a, b) => b - a);
    value = [3, groups[0].r, ...kick];
    name = `Three ${RANK_NAMES[groups[0].r]}s`;
  } else if (groups[0].n === 2 && groups[1] && groups[1].n === 2) {
    const pairs = groups
      .filter((g) => g.n === 2)
      .map((g) => g.r)
      .sort((a, b) => b - a);
    const kicker = groups.find((g) => g.n === 1);
    value = [2, pairs[0], pairs[1], kicker ? kicker.r : 0];
    name = `Two pair, ${RANK_NAMES[pairs[0]]}s and ${RANK_NAMES[pairs[1]]}s`;
  } else if (groups[0].n === 2) {
    const kick = groups
      .filter((g) => g.n === 1)
      .map((g) => g.r)
      .sort((a, b) => b - a);
    value = [1, groups[0].r, ...kick];
    name = `Pair of ${RANK_NAMES[groups[0].r]}s`;
  } else {
    value = [0, ...rs];
    name = `${RANK_NAMES[rs[0]]} high`;
  }
  return { value, name };
}

function combos<T>(arr: T[], k: number): T[][] {
  const out: T[][] = [];
  const rec = (start: number, path: T[]): void => {
    if (path.length === k) {
      out.push(path.slice());
      return;
    }
    for (let i = start; i <= arr.length - (k - path.length); i++) {
      path.push(arr[i]);
      rec(i + 1, path);
      path.pop();
    }
  };
  rec(0, []);
  return out;
}

/** Best 5-card hand out of 5..7 cards. */
export function evaluate7(cards: Card[]): EvalResult {
  let best: FiveResult | null = null;
  for (const combo of combos(cards, 5)) {
    const e = evaluate5(combo);
    if (!best || compareValue(e.value, best.value) > 0) best = e;
  }
  if (!best) throw new Error("evaluate7 requires at least 5 cards");
  return { category: best.value[0], ranks: best.value, name: best.name };
}

/** 1 if a wins, -1 if b wins, 0 on a tie. */
export function compareHands(a: EvalResult, b: EvalResult): number {
  const d = compareValue(a.ranks, b.ranks);
  return d > 0 ? 1 : d < 0 ? -1 : 0;
}

interface DrawInfo {
  flushDraw: boolean;
  straightDraw: boolean;
  draw: boolean;
}

function drawInfo(cards: Card[]): DrawInfo {
  const suits: Record<Suit, number> = { S: 0, H: 0, D: 0, C: 0 };
  cards.forEach((c) => {
    suits[c.suit]++;
  });
  const flushDraw = Object.values(suits).some((n) => n === 4);
  const rs = [...new Set(cards.map((c) => c.rank))];
  if (rs.includes(14)) rs.push(1);
  rs.sort((a, b) => a - b);
  let straightDraw = false;
  for (let start = 1; start <= 10; start++) {
    let have = 0;
    for (let r = start; r < start + 5; r++) if (rs.includes(r)) have++;
    if (have === 4) straightDraw = true;
  }
  return { flushDraw, straightDraw, draw: flushDraw || straightDraw };
}

/* ------------------------------------------------------------------ */
/* Side pots                                                            */
/* ------------------------------------------------------------------ */

export interface Pot {
  amount: number;
  eligible: number[]; // seat indices that can win this pot
}

/** Ported 1:1 from the HTML buildPots, with state replaced by arguments. */
export function buildPots(contributed: number[], inHand: boolean[]): Pot[] {
  const levels = [...new Set(contributed.filter((v) => v > 0))].sort((a, b) => a - b);
  const pots: Pot[] = [];
  let prev = 0;
  for (const level of levels) {
    const contributors: number[] = [];
    for (let i = 0; i < contributed.length; i++) {
      if (contributed[i] >= level) contributors.push(i);
    }
    const amount = (level - prev) * contributors.length;
    const eligible = contributors.filter((i) => inHand[i]);
    if (amount > 0) pots.push({ amount, eligible });
    prev = level;
  }
  return pots;
}

/* ------------------------------------------------------------------ */
/* AI                                                                   */
/* ------------------------------------------------------------------ */

export interface AIPersona {
  name: string;
  style: string;
  aggression: number; // 0..1 — mirrors the HTML profile's agg
  looseness: number; // 0..1 — 1 minus the HTML profile's tight
  bluff: number; // 0..1 — bluff frequency
}

type ProfileKey = "solid" | "lag" | "station" | "tricky" | "novice";

const PROFILE_PARAMS: Record<ProfileKey, { tight: number; agg: number; bluff: number }> = {
  solid: { tight: 0.72, agg: 0.5, bluff: 0.08 },
  lag: { tight: 0.28, agg: 0.84, bluff: 0.24 },
  station: { tight: 0.22, agg: 0.18, bluff: 0.02 },
  tricky: { tight: 0.48, agg: 0.64, bluff: 0.16 },
  novice: { tight: 0.42, agg: 0.38, bluff: 0.1 },
};

const PERSONA_DEFS: Array<{ name: string; style: string; profile: ProfileKey }> = [
  { name: "Mara the Breeder", style: "Tight · solid", profile: "solid" },
  { name: "Slink the Poacher", style: "Loose · aggressive", profile: "lag" },
  { name: "Old Bark", style: "Loose · calls wide", profile: "station" },
  { name: "Vesper", style: "Balanced · deceptive", profile: "tricky" },
  { name: "Pip the Hatchling", style: "Unpredictable", profile: "novice" },
];

export const AI_PERSONAS: AIPersona[] = PERSONA_DEFS.map((d) => ({
  name: d.name,
  style: d.style,
  aggression: PROFILE_PARAMS[d.profile].agg,
  looseness: 1 - PROFILE_PARAMS[d.profile].tight,
  bluff: PROFILE_PARAMS[d.profile].bluff,
}));

const PERSONA_PROFILE: Record<string, ProfileKey> = Object.fromEntries(
  PERSONA_DEFS.map((d) => [d.name, d.profile]),
) as Record<string, ProfileKey>;

export type Street = "preflop" | "flop" | "turn" | "river";

export interface AIDecision {
  action: "fold" | "check" | "call" | "raise";
  amount?: number; // total street-bet target for a raise (may be an all-in)
}

function preflopStrength(hand: Card[]): number {
  const [a, b] = hand.slice().sort((x, y) => y.rank - x.rank);
  let s = 0.18 + (a.rank + b.rank - 4) / 32;
  if (a.rank === b.rank) s = 0.48 + a.rank / 28;
  if (a.suit === b.suit) s += 0.07;
  const gap = a.rank - b.rank;
  if (gap === 1) s += 0.07;
  else if (gap === 2) s += 0.035;
  else if (gap > 4) s -= 0.08;
  if (a.rank === 14) s += 0.08;
  if (a.rank >= 12 && b.rank >= 10) s += 0.08;
  return Math.max(0.05, Math.min(0.98, s));
}

interface AIDecisionCtx {
  hand: Card[];
  board: Card[];
  pot: number;
  call: number; // chips to call
  max: number; // streetBet + stack — total street-bet ceiling
  minTarget: number; // minimum legal total street-bet for a raise
  canRaise: boolean;
  currentBet: number; // highest street bet at the table
  stack: number;
  contributed: number; // total chips this player put in this hand
  persona: AIPersona;
  street: Street;
  priorAgg: boolean; // this player raised/bet recently (log-based in HTML; false standalone)
  handNo: number;
  seat: number;
  rng: () => number;
}

/** Exact port of the HTML aiDecision; see module header for simplifications. */
function aiDecideCtx(ctx: AIDecisionCtx): AIDecision {
  const profile = PERSONA_PROFILE[ctx.persona.name] ?? "solid";
  const prof = PROFILE_PARAMS[profile];
  const pot = Math.max(1, ctx.pot);
  const odds = ctx.call / (pot + ctx.call);
  const pre = ctx.street === "preflop";
  let strength: number;
  let made = 0;
  let hasDraw = false;
  if (pre) {
    strength = preflopStrength(ctx.hand);
  } else {
    const all = [...ctx.hand, ...ctx.board];
    const e = evaluate7(all);
    const base = [0.1, 0.28, 0.48, 0.64, 0.72, 0.8, 0.9, 0.96, 0.995][e.category];
    const d = drawInfo(all);
    strength = Math.min(0.995, base + (d.flushDraw ? 0.1 : 0) + (d.straightDraw ? 0.08 : 0));
    made = e.category;
    hasDraw = d.draw;
  }
  if (profile === "novice") strength += ((ctx.handNo + ctx.seat * 3) % 5 - 2) * 0.045;
  const short = ctx.stack < 220;
  const committed = ctx.contributed > 350 || ctx.call < pot * 0.18;
  const allInPressure = ctx.call >= ctx.stack || ctx.call > pot * 0.75;
  const river = ctx.street === "river";

  if (ctx.call > 0) {
    if (river && made >= 2 && ctx.call <= pot * 0.28) return { action: "call" };
    if (allInPressure && strength < 0.66 && !short && !committed) return { action: "fold" };
    const callThreshold = odds + (prof.tight - 0.5) * 0.18 + (allInPressure ? 0.1 : 0);
    if (strength < callThreshold) return { action: "fold" };
    const raiseReady = strength > 0.76 - (prof.agg - 0.5) * 0.1 && ctx.canRaise;
    if (raiseReady) {
      const target = Math.min(
        ctx.max,
        Math.max(ctx.minTarget, ctx.currentBet + Math.round((pot * 0.55) / 10) * 10),
      );
      // HTML distinguished 'allin' vs 'raise' here; both are a raise to the
      // target, and a target of max IS the all-in — applyAction handles it.
      return { action: "raise", amount: target };
    }
    return { action: "call" };
  }

  const scare = ctx.board.length > 0 && ctx.board[ctx.board.length - 1].rank >= 12;
  const credibleBluff = hasDraw || (river && ctx.priorAgg && scare && prof.bluff > 0.12);
  const valueBet = strength > 0.58 - (prof.agg - 0.5) * 0.12;
  const bluff = credibleBluff && ctx.rng() < prof.bluff;
  if (ctx.canRaise && (valueBet || bluff)) {
    let frac = strength > 0.85 ? 0.75 : 0.45;
    if (profile === "station") frac = 0.33;
    if (profile === "lag") frac = 0.62;
    const target = Math.max(ctx.minTarget, Math.min(ctx.max, Math.round((pot * frac) / 10) * 10));
    // HTML returned 'bet' when currentBet was 0, 'raise' otherwise — same
    // applyAction path either way.
    return { action: "raise", amount: target };
  }
  return { action: "check" };
}

/**
 * Standalone AI decision. Reconstructs the betting context from the
 * arguments (acting player is assumed to have no street bet yet, min-raise
 * 20, no prior aggression, hand #0) — for full table context use
 * aiTakeTurn() on a live TableState instead.
 */
export function aiDecide(
  hand: Card[],
  board: Card[],
  pot: number,
  toCall: number,
  stack: number,
  persona: AIPersona,
  street: Street,
  rng: () => number = Math.random,
): AIDecision {
  const currentBet = toCall;
  const call = Math.max(0, currentBet);
  const max = stack;
  const minTarget = currentBet === 0 ? Math.min(20, max) : Math.min(currentBet + 20, max);
  const canRaise = max > currentBet && (max >= currentBet + 20 || stack <= call);
  return aiDecideCtx({
    hand,
    board,
    pot,
    call,
    max,
    minTarget,
    canRaise,
    currentBet,
    stack,
    contributed: 0,
    persona,
    street,
    priorAgg: false,
    handNo: 0,
    seat: 0,
    rng,
  });
}

/* ------------------------------------------------------------------ */
/* Table flow — pure reducer                                            */
/* ------------------------------------------------------------------ */

export type TableStreet = "preflop" | "flop" | "turn" | "river" | "showdown" | "done";

export interface SeatState {
  name: string;
  isHero: boolean;
  persona?: AIPersona;
  stack: number;
  bet: number; // current street's bet
  hole: Card[];
  folded: boolean;
  allIn: boolean;
  hasActed: boolean;
}

export interface HandResult {
  seat: number;
  name: string;
  amount: number;
  handName?: string;
}

export interface TableState {
  seats: SeatState[];
  board: Card[];
  deck: Card[];
  dealer: number;
  street: TableStreet;
  actingSeat: number; // -1 when no one is to act
  minRaise: number;
  currentBet: number;
  pending: number[]; // seats still owing action this street
  actedSinceFullRaise: number[]; // re-raise gating, ported from the HTML
  contributed: number[]; // per-seat total chips committed this hand
  handNo: number;
  smallBlind: number;
  bigBlind: number;
  results?: HandResult[];
}

export interface LegalAction {
  action: "fold" | "check" | "call" | "raise" | "allin";
  amount?: number; // call amount, or raise target (total street bet)
  max?: number; // raise ceiling (total street bet)
}

const NUM_SEATS = 6;
const BETTING_STREETS: Street[] = ["preflop", "flop", "turn", "river"];

function canActSeat(p: SeatState): boolean {
  return !p.folded && !p.allIn && p.stack > 0;
}

function cloneTable(t: TableState): TableState {
  return {
    ...t,
    seats: t.seats.map((s) => ({ ...s, hole: s.hole.slice() })),
    board: t.board.slice(),
    deck: t.deck.slice(),
    pending: t.pending.slice(),
    actedSinceFullRaise: t.actedSinceFullRaise.slice(),
    contributed: t.contributed.slice(),
    results: t.results ? t.results.map((r) => ({ ...r })) : undefined,
  };
}

function nextSeatAfter(
  t: TableState,
  from: number,
  pred: (p: SeatState, i: number) => boolean,
): number {
  for (let k = 1; k <= t.seats.length; k++) {
    const i = (from + k) % t.seats.length;
    if (pred(t.seats[i], i)) return i;
  }
  return -1;
}

function nextPendingAfter(t: TableState, from: number): number {
  return nextSeatAfter(t, from, (p, i) => canActSeat(p) && t.pending.includes(i));
}

function cleanPending(t: TableState): void {
  t.pending = t.pending.filter(
    (i) => canActSeat(t.seats[i]) && (t.seats[i].bet < t.currentBet || !t.seats[i].hasActed),
  );
}

function roundComplete(t: TableState): boolean {
  const actors = t.seats.filter(canActSeat);
  return (
    actors.every((p) => p.bet === t.currentBet && p.hasActed) && t.pending.length === 0
  );
}

/** Port of the HTML legalFor. */
function legalForSeat(t: TableState, idx: number): {
  call: number;
  maxBet: number;
  minTarget: number;
  canRaise: boolean;
  canCheck: boolean;
} {
  const p = t.seats[idx];
  const callAmt = Math.max(0, t.currentBet - p.bet);
  const maxBet = p.bet + p.stack;
  const minTarget =
    t.currentBet === 0 ? Math.min(20, maxBet) : Math.min(t.currentBet + t.minRaise, maxBet);
  const acted = t.actedSinceFullRaise.includes(idx);
  const canRaise =
    maxBet > t.currentBet && !acted && (maxBet >= t.currentBet + t.minRaise || p.stack <= callAmt);
  return {
    call: Math.min(callAmt, p.stack),
    maxBet,
    minTarget,
    canRaise,
    canCheck: callAmt === 0,
  };
}

/** Port of the HTML contribute: caps at the stack, flags all-in. */
function contributeTo(t: TableState, seat: number, amount: number): number {
  const p = t.seats[seat];
  const paid = Math.max(0, Math.min(amount, p.stack));
  p.stack -= paid;
  p.bet += paid;
  t.contributed[seat] += paid;
  if (p.stack === 0) p.allIn = true;
  return paid;
}

/**
 * Six seats: the hero plus the five AI personas. Blinds 10/20 are posted,
 * hole cards dealt, and the first actor is set (UTG). The dealer button
 * starts at seat 5 and rotates to the next live seat, matching the HTML.
 */
export function createTable(
  heroName: string,
  buyIn: number,
  rng: () => number = Math.random,
): TableState {
  const seats: SeatState[] = [
    {
      name: heroName,
      isHero: true,
      stack: buyIn,
      bet: 0,
      hole: [],
      folded: false,
      allIn: false,
      hasActed: false,
    },
    ...AI_PERSONAS.map((persona) => ({
      name: persona.name,
      isHero: false,
      persona,
      stack: 1000,
      bet: 0,
      hole: [] as Card[],
      folded: false,
      allIn: false,
      hasActed: false,
    })),
  ];
  const t: TableState = {
    seats,
    board: [],
    deck: shuffle(makeDeck(), rng),
    dealer: 5,
    street: "preflop",
    actingSeat: -1,
    minRaise: 20,
    currentBet: 0,
    pending: [],
    actedSinceFullRaise: [],
    contributed: seats.map(() => 0),
    handNo: 1,
    smallBlind: 10,
    bigBlind: 20,
    results: undefined,
  };

  const dealer = nextSeatAfter(t, t.dealer, (p) => p.stack > 0);
  t.dealer = dealer === -1 ? t.dealer : dealer;
  const sb = nextSeatAfter(t, t.dealer, (p) => p.stack > 0);
  const bb = nextSeatAfter(t, sb, (p) => p.stack > 0);
  contributeTo(t, sb, t.smallBlind);
  contributeTo(t, bb, t.bigBlind);
  t.currentBet = Math.max(t.seats[sb].bet, t.seats[bb].bet);
  t.minRaise = t.bigBlind;

  // Two hole cards to each live seat, starting left of the dealer.
  for (let round = 0; round < 2; round++) {
    for (let k = 1; k <= NUM_SEATS; k++) {
      const i = (t.dealer + k) % NUM_SEATS;
      const card = t.deck.pop();
      if (card) t.seats[i].hole.push(card);
    }
  }

  t.pending = t.seats.map((p, i) => i).filter((i) => canActSeat(t.seats[i]));
  t.seats.forEach((p) => {
    p.hasActed = false;
  });
  t.actingSeat = nextSeatAfter(t, bb, canActSeat);
  // Everyone all-in from the blinds: run the board out immediately.
  if (!t.seats.some(canActSeat)) return advanceStreet(t);
  return t;
}

export function getLegalActions(t: TableState): LegalAction[] {
  const idx = t.actingSeat;
  if (idx < 0 || idx >= t.seats.length) return [];
  const p = t.seats[idx];
  if (!canActSeat(p)) return [];
  const l = legalForSeat(t, idx);
  const actions: LegalAction[] = [{ action: "fold" }];
  if (l.canCheck) actions.push({ action: "check" });
  else actions.push({ action: "call", amount: l.call });
  if (l.canRaise) {
    actions.push({ action: "raise", amount: l.minTarget, max: l.maxBet });
    if (l.maxBet > l.minTarget) actions.push({ action: "allin", amount: l.maxBet });
  } else if (l.call > 0) {
    actions.push({ action: "allin", amount: l.maxBet });
  }
  return actions;
}

/**
 * Applies one player's action and returns the new table. Pure: the input is
 * never mutated; illegal actions (wrong seat, can't act, check into a bet,
 * unknown action) return the input unchanged. Betting-round completion
 * follows the HTML's roundComplete/nextPendingAfter/cleanPending semantics:
 * a lone survivor takes the pot uncontested, a completed round advances the
 * street, otherwise action passes to the next pending seat.
 */
export function applyAction(
  t: TableState,
  seat: number,
  action: string,
  amount?: number,
): TableState {
  if (seat < 0 || seat >= t.seats.length) return t;
  const s = cloneTable(t);
  const p = s.seats[seat];
  if (s.actingSeat !== seat || !canActSeat(p)) return t;
  const l = legalForSeat(s, seat);
  const oldBet = s.currentBet;

  if (action === "fold") {
    p.folded = true;
  } else if (action === "check") {
    if (!l.canCheck) return t;
  } else if (action === "call") {
    contributeTo(s, seat, l.call);
  } else if (action === "raise" || action === "bet" || action === "allin") {
    const target = action === "allin" ? l.maxBet : Math.max(0, Math.min(amount || l.minTarget, l.maxBet));
    if (target <= s.currentBet) {
      contributeTo(s, seat, l.call);
    } else {
      const raiseBy = target - s.currentBet;
      contributeTo(s, seat, target - p.bet);
      s.currentBet = s.seats[seat].bet;
      const fullRaise = raiseBy >= s.minRaise;
      if (fullRaise) {
        s.minRaise = raiseBy;
        s.actedSinceFullRaise = [seat];
      } else if (!s.actedSinceFullRaise.includes(seat)) {
        s.actedSinceFullRaise.push(seat);
      }
    }
  } else {
    return t;
  }

  p.hasActed = true;
  if (!s.actedSinceFullRaise.includes(seat)) s.actedSinceFullRaise.push(seat);
  s.pending = s.pending.filter((i) => i !== seat);
  if (s.currentBet > oldBet) {
    for (let i = 0; i < s.seats.length; i++) {
      if (
        i !== seat &&
        canActSeat(s.seats[i]) &&
        s.seats[i].bet < s.currentBet &&
        !s.pending.includes(i)
      ) {
        s.pending.push(i);
      }
    }
  }
  cleanPending(s);

  const remaining = s.seats.map((ps, i) => i).filter((i) => !s.seats[i].folded);
  if (remaining.length === 1) return awardUncontested(s, remaining[0]);
  if (roundComplete(s)) return advanceStreet(s);
  s.actingSeat = nextPendingAfter(s, seat);
  return s;
}

/** Awards the whole pot to the last player standing. */
function awardUncontested(t: TableState, seat: number): TableState {
  const amount = t.contributed.reduce((n, c) => n + c, 0);
  t.seats[seat].stack += amount;
  t.actingSeat = -1;
  t.street = "done";
  t.results = [{ seat, name: t.seats[seat].name, amount }];
  return t;
}

/**
 * Moves to the next street: burns, deals flop/turn/river, resets the
 * betting round. From the river this settles the showdown; when one or
 * fewer players can still act the board runs out immediately.
 */
export function advanceStreet(t: TableState): TableState {
  if (t.street === "showdown" || t.street === "done") return t;
  const s = cloneTable(t);
  for (const p of s.seats) {
    p.bet = 0;
    p.hasActed = false;
  }
  s.currentBet = 0;
  s.minRaise = 20;
  s.actedSinceFullRaise = [];
  if (s.street === "river") return settleShowdownInternal(s);

  const draw = (): Card => {
    const c = s.deck.pop();
    if (!c) throw new Error("Deck exhausted while dealing the board");
    return c;
  };
  draw(); // burn
  if (s.street === "preflop") {
    s.street = "flop";
    s.board.push(draw(), draw(), draw());
  } else if (s.street === "flop") {
    s.street = "turn";
    s.board.push(draw());
  } else {
    s.street = "river";
    s.board.push(draw());
  }

  const actors = s.seats.map((p, i) => i).filter((i) => canActSeat(s.seats[i]));
  if (actors.length <= 1) return advanceStreet(s);
  s.pending = actors.slice();
  s.actingSeat = nextSeatAfter(s, s.dealer, canActSeat);
  return s;
}

/**
 * Evaluates every live hand, builds side pots, awards each pot to its
 * winner(s) with odd chips going to the earliest seat left of the dealer.
 * Sets results and marks the hand done.
 */
export function settleShowdown(t: TableState): TableState {
  return settleShowdownInternal(cloneTable(t));
}

function settleShowdownInternal(s: TableState): TableState {
  s.street = "showdown";
  s.actingSeat = -1;
  const contenders = s.seats.map((p, i) => i).filter((i) => !s.seats[i].folded);
  const bestBySeat: (EvalResult | undefined)[] = s.seats.map(() => undefined);
  for (const i of contenders) {
    bestBySeat[i] = evaluate7([...s.seats[i].hole, ...s.board]);
  }
  const pots = buildPots(
    s.contributed,
    s.seats.map((p) => !p.folded),
  );
  const payouts = new Map<number, number>();
  for (const pot of pots) {
    let bestVal: number[] | null = null;
    let winners: number[] = [];
    for (const i of pot.eligible) {
      const ev = bestBySeat[i];
      if (!ev) continue;
      if (!bestVal || compareValue(ev.ranks, bestVal) > 0) {
        bestVal = ev.ranks;
        winners = [i];
      } else if (compareValue(ev.ranks, bestVal) === 0) {
        winners.push(i);
      }
    }
    if (winners.length === 0) continue;
    const share = Math.floor(pot.amount / winners.length);
    const remainder = pot.amount % winners.length;
    const oddOrder: number[] = [];
    for (let k = 1; k <= s.seats.length; k++) {
      const i = (s.dealer + k) % s.seats.length;
      if (winners.includes(i)) oddOrder.push(i);
    }
    for (const i of winners) payouts.set(i, (payouts.get(i) ?? 0) + share);
    for (let r = 0; r < remainder; r++) {
      const i = oddOrder[r];
      payouts.set(i, (payouts.get(i) ?? 0) + 1);
    }
  }
  const results: HandResult[] = [];
  for (const [i, amount] of payouts) {
    s.seats[i].stack += amount;
    results.push({
      seat: i,
      name: s.seats[i].name,
      amount,
      handName: bestBySeat[i] ? (bestBySeat[i] as EvalResult).name : undefined,
    });
  }
  results.sort((a, b) => b.amount - a.amount);
  s.results = results;
  s.street = "done";
  return s;
}

/**
 * Lets the AI persona in the acting seat take one turn. Returns the input
 * unchanged when it's the hero's turn, no one is acting, or the hand is
 * over. Callers loop this (with their own pacing) until the hero is up or
 * the street/hand ends — the engine itself has no timers.
 */
export function aiTakeTurn(t: TableState, rng: () => number = Math.random): TableState {
  if (!BETTING_STREETS.includes(t.street as Street)) return t;
  const idx = t.actingSeat;
  if (idx < 0 || idx >= t.seats.length) return t;
  const seat = t.seats[idx];
  if (seat.isHero || !seat.persona || !canActSeat(seat)) return t;
  const l = legalForSeat(t, idx);
  const decision = aiDecideCtx({
    hand: seat.hole,
    board: t.board,
    pot: t.contributed.reduce((n, c) => n + c, 0),
    call: l.call,
    max: l.maxBet,
    minTarget: l.minTarget,
    canRaise: l.canRaise,
    currentBet: t.currentBet,
    stack: seat.stack,
    contributed: t.contributed[idx],
    persona: seat.persona,
    street: t.street as Street,
    priorAgg: false,
    handNo: t.handNo,
    seat: idx,
    rng,
  });
  return applyAction(t, idx, decision.action, decision.amount);
}

/* ------------------------------------------------------------------ */
/* Self-tests (ported from the HTML selfTests: evaluator + side pots)   */
/* ------------------------------------------------------------------ */

/** Re-implements the HTML's evaluator/buildPots assertions; throws on failure. */
export function runHoldemSelfTests(): void {
  const E = (s: string): EvalResult => evaluate7(s.split(" ").map(parseCard));
  const assert = (x: boolean, m: string): void => {
    if (!x) throw new Error(`Poker self-test: ${m}`);
  };
  const classes: Array<[string, number, string]> = [
    ["AS KS QS JS TS 2H 3D", 8, "royal flush"],
    ["9S 8S 7S 6S 5S KD 2H", 8, "straight flush"],
    ["9S 9H 9D 9C KS 2H 3D", 7, "four kind"],
    ["KS KH KD 2C 2S 7H 8D", 6, "full house"],
    ["AH QH 9H 7H 3H 2S 2D", 5, "flush"],
    ["AS 2H 3D 4C 5S 9H KD", 4, "wheel straight"],
    ["8S 8H 8D KC 2S 4H 5D", 3, "three kind"],
    ["QS QH 7D 7C AS 3H 2D", 2, "two pair"],
    ["JS JH KD 8C 6S 4H 2D", 1, "pair"],
    ["AS KH 9D 7C 4S 3H 2D", 0, "high card"],
  ];
  for (const [cards, cat, label] of classes) {
    assert(E(cards).category === cat, label);
  }
  assert(E("AS 2H 3D 4C 5S 9H KD").ranks[1] === 5, "wheel high is five");
  assert(
    compareHands(E("2H 4H 6H 8H TH JS QD"), E("5S 6H 7D 8C 9S JH QD")) > 0,
    "flush over straight",
  );
  assert(
    compareHands(E("KS KH KD 2C 2S 7H 8D"), E("AH QH 9H 7H 3H 2S 2D")) > 0,
    "full house over flush",
  );
  assert(
    compareHands(E("AS AH KD QH 9D 4C 3S"), E("AD AC KD QH 8D 4C 3S")) > 0,
    "pair kicker",
  );
  assert(
    compareHands(E("AS KH QD JC TS 2H 3D"), E("AH KD QC JS TH 7S 8D")) === 0,
    "identical board split",
  );
  const pots = buildPots([100, 250, 500], [true, true, true]);
  assert(
    pots.length === 3 &&
      pots[0].amount === 300 &&
      pots[1].amount === 300 &&
      pots[2].amount === 250 &&
      pots.reduce((n, p) => n + p.amount, 0) === 850,
    "multiple side pots",
  );
}
