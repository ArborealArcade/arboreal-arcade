// Blackjack engine for the Arboreal Arcade, ported from the self-contained
// snake-poker HTML5 game (newShoe/bjDraw/blackjackTotal/isPair/bjHandLabel/
// bjDealRound/bjHit/bjStand/bjDouble/bjSplit/bjAdvance/bjResolve/bjInsuranceChoice).
//
// Pure TypeScript: no DOM, no React, no audio, no Math.random (randomness is
// injected). Importable from client components and from Node.js API routes.
// Every transition is pure: inputs are never mutated, a new table state is
// returned, and all state is JSON-serializable.
//
// Bankroll policy: this engine never touches lifesap balances. The caller
// deducts the bet when dealing (plus the extra stake on double/split and the
// insurance stake on 'insurance-yes') and credits each BJResult.payout after
// bjSettle.
//
// Deviations from the HTML original:
// - The original mutated a module-level `bj` object, rendered DOM, played
//   sounds, and moved the bankroll. This port is a pure state machine.
// - handTotal() adds a `blackjack` flag (natural 21 on exactly 2 cards); the
//   original returned only {total, soft}.
// - handLabel() takes a card array; the original took a hand record and could
//   echo its result label.
// - The double bankroll check (bankroll < bet) is gone: bankroll lives with
//   the caller, which enforces affordability before applying actions.
// - createShoe(numDecks, rng) takes an injected rng (mulberry32 via makeRng)
//   instead of Math.random. dealBJ() reshuffles with a caller-supplied rng
//   when fewer than 30 cards remain; a draw from an empty shoe throws instead
//   of silently reshuffling mid-round.
// - Dealer play and settlement are separate steps (bjDealerPlay, then
//   bjSettle); the original did both inside bjResolve. The dealer-blackjack
//   peek is derived at settle time (dealer holds exactly 2 cards totaling 21)
//   instead of being threaded as a boolean.
// - Insurance is recorded as a synthetic BJResult with handIndex -1 so that
//   stakeHandScore() can account for it (win = 2:1 paid, lose = stake lost).
// - stakeHandScore() is new: the HTML game had no score-attack format.

export interface BJCard {
  rank: number; // 2..14 (11=J, 12=Q, 13=K, 14=A)
  suit: "S" | "H" | "D" | "C";
}

export interface BJHandState {
  cards: BJCard[];
  bet: number;
  doubled: boolean;
  stood: boolean; // true once the hand stops receiving cards (stand, 21, bust, double, split aces)
  isSplitAce: boolean; // split aces: one card dealt, hand finished immediately
  fromSplit: boolean; // 21 on a split hand is paid 1:1, never as a natural
}

export type BJPhase = "insurance" | "player" | "dealer" | "done";

export interface BJTableState {
  shoe: BJCard[];
  hands: BJHandState[];
  activeHand: number;
  dealer: BJCard[];
  dealerHoleHidden: boolean;
  insuranceOffered: boolean;
  insuranceBet: number; // insurance stake (bet/2); caller deducts it on 'insurance-yes'
  phase: BJPhase;
  result?: BJResult[];
}

export type BJOutcome =
  | "blackjack"
  | "win"
  | "lose"
  | "push"
  | "bust"
  | "surrender";

export interface BJResult {
  handIndex: number; // -1 = insurance entry (see bjSettle), otherwise index into hands
  outcome: BJOutcome;
  payout: number; // total lifesap credited for the entry INCLUDING returned stake
}

export type BJAction =
  | "hit"
  | "stand"
  | "double"
  | "split"
  | "insurance-yes"
  | "insurance-no";

// ---------------------------------------------------------------------------
// Shoe & RNG
// ---------------------------------------------------------------------------

/** Deterministic mulberry32 PRNG. Seed it per round for reproducible shoes. */
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

const BJ_SUITS: BJCard["suit"][] = ["S", "H", "D", "C"];

/** Fisher-Yates shuffled shoe of numDecks standard 52-card decks. */
export function createShoe(numDecks: number, rng: () => number): BJCard[] {
  if (!Number.isInteger(numDecks) || numDecks < 1) {
    throw new Error("createShoe: numDecks must be a positive integer");
  }
  const shoe: BJCard[] = [];
  for (let d = 0; d < numDecks; d++) {
    for (const suit of BJ_SUITS) {
      for (let rank = 2; rank <= 14; rank++) shoe.push({ rank, suit });
    }
  }
  for (let i = shoe.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = shoe[i];
    shoe[i] = shoe[j];
    shoe[j] = tmp;
  }
  return shoe;
}

