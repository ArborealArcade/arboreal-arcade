// Texas Hold'em 7-card hand evaluator for Snake Duels.
// Cards are strings like "As", "Td", "7h" (rank + suit).
//
// NOTE: duel outcomes are computed server-side by the plpgsql port in
// supabase/migrations/20260928_snake_duels_pvp.sql (snake_duels_eval5/7),
// which mirrors this implementation. The client never evaluates; only
// parseDuelCard below is used client-side (to render cards).

export type DuelSuit = "S" | "H" | "D" | "C";

export type ParsedDuelCard = { rank: number; suit: DuelSuit };

const RANK_ORDER = "23456789TJQKA";

export function parseDuelCard(s: string): ParsedDuelCard {
  const m = /^([2-9]|10|[TJQKA])([shdc])$/i.exec(s.trim());
  if (!m) throw new Error(`bad card: ${s}`);
  const rank = m[1].length === 2 ? 10 : RANK_ORDER.indexOf(m[1].toUpperCase()) + 2;
  return { rank, suit: m[2].toUpperCase() as DuelSuit };
}

export function rankName(rank: number): string {
  return rank === 14 ? "Ace" : rank === 13 ? "King" : rank === 12 ? "Queen" : rank === 11 ? "Jack" : String(rank);
}

export type DuelEval = {
  /** Lexicographically comparable: [category, ...tiebreak ranks]. */
  score: number[];
  name: string;
};

function evaluate5(cards: ParsedDuelCard[]): DuelEval {
  const ranks = cards.map((c) => c.rank).sort((a, b) => b - a);
  const flush = cards.every((c) => c.suit === cards[0].suit);
  const uniq: number[] = [];
  for (const r of ranks) if (uniq[uniq.length - 1] !== r) uniq.push(r);

  let straightHigh = 0;
  if (uniq.length === 5) {
    if (uniq[0] - uniq[4] === 4) straightHigh = uniq[0];
    else if (uniq[0] === 14 && uniq[1] === 5) straightHigh = 5; // wheel
  }

  const counts = new Map<number, number>();
  for (const r of ranks) counts.set(r, (counts.get(r) ?? 0) + 1);
  // [rank, count] sorted by count desc, then rank desc.
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const kickers = (skip: number[]) => ranks.filter((r) => !skip.includes(r));

  if (straightHigh && flush) {
    return {
      score: [8, straightHigh],
      name: straightHigh === 14 ? "Royal Flush" : `Straight Flush, ${rankName(straightHigh)} high`,
    };
  }
  if (groups[0][1] === 4) {
    const [q] = groups[0];
    return { score: [7, q, kickers([q])[0]], name: `Four of a Kind, ${rankName(q)}s` };
  }
  if (groups[0][1] === 3 && groups[1][1] === 2) {
    const [t, p] = [groups[0][0], groups[1][0]];
    return { score: [6, t, p], name: `Full House, ${rankName(t)}s over ${rankName(p)}s` };
  }
  if (flush) {
    return { score: [5, ...ranks], name: `Flush, ${rankName(ranks[0])} high` };
  }
  if (straightHigh) {
    return { score: [4, straightHigh], name: `Straight, ${rankName(straightHigh)} high` };
  }
  if (groups[0][1] === 3) {
    const [t] = groups[0];
    return { score: [3, t, ...kickers([t])], name: `Three of a Kind, ${rankName(t)}s` };
  }
  if (groups[0][1] === 2 && groups[1][1] === 2) {
    const [hp, lp] = [groups[0][0], groups[1][0]];
    return { score: [2, hp, lp, ...kickers([hp, lp])], name: `Two Pair, ${rankName(hp)}s and ${rankName(lp)}s` };
  }
  if (groups[0][1] === 2) {
    const [p] = groups[0];
    return { score: [1, p, ...kickers([p])], name: `Pair of ${rankName(p)}s` };
  }
  return { score: [0, ...ranks], name: `${rankName(ranks[0])} high` };
}

/** Compare two evals: >0 means a wins, <0 means b wins, 0 means tie. */
export function compareDuelEvals(a: DuelEval, b: DuelEval): number {
  const n = Math.max(a.score.length, b.score.length);
  for (let i = 0; i < n; i++) {
    const d = (a.score[i] ?? 0) - (b.score[i] ?? 0);
    if (d !== 0) return d > 0 ? 1 : -1;
  }
  return 0;
}

/** Best 5-card hand out of 7. */
export function evaluate7(cardStrs: string[]): DuelEval {
  if (cardStrs.length !== 7) throw new Error("evaluate7 needs exactly 7 cards");
  const cards = cardStrs.map(parseDuelCard);
  let best: DuelEval | null = null;
  for (let a = 0; a < 3; a++)
    for (let b = a + 1; b < 4; b++)
      for (let c = b + 1; c < 5; c++)
        for (let d = c + 1; d < 6; d++)
          for (let e = d + 1; e < 7; e++) {
            const ev = evaluate5([cards[a], cards[b], cards[c], cards[d], cards[e]]);
            if (!best || compareDuelEvals(ev, best) > 0) best = ev;
          }
  return best!;
}

/** Full showdown: both holes + board -> winner and hand names. */
export function duelShowdown(
  challengerHole: string[],
  opponentHole: string[],
  board: string[]
): { winner: "challenger" | "opponent" | null; challengerHand: string; opponentHand: string } {
  const ch = evaluate7([...challengerHole, ...board]);
  const op = evaluate7([...opponentHole, ...board]);
  const cmp = compareDuelEvals(ch, op);
  return {
    winner: cmp > 0 ? "challenger" : cmp < 0 ? "opponent" : null,
    challengerHand: ch.name,
    opponentHand: op.name,
  };
}
