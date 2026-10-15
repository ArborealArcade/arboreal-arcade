/**
 * Weekend Expo data: vendors, haggle personalities, expo-exclusive animals,
 * auction lots, and rumor mill lines.
 *
 * The expo hall is a walkable 2D space inside Arboreal Keeper. Vendors are
 * data-driven so new booths can be added without touching the renderer.
 */

export type HagglePersonality =
  | "hardballer" // starts high, respects firm counters
  | "softie" // caves easily, just be kind
  | "storyteller" // discount for listening to the animal's story
  | "shuffler" // chaotic random discounts
  | "purist"; // no haggling on principle, fair prices

export type ExpoAnimal = {
  id: string;
  name: string;
  species: string;
  locality: string;
  morph: string;
  sex: "male" | "female";
  lifeStage: "neonate" | "subadult" | "adult";
  price: number;
  exclusive?: boolean; // expo-exclusive: not available in the regular store
  story?: string; // storyteller vendors tell this before discounting
  blurb: string;
};

export type ExpoVendor = {
  id: string;
  name: string;
  tagline: string;
  personality: HagglePersonality;
  boothColor: string; // booth accent color for the hall renderer
  greeting: string;
  haggleHint: string; // hint shown to the player about how to deal with them
  inventory: ExpoAnimal[];
};

export type AuctionLot = {
  id: string;
  animal: ExpoAnimal;
  startingBid: number;
  durationSec: number;
};

export const HAGGLE_PERSONALITY_INFO: Record<
  HagglePersonality,
  { label: string; hint: string }
> = {
  hardballer: {
    label: "Hardballer",
    hint: "Starts high. Counter firm and fast — dawdling reads as weakness.",
  },
  softie: {
    label: "Softie",
    hint: "Melts if you're kind. A compliment goes further than a lowball.",
  },
  storyteller: {
    label: "Storyteller",
    hint: "Ask about the animal's story first. Listeners get the real price.",
  },
  shuffler: {
    label: "Shuffler",
    hint: "Chaotic. Offers swing wildly — catch a good one when it lands.",
  },
  purist: {
    label: "Purist",
    hint: "Does not haggle. Prices are fair; take it or leave it.",
  },
};

const aid = (v: string, n: number) => `${v}-${n}`;

