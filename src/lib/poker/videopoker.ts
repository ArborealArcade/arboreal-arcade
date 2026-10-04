// Video poker (Serpent Draw / Jacks-or-Better) engine, ported from the
// self-contained snake-poker HTML5 game (videoPokerResult/doubleMath/
// vpDeal/vpDrawCards).
//
// Pure TypeScript: no DOM, no React, no audio. Importable from client code
// and from Node.js API routes. The BJCard shape is reused from the blackjack
// engine (same deck of cards, different game).
//
// Deviations from the HTML original:
// - The original rendered DOM, played sounds, tracked a lifesap bankroll, and
//   offered a 5-step double-or-nothing gamble ladder. This port keeps the pure
//   math: scoring (scoreVideoPoker), the single double-or-nothing comparison
//   (doubleOrNothing), and the deal/draw card plumbing (dealDrawHand,
//   redrawHand). Gamble ladders, bankroll, and UI live with the caller.
// - dealDrawHand/redrawHand are pure (the original mutated vp.deck in place).
//   Replacements are drawn from the end of the stub in index order, matching
//   the original's pop() sequence exactly.

import type { BJCard } from "./blackjack";

export type { BJCard };

// ---------------------------------------------------------------------------
// Paytable: 9/6 Jacks-or-Better, per-coin columns for 1..5 coin bets.
// Royal flush pays the 4000-coin bonus only at max bet.
// ---------------------------------------------------------------------------

type PayColumns = readonly [number, number, number, number, number];

const JOB_PAYTABLE_FULL: ReadonlyArray<readonly [string, PayColumns]> = [
  ["Royal flush", [250, 500, 750, 1000, 4000]],
  ["Straight flush", [50, 100, 150, 200, 250]],
  ["Four of a kind", [25, 50, 75, 100, 125]],
  ["Full house", [9, 18, 27, 36, 45]],
  ["Flush", [6, 12, 18, 24, 30]],
  ["Straight", [4, 8, 12, 16, 20]],
  ["Three of a kind", [3, 6, 9, 12, 15]],
  ["Two pair", [2, 4, 6, 8, 10]],
  ["Jacks or better", [1, 2, 3, 4, 5]],
];

/** 9/6 Jacks-or-Better per-coin (1-coin bet) returns, keyed by hand name. */
export const JOB_PAYTABLE_96: Record<string, number> = (() => {
  const out: Record<string, number> = {};
  for (const [name, cols] of JOB_PAYTABLE_FULL) out[name] = cols[0];
  return out;
})();

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

const VP_SUIT_NAMES: Record<BJCard["suit"], string> = {
  S: "Spades",
  H: "Hearts",
  D: "Diamonds",
  C: "Clubs",
};

// ---------------------------------------------------------------------------
// Five-card evaluator (ports evaluate5; category ids match the original)
// ---------------------------------------------------------------------------

interface FiveCardScore {
  category: number; // 8 straight flush .. 0 high card (royal is 8 with high ace)
  value: number[]; // tiebreak vector, category first
  name: string;
}

function evaluateFiveCard(cards: BJCard[]): FiveCardScore {
  const rs = cards.map((c) => c.rank).sort((a, b) => b - a);
  const counts: Record<number, number> = {};
  for (const r of rs) counts[r] = (counts[r] || 0) + 1;
  const groups = Object.entries(counts)
    .map(([r, n]) => ({ r: Number(r), n }))
    .sort((a, b) => b.n - a.n || b.r - a.r);
  const flush = cards.every((c) => c.suit === cards[0].suit);
  const uniq: number[] = [...new Set(rs)];
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
  let category: number;
  if (flush && straightHigh) {
    category = 8;
    value = [8, straightHigh];
    name =
      straightHigh === 14
        ? "Royal flush"
        : `Straight flush, ${RANK_NAMES[straightHigh]} high`;
  } else if (groups[0].n === 4) {
    const q = groups[0].r;
    const k = groups.find((g) => g.n === 1)?.r ?? 0;
    category = 7;
    value = [7, q, k];
    name = `Four ${RANK_NAMES[q]}s`;
  } else if (groups[0].n === 3 && groups[1] && groups[1].n === 2) {
    category = 6;
    value = [6, groups[0].r, groups[1].r];
    name = `Full house, ${RANK_NAMES[groups[0].r]}s over ${RANK_NAMES[groups[1].r]}s`;
  } else if (flush) {
    category = 5;
    value = [5, ...rs];
    name = `Flush, ${VP_SUIT_NAMES[cards[0].suit]} ${RANK_NAMES[rs[0]]} high`;
  } else if (straightHigh) {
    category = 4;
    value = [4, straightHigh];
    name = `Straight, ${RANK_NAMES[straightHigh]} high`;
  } else if (groups[0].n === 3) {
    const kick = groups
      .filter((g) => g.n === 1)
      .map((g) => g.r)
      .sort((a, b) => b - a);
    category = 3;
    value = [3, groups[0].r, ...kick];
    name = `Three ${RANK_NAMES[groups[0].r]}s`;
  } else if (groups[0].n === 2 && groups[1] && groups[1].n === 2) {
    const pairs = groups
      .filter((g) => g.n === 2)
      .map((g) => g.r)
      .sort((a, b) => b - a);
    const k = groups.find((g) => g.n === 1)?.r ?? 0;
    category = 2;
    value = [2, pairs[0], pairs[1], k];
    name = `Two pair, ${RANK_NAMES[pairs[0]]}s and ${RANK_NAMES[pairs[1]]}s`;
  } else if (groups[0].n === 2) {
    const kick = groups
      .filter((g) => g.n === 1)
      .map((g) => g.r)
      .sort((a, b) => b - a);
    category = 1;
    value = [1, groups[0].r, ...kick];
    name = `Pair of ${RANK_NAMES[groups[0].r]}s`;
  } else {
    category = 0;
    value = [0, ...rs];
    name = `${RANK_NAMES[rs[0]]} high`;
  }
  return { category, value, name };
}