// ---------------------------------------------------------------------------
// Hand math (ports blackjackTotal / isPair / bjHandLabel)
// ---------------------------------------------------------------------------

export interface BJHandTotal {
  total: number;
  soft: boolean;
  blackjack: boolean; // natural 21 on exactly 2 cards
}

/** Ace logic ported exactly from the original: aces count 11, demoted to 1 while bust. */
export function handTotal(cards: BJCard[]): BJHandTotal {
  let total = 0;
  let aces = 0;
  for (const c of cards) {
    total += c.rank === 14 ? 11 : Math.min(c.rank, 10);
    if (c.rank === 14) aces++;
  }
  let soft = aces > 0;
  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
    soft = aces > 0;
  }
  return { total, soft, blackjack: cards.length === 2 && total === 21 };
}

/** True for a two-card pair of equal rank (split candidate). */
export function isPair(cards: BJCard[]): boolean {
  return cards.length === 2 && cards[0].rank === cards[1].rank;
}

/** Short display label for a hand, e.g. "17 soft", "Bust · 24", "20". */
export function handLabel(cards: BJCard[]): string {
  const t = handTotal(cards);
  if (t.total > 21) return "Bust · " + t.total;
  return String(t.total) + (t.soft ? " soft" : "");
}

// ---------------------------------------------------------------------------
// Pure state-machine internals
// ---------------------------------------------------------------------------

function cloneCard(c: BJCard): BJCard {
  return { rank: c.rank, suit: c.suit };
}

function cloneTable(t: BJTableState): BJTableState {
  return {
    shoe: t.shoe.map(cloneCard),
    hands: t.hands.map((h) => ({
      cards: h.cards.map(cloneCard),
      bet: h.bet,
      doubled: h.doubled,
      stood: h.stood,
      isSplitAce: h.isSplitAce,
      fromSplit: h.fromSplit,
    })),
    activeHand: t.activeHand,
    dealer: t.dealer.map(cloneCard),
    dealerHoleHidden: t.dealerHoleHidden,
    insuranceOffered: t.insuranceOffered,
    insuranceBet: t.insuranceBet,
    phase: t.phase,
    result: t.result ? t.result.map((r) => ({ ...r })) : undefined,
  };
}

/** Draw the top card (end of array). Throws on an empty shoe. */
function drawCard(shoe: BJCard[]): BJCard {
  const c = shoe.pop();
  if (!c) throw new Error("BJ shoe exhausted mid-round: supply a fuller shoe");
  return c;
}

function isNatural(cards: BJCard[]): boolean {
  return handTotal(cards).blackjack;
}

/**
 * Done-ness is derived, not stored separately: during the 'player' phase a
 * hand is finished once its `stood` flag is set (stand, 21, bust, double,
 * split aces) or it sits before the active hand. The original's bjAdvance
 * maintained exactly this "everything up to the active hand is done" shape;
 * the flag covers the just-finished last hand, which no index shift marks.
 */
function handDone(t: BJTableState, i: number): boolean {
  if (t.phase === "done" || t.phase === "dealer") return true;
  if (t.phase !== "player") return false;
  const h = t.hands[i];
  return h.stood || i < t.activeHand;
}

/** Advance to the next unfinished hand, or move to the dealer phase. */
function advance(t: BJTableState): void {
  let next = -1;
  for (let i = t.activeHand + 1; i < t.hands.length; i++) {
    if (!handDone(t, i)) {
      next = i;
      break;
    }
  }
  if (next < 0) {
    for (let i = 0; i < t.hands.length; i++) {
      if (!handDone(t, i)) {
        next = i;
        break;
      }
    }
  }
  if (next >= 0) {
    t.activeHand = next;
  } else {
    t.phase = "dealer";
  }
}

// ---------------------------------------------------------------------------
// Deal & actions
// ---------------------------------------------------------------------------

const RESHUFFLE_THRESHOLD = 30; // original reshuffled below 30 cards / 75% penetration

/**
 * Deal a round: player, dealer, player, dealer. The caller's shoe is copied,
 * never mutated. If fewer than 30 cards remain, pass rng to reshuffle a fresh
 * 4-deck shoe (otherwise an error is thrown).
 *
 * Opening states mirror the original: dealer ace up -> 'insurance' phase;
 * dealer ten-value up with a natural -> 'dealer' phase (peek, no player
 * action); player natural -> 'dealer' phase; otherwise 'player'.
 */
