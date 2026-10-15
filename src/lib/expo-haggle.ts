/**
 * Haggle minigame logic for the Weekend Expo.
 *
 * Each vendor personality haggles differently. The player makes offers;
 * the vendor responds based on personality, offer generosity, and a little
 * randomness. Three failed rounds and the vendor walks (soft-lockout).
 */

import type { ExpoAnimal, HagglePersonality } from "./expo-data";

export type HaggleState = {
  animal: ExpoAnimal;
  personality: HagglePersonality;
  askPrice: number; // current vendor ask
  rounds: number; // offers made so far
  maxRounds: number;
  heardStory: boolean; // storyteller: player listened
  complimented: boolean; // softie: player was kind
  done: boolean; // deal struck or vendor walked
  walkedAway: boolean;
  finalPrice: number | null; // agreed price if deal struck
  log: Array<{ from: "you" | "vendor"; text: string }>;
};

export function startHaggle(animal: ExpoAnimal, personality: HagglePersonality): HaggleState {
  const ask = animal.price;
  return {
    animal,
    personality,
    askPrice: ask,
    rounds: 0,
    maxRounds: 3,
    heardStory: false,
    complimented: false,
    done: false,
    walkedAway: false,
    finalPrice: null,
    log: [
      {
        from: "vendor",
        text:
          personality === "purist"
            ? `The price is ${fmt(ask)}. It's fair — I don't negotiate.`
            : `I can do ${fmt(ask)} for ${animal.name}. What do you say?`,
      },
    ],
  };
}

function fmt(n: number): string {
  return "$" + Math.round(n).toLocaleString();
}

function push(state: HaggleState, from: "you" | "vendor", text: string): void {
  state.log.push({ from, text });
}

/** Player listens to the storyteller's story: unlocks the real price. */
export function haggleHearStory(state: HaggleState): HaggleState {
  if (state.personality !== "storyteller" || state.heardStory || state.done) return state;
  const next: HaggleState = { ...state, heardStory: true, log: [...state.log] };
  const story = next.animal.story ?? "Every snake has a story, kid.";
  push(next, "vendor", story);
  const realPrice = Math.round(next.animal.price * 0.8);
  push(next, "vendor", `...and because you listened, the real price is ${fmt(realPrice)}. Take it?`);
  next.askPrice = realPrice;
  return next;
}

/** Player compliments the softie: softens them up for a better deal. */
export function haggleCompliment(state: HaggleState): HaggleState {
  if (state.personality !== "softie" || state.complimented || state.done) return state;
  const next: HaggleState = { ...state, complimented: true, log: [...state.log] };
  push(next, "you", "Your animals are beautiful — you clearly love them.");
  push(next, "vendor", "Oh, stop it! ...Okay, for you, honey, I'll knock a little off.");
  next.askPrice = Math.round(next.askPrice * 0.88);
  return next;
}

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

/**
 * Player makes an offer. Returns the updated state.
 * Purists instantly refuse; everyone else reacts by personality.
 */
export function haggleOffer(prev: HaggleState, offer: number): HaggleState {
  if (prev.done) return prev;
  const state: HaggleState = { ...prev, log: [...prev.log], rounds: prev.rounds + 1 };
  push(state, "you", `How about ${fmt(offer)}?`);

  const p = state.personality;
  const ask = state.askPrice;

  if (p === "purist") {
    push(state, "vendor", `I appreciate the interest, but the price is ${fmt(ask)}. Firm.`);
    state.done = true;
    state.walkedAway = false;
    state.finalPrice = null;
    return state;
  }

  // Offer at or above ask: deal.
  if (offer >= ask) {
    push(state, "vendor", personalityAcceptLine(p));
    state.done = true;
    state.finalPrice = ask;
    return state;
  }

  const ratio = offer / ask; // how generous the offer is

  if (p === "hardballer") {
    if (ratio >= 0.92) {
      // Firm, fast counter: respects strength.
      const counter = Math.round((offer + ask) / 2);
      push(state, "vendor", `Close. ${fmt(counter)} and we shake on it.`);
      state.askPrice = counter;
    } else if (ratio >= 0.8) {
      const counter = Math.round(ask * rand(0.94, 0.98));
      push(state, "vendor", `You're testing me. ${fmt(counter)} — that's my line.`);
      state.askPrice = counter;
    } else {
      push(state, "vendor", "Don't insult the animal. Come back when you're serious.");
      state.done = true;
      state.walkedAway = true;
      return state;
    }
  } else if (p === "softie") {
    const kindness = state.complimented ? 0.06 : 0;
    if (ratio >= 0.75 - kindness) {
      const counter = Math.round(ask * rand(0.82, 0.9));
      push(state, "vendor", `Oh... alright, honey. I could do ${fmt(counter)}?`);
      state.askPrice = counter;
    } else {
      push(state, "vendor", "Oh gosh, that's... that's really low, sweetie. I couldn't.");
      // softies don't walk; they just hold
    }
  } else if (p === "storyteller") {
    if (!state.heardStory) {
      push(state, "vendor", "Before we talk numbers — have you heard this one's story? Listen first.");
    } else if (ratio >= 0.9) {
      push(state, "vendor", personalityAcceptLine(p));
      state.done = true;
      state.finalPrice = ask;
      return state;
    } else {
      const counter = Math.round(ask * rand(0.92, 0.97));
      push(state, "vendor", `For someone who listened? ${fmt(counter)}.`);
      state.askPrice = counter;
    }
  } else if (p === "shuffler") {
    // Chaos: wild swings.
    const roll = Math.random();
    if (roll < 0.3) {
      const deal = Math.round(offer * rand(0.95, 1.05));
      push(state, "vendor", `DEAL! ${fmt(deal)}! The wheel has spoken!`);
      state.done = true;
      state.finalPrice = deal;
      return state;
    } else if (roll < 0.65) {
      const counter = Math.round(ask * rand(0.7, 1.1));
      push(state, "vendor", `Counter-vibes say... ${fmt(counter)}!`);
      state.askPrice = counter;
    } else {
      push(state, "vendor", "Hmm, the vibes are off. Throw another number at me!");
    }
  }

  if (state.rounds >= state.maxRounds && !state.done) {
    push(state, "vendor", "Alright, I need to help other customers. Final answer time.");
    state.done = true;
    state.walkedAway = true;
  }
  return state;
}

/** Player accepts the current ask. */
export function haggleAccept(prev: HaggleState): HaggleState {
  if (prev.done) return prev;
  const state: HaggleState = { ...prev, log: [...prev.log] };
  push(state, "you", "Deal.");
  push(state, "vendor", personalityAcceptLine(state.personality));
  state.done = true;
  state.finalPrice = state.askPrice;
  return state;
}

function personalityAcceptLine(p: HagglePersonality): string {
  switch (p) {
    case "hardballer":
      return "Done. Firm handshake. Good doing business.";
    case "softie":
      return "Oh wonderful! She's going to a good home, I can tell!";
    case "storyteller":
      return "Take good care of her, kid. You've got a good one.";
    case "shuffler":
      return "SOLD! To the legend! What a rush!";
    case "purist":
      return "Excellent choice. Paperwork's in the bag.";
  }
}