export const EXPO_VENDORS: ExpoVendor[] = [
  {
    id: "marvs-morphs",
    name: "Marv's Morphs",
    tagline: "Rare localities, serious keepers only",
    personality: "hardballer",
    boothColor: "#b91c1c",
    greeting:
      "You look like you know what a Biak is worth. Don't waste my time and I won't waste yours.",
    haggleHint: HAGGLE_PERSONALITY_INFO.hardballer.hint,
    inventory: [
      {
        id: aid("marv", 1),
        name: "High-Blue Biak",
        species: "Green Tree Python",
        locality: "Biak",
        morph: "High-blue",
        sex: "female",
        lifeStage: "subadult",
        price: 2400,
        exclusive: true,
        blurb: "Insane blue speckling coming in. Biak animals this clean don't sit long.",
      },
      {
        id: aid("marv", 2),
        name: "Numfor Neonate Pair",
        species: "Green Tree Python",
        locality: "Numfor",
        morph: "Wild type",
        sex: "male",
        lifeStage: "neonate",
        price: 1600,
        blurb: " unrelated pair, both feeding on their own. Priced to move as a pair.",
      },
      {
        id: aid("marv", 3),
        name: "Calico Project Male",
        species: "Green Tree Python",
        locality: "Designer",
        morph: "Calico",
        sex: "male",
        lifeStage: "adult",
        price: 5200,
        exclusive: true,
        blurb: "Proven calico producer. This is the animal that pays for the rack.",
      },
    ],
  },
  {
    id: "sunny-scales",
    name: "Sunny Scales",
    tagline: "Family tables, friendly prices",
    personality: "softie",
    boothColor: "#f59e0b",
    greeting:
      "Oh hi, honey! Come look at my babies — every one of them is eating and sweet as pie.",
    haggleHint: HAGGLE_PERSONALITY_INFO.softie.hint,
    inventory: [
      {
        id: aid("sunny", 1),
        name: "Sorong Yearling",
        species: "Green Tree Python",
        locality: "Sorong",
        morph: "Wild type",
        sex: "female",
        lifeStage: "subadult",
        price: 950,
        blurb: "Big sweet girl, handles like a dream. My grandkids named her Noodle.",
      },
      {
        id: aid("sunny", 2),
        name: "Jayapura Neonate",
        species: "Green Tree Python",
        locality: "Jayapura",
        morph: "Wild type",
        sex: "male",
        lifeStage: "neonate",
        price: 700,
        blurb: "Bright red baby, just shed. Eating fuzzy mice like a champ.",
      },
    ],
  },
  {
    id: "old-petes",
    name: "Old Pete's Pythons",
    tagline: "Forty years in the canopy",
    personality: "storyteller",
    boothColor: "#7c3aed",
    greeting:
      "Sit a spell, kid. Every snake here has a story, and the story's part of the price.",
    haggleHint: HAGGLE_PERSONALITY_INFO.storyteller.hint,
    inventory: [
      {
        id: aid("pete", 1),
        name: "Arfak Line Female",
        species: "Green Tree Python",
        locality: "Arfak",
        morph: "Wild type",
        sex: "female",
        lifeStage: "adult",
        price: 1800,
        exclusive: true,
        story:
          "Her grandmother came in on a boat in '98, back when you could still do that. Three generations of my line, never a bad feeder among them.",
        blurb: "Third-generation Arfak line, proven feeder line.",
      },
      {
        id: aid("pete", 2),
        name: "Wamena Male",
        species: "Green Tree Python",
        locality: "Wamena",
        morph: "Wild type",
        sex: "male",
        lifeStage: "adult",
        price: 1400,
        story:
          "Caught my first Wamena the year my daughter was born. This boy's got her temperament — calm, curious, never misses a meal.",
        blurb: "Calm proven male from Pete's original Wamena line.",
      },
    ],
  },
  {
    id: "chaos-constrictors",
    name: "Chaos Constrictors",
    tagline: "Prices? We don't do prices.",
    personality: "shuffler",
    boothColor: "#06b6d4",
    greeting:
      "WELCOME TO THE CHAOS TABLE! Prices are vibes-based! Spin the wheel! Make an offer! Let's GOOO!",
    haggleHint: HAGGLE_PERSONALITY_INFO.shuffler.hint,
    inventory: [
      {
        id: aid("chaos", 1),
        name: "Mystery Neonate",
        species: "Green Tree Python",
        locality: "Unknown",
        morph: "???",
        sex: "female",
        lifeStage: "neonate",
        price: 500,
        exclusive: true,
        blurb: "Locality unknown, morph unknown, attitude: spicy. Could be anything. That's the fun.",
      },
      {
        id: aid("chaos", 2),
        name: "Lereh Subadult",
        species: "Green Tree Python",
        locality: "Lereh",
        morph: "Wild type",
        sex: "male",
        lifeStage: "subadult",
        price: 1100,
        blurb: "Solid Lereh male. Price may change while you read this. It won't. Unless it does.",
      },
    ],
  },
  {
    id: "pureline",
    name: "Pureline Reptiles",
    tagline: "Documented. Tested. Priced fairly.",
    personality: "purist",
    boothColor: "#10b981",
    greeting:
      "Welcome. Every animal is locality-documented and vet-checked. Prices are as marked — they're fair, so I don't negotiate them.",
    haggleHint: HAGGLE_PERSONALITY_INFO.purist.hint,
    inventory: [
      {
        id: aid("pure", 1),
        name: "Cyclops Utaraensis",
        species: "Green Tree Python",
        locality: "Cyclops",
        morph: "Wild type",
        sex: "female",
        lifeStage: "subadult",
        price: 2100,
        exclusive: true,
        blurb: "Papered Cyclops utaraensis with full lineage docs. The real thing.",
      },
      {
        id: aid("pure", 2),
        name: "Manokwari Pair",
        species: "Green Tree Python",
        locality: "Manokwari",
        morph: "Wild type",
        sex: "female",
        lifeStage: "adult",
        price: 2900,
        blurb: "Proven Manokwari pair, unrelated. Breeding records included.",
      },
    ],
  },
  {
    id: "white-wizard-serpents",
    name: "White Wizard Serpents",
    tagline: "Magic in every morph",
    personality: "storyteller",
    boothColor: "#1e3a8a",
    greeting:
      "Ah, a fellow traveler! Come, come — every serpent here has a tale, and I do love telling them.",
    haggleHint: HAGGLE_PERSONALITY_INFO.storyteller.hint,
    inventory: [
      {
        id: aid("wws", 1),
        name: "Wizard's Choice Biak",
        species: "Green Tree Python",
        locality: "Biak",
        morph: "Blue-line",
        sex: "male",
        lifeStage: "subadult",
        price: 2600,
        exclusive: true,
        story:
          "This boy came from a clutch I raised under a full moon — I swear the blue came in stronger for it. My wife says I'm superstitious. My snakes say otherwise.",
        blurb: "Stunning blue-line Biak from the Wizard's personal holdback line.",
      },
      {
        id: aid("wws", 2),
        name: "Apprentice's First Chondro",
        species: "Green Tree Python",
        locality: "Sorong",
        morph: "Wild type",
        sex: "female",
        lifeStage: "neonate",
        price: 800,
        story:
          "I always keep a few affordable babies for folks just starting out. The hobby gave me everything — this is how I give back.",
        blurb: "Sweet Sorong neonate, perfect first green tree.",
      },
    ],
  },
];