// Maps evaluate5 categories to paytable rows (royal handled separately).
const CATEGORY_TO_ROW: Record<number, number> = {
  8: 1, // straight flush
  7: 2, // four of a kind
  6: 3, // full house
  5: 4, // flush
  4: 5, // straight
  3: 6, // three of a kind
  2: 7, // two pair
};

export interface VideoPokerScore {
  handName: string;
  payoutCoins: number; // INCLUDES returned bet coins; royal at 5 coins = 4000
}

/**
 * Score a 5-card Jacks-or-Better hand for a 1..5 coin bet.
 * Ports videoPokerResult exactly (including the 4000-coin max-bet royal).
 */
export function scoreVideoPoker(hand: BJCard[], betCoins: number): VideoPokerScore {
  if (hand.length !== 5) {
    throw new Error("scoreVideoPoker: hand must have exactly 5 cards");
  }
  if (!Number.isInteger(betCoins) || betCoins < 1 || betCoins > 5) {
    throw new Error("scoreVideoPoker: betCoins must be an integer 1..5");
  }
  const e = evaluateFiveCard(hand);
  const royal = e.category === 8 && e.value[1] === 14;
  if (royal) {
    return {
      handName: "Royal flush",
      payoutCoins: JOB_PAYTABLE_FULL[0][1][betCoins - 1],
    };
  }
  const row = CATEGORY_TO_ROW[e.category];
  if (row !== undefined) {
    return {
      handName: JOB_PAYTABLE_FULL[row][0],
      payoutCoins: JOB_PAYTABLE_FULL[row][1][betCoins - 1],
    };
  }
  if (e.category === 1 && e.value[1] >= 11) {
    return { handName: "Jacks or better", payoutCoins: betCoins };
  }
  return { handName: e.name + " · no payout", payoutCoins: 0 };
}

// ---------------------------------------------------------------------------
// Double-or-nothing (ports doubleMath)
// ---------------------------------------------------------------------------

/**
 * Single double-or-nothing comparison: higher rank doubles the stake,
 * a tie returns the stake, a lower rank loses it. Returns resulting coins.
 */
export function doubleOrNothing(
  stakeCoins: number,
  playerCard: BJCard,
  dealerCard: BJCard
): number {
  if (playerCard.rank > dealerCard.rank) return stakeCoins * 2;
  if (playerCard.rank === dealerCard.rank) return stakeCoins;
  return 0;
}

// ---------------------------------------------------------------------------
// Deal & draw plumbing (pure versions of vpDeal / vpDrawCards)
// ---------------------------------------------------------------------------

/**
 * Deal 5 cards from a shuffled 52-card deck. Pure: the input deck is not
 * mutated. Cards come off the end of the array (matching the original's
 * pop() order); the remaining stub is `deck.slice(0, deck.length - 5)`.
 */
export function dealDrawHand(deck: BJCard[]): BJCard[] {
  if (deck.length < 5) {
    throw new Error("dealDrawHand: deck must have at least 5 cards");
  }
  const n = deck.length;
  return [deck[n - 1], deck[n - 2], deck[n - 3], deck[n - 4], deck[n - 5]];
}

/**
 * Redraw: replace every unheld card. Pure: inputs are not mutated.
 * `deck` is the remaining stub after the deal; replacements are drawn from
 * its end in index order (matching the original's pop() sequence).
 */
export function redrawHand(hand: BJCard[], holds: boolean[], deck: BJCard[]): BJCard[] {
  if (hand.length !== holds.length) {
    throw new Error("redrawHand: holds must have one entry per card");
  }
  const needed = holds.filter((h) => !h).length;
  if (deck.length < needed) {
    throw new Error("redrawHand: not enough cards left in the stub");
  }
  const out = hand.slice();
  let k = deck.length - 1;
  for (let i = 0; i < out.length; i++) {
    if (!holds[i]) out[i] = { ...deck[k--] };
  }
  return out;
}

// ---------------------------------------------------------------------------
// Self-tests (re-implements the HTML selfTests() video-poker assertions)
// ---------------------------------------------------------------------------