export function dealBJ(shoe: BJCard[], bet: number, rng?: () => number): BJTableState {
  if (!Number.isFinite(bet) || bet <= 0) {
    throw new Error("dealBJ: bet must be a positive number");
  }
  let deck = shoe.map(cloneCard);
  if (deck.length < RESHUFFLE_THRESHOLD) {
    if (!rng) {
      throw new Error(
        "dealBJ: shoe has fewer than 30 cards and no rng was supplied to reshuffle"
      );
    }
    deck = createShoe(4, rng);
  }
  const player: BJCard[] = [drawCard(deck)];
  const dealer: BJCard[] = [drawCard(deck)];
  player.push(drawCard(deck));
  dealer.push(drawCard(deck));

  const up = dealer[0].rank;
  const playerNatural = isNatural(player);
  const dealerNatural = isNatural(dealer);

  let phase: BJPhase = "player";
  let insuranceOffered = false;
  if (up === 14) {
    phase = "insurance";
    insuranceOffered = true;
  } else if (up >= 10 && dealerNatural) {
    phase = "dealer"; // peek: dealer blackjack ends the round immediately
  } else if (playerNatural) {
    phase = "dealer";
  }

  return {
    shoe: deck,
    hands: [
      {
        cards: player,
        bet,
        doubled: false,
        stood: false,
        isSplitAce: false,
        fromSplit: false,
      },
    ],
    activeHand: 0,
    dealer,
    dealerHoleHidden: true,
    insuranceOffered,
    insuranceBet: 0,
    phase,
  };
}

/** Legal actions for the current state. Empty in 'dealer'/'done' phases. */
export function bjLegalActions(t: BJTableState): BJAction[] {
  if (t.phase === "insurance") return ["insurance-yes", "insurance-no"];
  if (t.phase !== "player") return [];
  const h = t.hands[t.activeHand];
  if (!h || handDone(t, t.activeHand)) return [];
  const actions: BJAction[] = ["hit", "stand"];
  if (h.cards.length === 2) {
    actions.push("double"); // original: double on any first two cards
    // One split per round, no resplit: a prior split means hands.length > 1.
    if (t.hands.length === 1 && isPair(h.cards)) actions.push("split");
  }
  return actions;
}

/**
 * Apply an action, returning the new table state. Throws on illegal actions.
 * Note: bankroll is the caller's concern — deduct the extra stake before
 * applying 'double'/'split' (equal to the hand's bet) and 'insurance-yes'
 * (half of the first hand's bet).
 */
export function bjApply(t: BJTableState, action: string): BJTableState {
  const legal = bjLegalActions(t);
  if (!legal.includes(action as BJAction)) {
    throw new Error(
      `Illegal blackjack action "${action}" in phase "${t.phase}"` +
        (legal.length ? ` (legal: ${legal.join(", ")})` : " (no legal actions)")
    );
  }
  const s = cloneTable(t);

  if (action === "insurance-yes" || action === "insurance-no") {
    s.insuranceOffered = false;
    s.insuranceBet = action === "insurance-yes" ? s.hands[0].bet / 2 : 0;
    const dealerBJ = isNatural(s.dealer);
    const playerNatural = isNatural(s.hands[0].cards);
    // Original: dealer blackjack resolves immediately; otherwise a player
    // natural also skips player actions.
    s.phase = dealerBJ || playerNatural ? "dealer" : "player";
    return s;
  }

  const h = s.hands[s.activeHand];
  if (!h || handDone(s, s.activeHand)) {
    throw new Error("Blackjack invariant broken: active hand is already done");
  }

  if (action === "hit") {
    h.cards.push(drawCard(s.shoe));
    if (handTotal(h.cards).total >= 21) {
      h.stood = true;
      advance(s);
    }
    return s;
  }
  if (action === "stand") {
    h.stood = true;
    advance(s);
    return s;
  }
  if (action === "double") {
    h.cards.push(drawCard(s.shoe));
    h.bet *= 2;
    h.doubled = true;
    h.stood = true;
    advance(s);
    return s;
  }
  // action === "split"
  const aces = h.cards[0].rank === 14;
  const mk = (card: BJCard): BJHandState => ({
    cards: [card, drawCard(s.shoe)],
    bet: h.bet,
    doubled: false,
    stood: aces, // split aces receive one card each and finish immediately
    isSplitAce: aces,
    fromSplit: true,
  });
  const h1 = mk(h.cards[0]);
  const h2 = mk(h.cards[1]);
  s.hands.splice(s.activeHand, 1, h1, h2);
  if (aces) s.phase = "dealer";
  // Non-ace split: activeHand still points at the first new hand.
  return s;
}