export const EXPO_AUCTION_LOTS: AuctionLot[] = [
  {
    id: "auction-1",
    animal: {
      id: "auction-1-animal",
      name: "Aru Island Show Female",
      species: "Green Tree Python",
      locality: "Aru",
      morph: "High-yellow",
      sex: "female",
      lifeStage: "adult",
      price: 6000,
      exclusive: true,
      blurb: "The centerpiece lot. Aru high-yellow female, show quality.",
    },
    startingBid: 3000,
    durationSec: 120,
  },
  {
    id: "auction-2",
    animal: {
      id: "auction-2-animal",
      name: "Merauke Neonate",
      species: "Green Tree Python",
      locality: "Merauke",
      morph: "Wild type",
      sex: "male",
      lifeStage: "neonate",
      price: 1200,
      blurb: "Bright yellow Merauke baby. Bidding starts low — don't blink.",
    },
    startingBid: 400,
    durationSec: 90,
  },
];

export const RUMOR_MILL_LINES: string[] = [
  "Psst — Marv's got a high-blue Biak that isn't even on the table yet. Ask him about the back stock.",
  "Sunny's grandkids named every snake. If you buy Noodle, you have to keep the name. Them's the rules.",
  "Old Pete's Arfak line goes back to '98. Three generations, never a bad feeder. That's not a sales pitch, that's a fact.",
  "The chaos table? Last expo someone walked away with a calico for five hundred bucks. Someone else paid eleven hundred for a normal. Vibes-based pricing, I'm telling you.",
  "Pureline doesn't haggle, but their paperwork is worth the premium. You ever tried to prove a locality without docs? Nightmare.",
  "Auction's got an Aru show female as the centerpiece. Set an alarm — those lots go fast.",
  "Rumor is there's a secret vendor who only shows up Sunday afternoon. Bring cash.",
  "Word is the arcade cabinet in the corner pays out in expo tokens if you beat the high score. Nobody's done it yet.",
];

export const EXPO_FLASH_DEALS: Array<{ vendorId: string; discountPct: number; blurb: string }> = [
  {
    vendorId: "sunny-scales",
    discountPct: 20,
    blurb: "Sunny's Sunday Special: 20% off everything before noon!",
  },
  {
    vendorId: "chaos-constrictors",
    discountPct: 35,
    blurb: "CHAOS HOUR: 35% off the chaos table for the next 30 minutes!",
  },
];

/** Weekend check: expos run Saturday and Sunday (local time). */
export function isExpoWeekend(now: Date = new Date()): boolean {
  const day = now.getDay();
  return day === 0 || day === 6;
}

/** Expo-exclusive animals across all vendors (for the "exclusives" filter). */
export function expoExclusives(): ExpoAnimal[] {
  return EXPO_VENDORS.flatMap((v) => v.inventory).filter((a) => a.exclusive);
}