function parseCard(s: string): BJCard {
  const suit = s.slice(-1) as BJCard["suit"];
  const r = s.slice(0, -1);
  const map: Record<string, number> = { A: 14, K: 13, Q: 12, J: 11, T: 10 };
  const rank = map[r] !== undefined ? map[r] : Number(r);
  if (!Number.isInteger(rank) || rank < 2 || rank > 14) {
    throw new Error("Bad test card: " + s);
  }
  return { rank, suit };
}

/** Throws on the first failure. Covers the HTML selfTests() video-poker assertions plus deal/draw smoke tests. */
export function runCasinoSelfTests(): void {
  const assert = (x: boolean, m: string): void => {
    if (!x) throw new Error("Video poker self-test failed: " + m);
  };
  const C = (s: string): BJCard => parseCard(s);
  const hand = (s: string): BJCard[] => s.split(" ").map(C);

  // --- HTML selfTests() assertions, verbatim semantics ---
  assert(
    scoreVideoPoker(hand("AS KS QS JS TS"), 5).payoutCoins === 4000,
    "video poker max royal"
  );
  assert(
    scoreVideoPoker(hand("JH JS 4D 7C 9S"), 3).payoutCoins === 3,
    "video poker jacks or better"
  );
  assert(
    scoreVideoPoker(hand("TH TS 4D 7C 9S"), 5).payoutCoins === 0,
    "video poker low pair"
  );
  assert(
    doubleOrNothing(100, C("QS"), C("9H")) === 200,
    "double-or-nothing higher card doubles"
  );
  assert(
    doubleOrNothing(100, C("9S"), C("9H")) === 100,
    "double-or-nothing tie pushes"
  );
  assert(
    doubleOrNothing(100, C("4S"), C("QH")) === 0,
    "double-or-nothing lower card loses"
  );

  // --- Paytable spot checks (9/6 JoB) ---
  assert(JOB_PAYTABLE_96["Full house"] === 9, "9/6: full house pays 9");
  assert(JOB_PAYTABLE_96["Flush"] === 6, "9/6: flush pays 6");
  assert(
    scoreVideoPoker(hand("AS KS QS JS TS"), 1).payoutCoins === 250,
    "royal at 1 coin pays 250"
  );
  assert(
    scoreVideoPoker(hand("9S 8S 7S 6S 5S"), 5).payoutCoins === 250,
    "straight flush at 5 coins pays 250"
  );
  assert(
    scoreVideoPoker(hand("9S 9H 9D 9C KS"), 2).payoutCoins === 50,
    "quads at 2 coins pays 50"
  );
  assert(
    scoreVideoPoker(hand("KS KH KD 2C 2S"), 1).payoutCoins === 9,
    "full house at 1 coin pays 9"
  );
  assert(
    scoreVideoPoker(hand("AH QH 9H 7H 3H"), 4).payoutCoins === 24,
    "flush at 4 coins pays 24"
  );
  assert(
    scoreVideoPoker(hand("AS 2H 3D 4C 5S"), 5).payoutCoins === 20,
    "wheel straight at 5 coins pays 20"
  );
  assert(
    scoreVideoPoker(hand("8S 8H 8D KC 2S"), 1).payoutCoins === 3,
    "trips at 1 coin pays 3"
  );
  assert(
    scoreVideoPoker(hand("QS QH 7D 7C AS"), 5).payoutCoins === 10,
    "two pair at 5 coins pays 10"
  );
  const jo = scoreVideoPoker(hand("QD QS 4D 7C 9S"), 5);
  assert(jo.handName === "Jacks or better" && jo.payoutCoins === 5, "queens pay 1:1");
  const low = scoreVideoPoker(hand("TH TS 4D 7C 9S"), 5);
  assert(low.payoutCoins === 0 && low.handName.includes("no payout"), "tens pay nothing");

  // --- Deal/draw plumbing ---
  const deck = hand("2S 3S 4S 5S 6S 7S 8S 9S TS JS");
  const dealt = dealDrawHand(deck);
  assert(
    dealt.map((c) => c.rank).join(",") === "11,10,9,8,7",
    "deal takes 5 cards off the end in pop order"
  );
  assert(deck.length === 10, "deal does not mutate the input deck");
  const stub = deck.slice(0, deck.length - 5);
  const redrawn = redrawHand(dealt, [true, false, true, false, true], stub);
  assert(
    redrawn[0].rank === 11 &&
      redrawn[2].rank === 9 &&
      redrawn[4].rank === 7,
    "held cards stay"
  );
  assert(
    redrawn[1].rank === 6 && redrawn[3].rank === 5,
    "replacements come off the stub end in index order"
  );
  assert(
    redrawn[0] === dealt[0] && redrawn[2] === dealt[2] && redrawn[4] === dealt[4],
    "held slots keep identical card references"
  );

  // --- Validation throws ---
  let threw = false;
  try {
    scoreVideoPoker(hand("AS KS QS JS TS"), 6);
  } catch {
    threw = true;
  }
  assert(threw, "betCoins outside 1..5 throws");
  threw = false;
  try {
    redrawHand(dealt, [true, false], stub);
  } catch {
    threw = true;
  }
  assert(threw, "holds/hand length mismatch throws");
}
