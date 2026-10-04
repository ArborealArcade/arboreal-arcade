// AI table talk for the snake-poker arcade games, ported from the
// self-contained snake-poker HTML game (TALK / BJ_TALK / VP_TALK line banks).
// Lines are verbatim from the original; the original's win/loss/fold/allin/idle
// events are remapped onto the shared TalkEvent vocabulary below.

export type TalkEvent =
  | "game-start"
  | "player-win"
  | "player-lose"
  | "ai-win"
  | "big-pot"
  | "bluff"
  | "bad-beat"
  | "idle"
  | "blackjack"
  | "bust"
  | "royal";

export interface PersonaVoice {
  name: string;
  quips: Partial<Record<TalkEvent, string[]>>;
}

const ROYAL_LINE = "ROYAL FLUSH! Every scale in the canopy is shining!";

export const PERSONA_VOICE: PersonaVoice[] = [
  {
    name: "Mara the Breeder",
    quips: {
      "game-start": ["Good keeping starts with good notes.", "Slow hands. Sharp eyes."],
      "player-win": ["That one stings. Back to the records.", "A rough shed. I will recover."],
      "player-lose": ["Healthy lines, healthy pot. That is how a clutch grows.", "Patience pays better than panic."],
      "ai-win": ["Healthy lines, healthy pot. That is how a clutch grows.", "Patience pays better than panic."],
      "big-pot": ["Healthy lines, healthy pot. That is how a clutch grows.", "Patience pays better than panic."],
      bluff: ["The whole clutch goes forward.", "Every last scale. I am in."],
      "bad-beat": ["That one stings. Back to the records.", "A rough shed. I will recover."],
      idle: ["Good keeping starts with good notes.", "Slow hands. Sharp eyes."],
      blackjack: ["Healthy lines, healthy pot. That is how a clutch grows.", "Patience pays better than panic."],
      bust: ["That one stings. Back to the records.", "A rough shed. I will recover."],
      royal: [ROYAL_LINE],
    },
  },
  {
    name: "Slink the Poacher",
    quips: {
      "game-start": ["The quietest coil gets the cleanest strike.", "I never sit where the light can find me."],
      "player-win": ["Hiss. You saw through that one.", "Keep one eye on your stack."],
      "player-lose": ["Too slow. I was under the leaf litter already.", "The pot vanished. Funny how that happens."],
      "ai-win": ["Too slow. I was under the leaf litter already.", "The pot vanished. Funny how that happens."],
      "big-pot": ["Too slow. I was under the leaf litter already.", "The pot vanished. Funny how that happens."],
      bluff: ["No trail back now. All-in.", "Every chip slips into the dark."],
      "bad-beat": ["Hiss. You saw through that one.", "Keep one eye on your stack."],
      idle: ["The quietest coil gets the cleanest strike.", "I never sit where the light can find me."],
      blackjack: ["Too slow. I was under the leaf litter already.", "The pot vanished. Funny how that happens."],
      bust: ["Hiss. You saw through that one.", "Keep one eye on your stack."],
      royal: [ROYAL_LINE],
    },
  },
  {
    name: "Old Bark",
    quips: {
      "game-start": [
        "Welcome, keeper. Set your stake and mind the old branches.",
        "Listen to the table before you move.",
        "A long life teaches a short pause.",
      ],
      "player-win": ["Even old bark loses a strip now and then.", "A costly lesson, but the canopy endures."],
      "player-lose": ["Old roots run deep.", "The tree remembers patient play."],
      "ai-win": ["Old roots run deep.", "The tree remembers patient play."],
      "big-pot": ["Old roots run deep.", "The tree remembers patient play."],
      bluff: ["The old tree stands on every chip.", "Roots down. All-in."],
      "bad-beat": ["Even old bark loses a strip now and then.", "A costly lesson, but the canopy endures."],
      idle: ["Listen to the table before you move.", "A long life teaches a short pause."],
      blackjack: ["Blackjack. Clean as a fresh shed—paid three to two."],
      bust: ["Too much weight on that limb. You have gone over."],
      royal: [ROYAL_LINE],
    },
  },
  {
    name: "Vesper",
    quips: {
      "game-start": ["Every tell casts a shadow.", "I have been watching the gaps."],
      "player-win": ["A shadow crossed my read.", "Interesting. I will remember that line."],
      "player-lose": ["I watched the pattern close around you.", "The night showed me the river."],
      "ai-win": ["I watched the pattern close around you.", "The night showed me the river."],
      "big-pot": ["I watched the pattern close around you.", "The night showed me the river."],
      bluff: ["No half-measures after dusk.", "The canopy goes dark. All-in."],
      "bad-beat": ["A shadow crossed my read.", "Interesting. I will remember that line."],
      idle: ["Every tell casts a shadow.", "I have been watching the gaps."],
      blackjack: ["I watched the pattern close around you.", "The night showed me the river."],
      bust: ["A shadow crossed my read.", "Interesting. I will remember that line."],
      royal: [ROYAL_LINE],
    },
  },
  {
    name: "Pip the Hatchling",
    quips: {
      "game-start": ["Do pairs count if they are both shiny?", "I have a very good feeling. Probably."],
      "player-win": ["Oof. I shed that pot too early.", "Next hand. Hatchlings bounce back."],
      "player-lose": ["Did I win? I won! My first huge coil!", "Look at that stack grow!"],
      "ai-win": ["Did I win? I won! My first huge coil!", "Look at that stack grow!"],
      "big-pot": ["Did I win? I won! My first huge coil!", "Look at that stack grow!"],
      bluff: ["All my tiny chips!", "Big hatchling move—ALL-IN!"],
      "bad-beat": ["Oof. I shed that pot too early.", "Next hand. Hatchlings bounce back."],
      idle: ["Do pairs count if they are both shiny?", "I have a very good feeling. Probably."],
      blackjack: ["Did I win? I won! My first huge coil!", "Look at that stack grow!"],
      bust: ["Oof. I shed that pot too early.", "Next hand. Hatchlings bounce back."],
      royal: [ROYAL_LINE],
    },
  },
];

const NAME_ALIASES: Record<string, number> = {
  mara: 0,
  slink: 1,
  bark: 2,
  "old bark": 2,
  vesper: 3,
  pip: 4,
};

/**
 * Pick a random table-talk line for a persona on an event.
 * Matches full display names ("Mara the Breeder") and short ids ("mara").
 * Returns null when the persona or event has no lines.
 */
export function pickTalk(name: string, event: TalkEvent): string | null {
  const key = name.trim().toLowerCase();
  const persona =
    PERSONA_VOICE.find((p) => p.name.toLowerCase() === key) ??
    (key in NAME_ALIASES ? PERSONA_VOICE[NAME_ALIASES[key]] : undefined);
  if (!persona) return null;
  const lines = persona.quips[event];
  if (!lines || lines.length === 0) return null;
  return lines[Math.floor(Math.random() * lines.length)];
}