/**
 * Play the dealer's hand: stands on ALL 17s (soft 17 stands), draws below 17.
 * Skipped entirely when the dealer already has a natural or no player hand is
 * live — exactly the original bjResolve guard. Idempotent.
 */
export function bjDealerPlay(t: BJTableState): BJTableState {
  if (t.phase !== "dealer") {
    throw new Error(`bjDealerPlay requires phase "dealer", got "${t.phase}"`);
  }
  const s = cloneTable(t);
  s.dealerHoleHidden = false;
  const dealerNatural = s.dealer.length === 2 && handTotal(s.dealer).total === 21;
  const live = s.hands.some((h) => handTotal(h.cards).total <= 21);
  if (!dealerNatural && live) {
    while (handTotal(s.dealer).total < 17) {
      s.dealer.push(drawCard(s.shoe));
    }
  }
  return s;
}

/**
 * Settle the round. Payouts include the returned stake: push = bet,
 * win = bet*2, natural blackjack = bet*2.5 (3:2), bust/loss = 0.
 * Insurance (2:1) is appended as a synthetic result with handIndex -1:
 * win pays insuranceBet*3 (stake back + 2:1), loss pays 0.
 */
export function bjSettle(t: BJTableState): BJTableState {
  if (t.phase !== "dealer") {
    throw new Error(`bjSettle requires phase "dealer", got "${t.phase}"`);
  }
  const s = cloneTable(t);
  const dealer = handTotal(s.dealer);
  const dealerBlackjack = s.dealer.length === 2 && dealer.total === 21;
  const results: BJResult[] = s.hands.map((h, i) => {
    const p = handTotal(h.cards);
    const natural = !h.fromSplit && h.cards.length === 2 && p.total === 21;
    let outcome: BJOutcome;
    let payout: number;
    if (p.total > 21) {
      outcome = "bust";
      payout = 0;
    } else if (dealer.total > 21) {
      outcome = natural ? "blackjack" : "win";
      payout = natural ? h.bet * 2.5 : h.bet * 2;
    } else if (dealerBlackjack) {
      outcome = natural ? "push" : "lose";
      payout = natural ? h.bet : 0;
    } else if (natural) {
      outcome = "blackjack";
      payout = h.bet * 2.5;
    } else if (p.total > dealer.total) {
      outcome = "win";
      payout = h.bet * 2;
    } else if (p.total === dealer.total) {
      outcome = "push";
      payout = h.bet;
    } else {
      outcome = "lose";
      payout = 0;
    }
    return { handIndex: i, outcome, payout };
  });
  if (s.insuranceBet > 0) {
    results.push({
      handIndex: -1,
      outcome: dealerBlackjack ? "win" : "lose",
      payout: dealerBlackjack ? s.insuranceBet * 3 : 0,
    });
  }
  s.result = results;
  s.phase = "done";
  s.dealerHoleHidden = false;
  return s;
}

/**
 * Net chip delta in units of baseBet for the score-attack format: each hand
 * risks baseBet chips — win +1, blackjack +1.5, loss/bust -1, push 0,
 * surrender -0.5. Insurance entries (handIndex -1) adjust accordingly:
 * a won insurance nets +1 unit (2:1 on a half-bet stake), a lost one -0.5.
 */
export function stakeHandScore(results: BJResult[], baseBet: number): number {
  if (!Number.isFinite(baseBet) || baseBet <= 0) {
    throw new Error("stakeHandScore: baseBet must be a positive number");
  }
  let score = 0;
  for (const r of results) {
    if (r.handIndex === -1) {
      // Insurance: stake was baseBet/2. Win credits 3x stake (net +1 unit),
      // loss forfeits the stake (-0.5 units).
      score += r.outcome === "win" ? (r.payout - r.payout / 3) / baseBet : -0.5;
      continue;
    }
    switch (r.outcome) {
      case "blackjack":
        score += 1.5;
        break;
      case "win":
        score += 1;
        break;
      case "push":
        break;
      case "surrender":
        score -= 0.5;
        break;
      case "lose":
      case "bust":
        score -= 1;
        break;
    }
  }
  // Round away float dust (e.g. 2.5*bet arithmetic).
  return Math.round(score * 1e9) / 1e9;
}

// ---------------------------------------------------------------------------
// Self-tests (re-implements the HTML selfTests() blackjack assertions)
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

/** Throws on the first failure. Covers the HTML selfTests() blackjack assertions plus round-trip smoke tests. */
export function runCasinoSelfTests(): void {
  const assert = (x: boolean, m: string): void => {
    if (!x) throw new Error("Blackjack self-test failed: " + m);
  };
  const C = (s: string): BJCard => parseCard(s);

  /** Test shoes are rigged and tiny; pad with undrawn filler to clear the reshuffle threshold. */
  const padShoe = (tail: BJCard[]): BJCard[] => {
    const filler: BJCard[] = [];
    for (let i = 0; i < 30; i++) filler.push({ rank: 2, suit: "C" });
    return [...filler, ...tail];
  };

  // --- HTML selfTests() assertions, verbatim semantics ---
  const soft17 = handTotal([C("AS"), C("6H")]);
  assert(soft17.total === 17 && soft17.soft, "blackjack soft 17");
  assert(handTotal([C("AS"), C("AH"), C("9D")]).total === 21, "blackjack multiple aces");
  assert(
    handTotal([C("AS"), C("AH"), C("9D"), C("KC")]).total === 21,
    "blackjack hard ace conversion"
  );

  // --- Natural detection & pairs ---
  assert(handTotal([C("AS"), C("KD")]).blackjack, "ace+king is a natural");
  assert(!handTotal([C("AS"), C("KD"), C("2C")]).blackjack, "21 on 3 cards is not a natural");
  assert(isPair([C("8S"), C("8H")]), "equal ranks are a pair");
  assert(!isPair([C("8S"), C("9H")]), "unequal ranks are not a pair");
  assert(handLabel([C("AS"), C("6H")]) === "17 soft", "soft label");
  assert(handLabel([C("KS"), C("QD"), C("9H")]) === "Bust · 29", "bust label");

  // --- Shoe determinism ---
  const a = createShoe(4, makeRng(1234));
  const b = createShoe(4, makeRng(1234));
  assert(a.length === 208 && b.length === 208, "4-deck shoe has 208 cards");
  assert(
    a.every((c, i) => c.rank === b[i].rank && c.suit === b[i].suit),
    "same seed shuffles identically"
  );

  // --- Round trip: player natural vs dealer bust pays 3:2 ---
  // Deal order pops from the end: p1, d1, p2, d2, then dealer draws.
  const shoe1: BJCard[] = [C("TS"), C("7D"), C("KS"), C("9C"), C("AS")];
  let t = dealBJ(padShoe(shoe1), 100);
  assert(t.phase === "dealer", "player natural skips player actions");
  t = bjDealerPlay(t);
  assert(handTotal(t.dealer).total > 21, "dealer drew to a bust");
  t = bjSettle(t);
  assert(t.phase === "done" && t.result !== undefined, "round settles");
  const res1: BJResult[] = t.result ?? [];
  assert(
    res1[0].outcome === "blackjack" && res1[0].payout === 250,
    "natural pays 3:2 (bet*2.5)"
  );
  assert(stakeHandScore(res1, 100) === 1.5, "score-attack: blackjack = +1.5");

  // --- Dealer stands on soft 17; player 20 wins ---
  const shoe2: BJCard[] = [C("AD"), C("QS"), C("6H"), C("KC")];
  let u = dealBJ(padShoe(shoe2), 100);
  assert(u.phase === "player", "no naturals, no ace up: player acts");
  const legal2 = bjLegalActions(u);
  assert(
    legal2.includes("hit") &&
      legal2.includes("stand") &&
      legal2.includes("double") &&
      !legal2.includes("split"),
    "KQ vs 6: hit/stand/double legal, split not"
  );
  u = bjApply(u, "stand");
  assert(u.phase === "dealer", "stand advances to dealer play");
  u = bjDealerPlay(u);
  assert(u.dealer.length === 2, "dealer stands on soft 17 (no draw)");
  u = bjSettle(u);
  const res2: BJResult[] = u.result ?? [];
  assert(res2[0].outcome === "win", "20 beats soft 17");
  assert(res2[0].payout === 200, "win returns bet*2");
  assert(stakeHandScore(res2, 100) === 1, "score-attack: win = +1");

  // --- Split 8s, both hands win vs dealer bust ---
  const shoe3: BJCard[] = [C("TH"), C("4D"), C("5C"), C("9D"), C("8H"), C("6C"), C("8S")];
  let v = dealBJ(padShoe(shoe3), 100);
  assert(bjLegalActions(v).includes("split"), "pair of 8s can split");
  v = bjApply(v, "split");
  assert(v.hands.length === 2 && v.phase === "player", "split creates two hands");
  assert(v.hands[0].fromSplit && v.hands[1].fromSplit, "split hands flagged");
  v = bjApply(v, "stand");
  assert(v.activeHand === 1, "advance moves to second split hand");
  v = bjApply(v, "stand");
  assert(v.phase === "dealer", "both hands stood: dealer plays");
  v = bjDealerPlay(v);
  v = bjSettle(v);
  const res3: BJResult[] = v.result ?? [];
  assert(
    res3.length === 2 && res3.every((r) => r.outcome === "win"),
    "both split hands win vs dealer bust"
  );
  assert(stakeHandScore(res3, 100) === 2, "score-attack: two wins = +2");

  // --- Insurance: dealer blackjack, insurance pays 2:1, hand pushes ---
  // Player: A,K natural. Dealer: A up, K hole. Player takes insurance.
  const shoe4: BJCard[] = [C("KH"), C("KS"), C("AD"), C("AS")];
  let w = dealBJ(padShoe(shoe4), 100);
  assert(
    w.phase === "insurance" && bjLegalActions(w).includes("insurance-yes"),
    "ace up offers insurance"
  );
  w = bjApply(w, "insurance-yes");
  assert(w.insuranceBet === 50, "insurance stake is half the bet");
  assert(w.phase === "dealer", "dealer blackjack resolves after insurance");
  w = bjDealerPlay(w);
  assert(w.dealer.length === 2, "dealer does not draw into a natural");
  w = bjSettle(w);
  assert(w.result !== undefined, "insurance round settles");
  const res4: BJResult[] = w.result ?? [];
  const ins = res4.find((r) => r.handIndex === -1);
  assert(ins !== undefined && ins.outcome === "win" && ins.payout === 150, "insurance pays 2:1 (3x stake)");
  assert(res4[0].outcome === "push" && res4[0].payout === 100, "natural vs dealer BJ pushes");
  assert(stakeHandScore(res4, 100) === 1, "score-attack: push + won insurance = +1");

  // --- Insurance declined, no dealer blackjack: insurance loses nothing extra ---
  // Player K,Q = 20. Dealer ace up, 9 hole = 20. Decline -> stand -> push.
  const shoe5: BJCard[] = [C("9C"), C("QD"), C("AH"), C("KS")];
  let x = dealBJ(padShoe(shoe5), 100);
  assert(x.phase === "insurance", "ace up offers insurance");
  x = bjApply(x, "insurance-no");
  assert(x.phase === "player" && x.insuranceBet === 0, "declined: play continues");
  x = bjApply(x, "stand"); // player 20
  x = bjDealerPlay(x); // dealer A+9 = 20
  x = bjSettle(x);
  assert(
    x.result !== undefined &&
      x.result[0].outcome === "push" &&
      x.result.every((r) => r.handIndex !== -1),
    "declined insurance leaves no insurance entry; 20 vs 20 pushes"
  );

  // --- Illegal actions throw ---
  let threw = false;
  try {
    bjApply(x, "hit"); // phase is 'done'
  } catch {
    threw = true;
  }
  assert(threw, "action in done phase throws");
  threw = false;
  try {
    // Player 20 vs dealer 6: still the player's turn, so dealer play is illegal.
    bjDealerPlay(dealBJ(padShoe([C("AD"), C("QS"), C("6H"), C("KC")].reverse()), 100));
  } catch {
    threw = true;
  }
  assert(threw, "bjDealerPlay before player actions throws");

  // --- stakeHandScore unit table ---
  const unit = (o: BJOutcome, payout: number): number =>
    stakeHandScore([{ handIndex: 0, outcome: o, payout }], 100);
  assert(unit("blackjack", 250) === 1.5, "score blackjack");
  assert(unit("win", 200) === 1, "score win");
  assert(unit("push", 100) === 0, "score push");
  assert(unit("lose", 0) === -1, "score lose");
  assert(unit("bust", 0) === -1, "score bust");
  assert(unit("surrender", 50) === -0.5, "score surrender");
  assert(
    stakeHandScore([{ handIndex: -1, outcome: "lose", payout: 0 }], 100) === -0.5,
    "score lost insurance"
  );
}
