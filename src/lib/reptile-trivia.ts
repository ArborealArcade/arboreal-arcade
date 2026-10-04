/* ------------------------------------------------------------------ */
/* Reptile Trivia — question bank + round logic                        */
/* ------------------------------------------------------------------ */

export type TriviaCategory =
  | "Green Tree Pythons"
  | "Emerald Tree Boas"
  | "Tree Monitors"
  | "Boiga & Cat Snakes"
  | "Arboreal Vipers"
  | "Arboreal Geckos"
  | "Snake Biology"
  | "Husbandry"
  | "Arboreal Planet";

export type TriviaDifficulty = 1 | 2 | 3 | 4 | 5 | 6;

export type TriviaMode =
  | "very-easy"
  | "easy"
  | "normal"
  | "hard"
  | "very-hard"
  | "expert";

export interface TriviaModeDef {
  id: TriviaMode;
  label: string;
  difficulty: TriviaDifficulty;
  blurb: string;
}

export const TRIVIA_MODES: TriviaModeDef[] = [
  { id: "very-easy", label: "Very Easy", difficulty: 1, blurb: "Canopy basics. Warm up those brain cells." },
  { id: "easy", label: "Easy", difficulty: 2, blurb: "Casual keeper knowledge." },
  { id: "normal", label: "Normal", difficulty: 3, blurb: "A solid all-around test." },
  { id: "hard", label: "Hard", difficulty: 4, blurb: "For keepers who read the care sheets twice." },
  { id: "very-hard", label: "Very Hard", difficulty: 5, blurb: "Localities and Latin names. Good luck." },
  { id: "expert", label: "Expert", difficulty: 6, blurb: "Taxonomy deep cuts. Hank himself would sweat." },
];

export function modeDef(mode: TriviaMode): TriviaModeDef {
  return TRIVIA_MODES.find((m) => m.id === mode) ?? TRIVIA_MODES[2];
}

export interface TriviaQuestion {
  id: string;
  category: TriviaCategory;
  difficulty: TriviaDifficulty;
  question: string;
  options: [string, string, string, string];
  /** Index of the correct option. */
  answer: number;
  explanation: string;
}

export const QUESTIONS_PER_ROUND = 10;
export const QUESTION_SECONDS = 15;
export const TRIVIA_BEST_KEY = "arboreal_reptile_trivia_best";

export const TRIVIA_QUESTIONS: TriviaQuestion[] = [
  /* ------------------------- Green Tree Pythons ------------------------- */
  {
    id: "gtp-01",
    category: "Green Tree Pythons",
    difficulty: 1,
    question: "What does “arboreal” mean?",
    options: ["Tree-dwelling", "Egg-laying", "Night-hunting", "Venomous"],
    answer: 0,
    explanation: "Arboreal animals live most of their lives in trees — like green tree pythons.",
  },
  {
    id: "gtp-02",
    category: "Green Tree Pythons",
    difficulty: 2,
    question: "Newborn green tree pythons are usually which colors?",
    options: ["Green or blue", "Red or yellow", "Black or white", "Brown or gray"],
    answer: 1,
    explanation: "GTP babies hatch red or yellow depending on locality, then turn green as they grow.",
  },
  {
    id: "gtp-03",
    category: "Green Tree Pythons",
    difficulty: 1,
    question: "What color are most adult green tree pythons?",
    options: ["Bright green", "Deep red", "Golden yellow", "Jet black"],
    answer: 0,
    explanation: "Most adults settle into that famous emerald green, often with white or blue markings.",
  },
  {
    id: "gtp-04",
    category: "Green Tree Pythons",
    difficulty: 4,
    question: "In 2020 the green tree python complex was split into two species. The northern species is…",
    options: ["Morelia azurea", "Morelia bredli", "Morelia spilota", "Morelia carinata"],
    answer: 0,
    explanation: "Northern populations became Morelia azurea; true Morelia viridis is now the southern (Aru/Merauke) lineage.",
  },
  {
    id: "gtp-05",
    category: "Green Tree Pythons",
    difficulty: 3,
    question: "Which locality is famous for yellow neonates?",
    options: ["Biak", "Sorong", "Aru", "Jayapura"],
    answer: 2,
    explanation: "Aru Islands animals — true Morelia viridis — famously hatch yellow.",
  },
  {
    id: "gtp-06",
    category: "Green Tree Pythons",
    difficulty: 3,
    question: "“Chondro” is short for…",
    options: ["Chondropython", "Chondrodite", "Chondrichthyes", "Chondroma"],
    answer: 0,
    explanation: "Chondropython viridis was the green tree python's former scientific name — the nickname stuck.",
  },
  {
    id: "gtp-07",
    category: "Green Tree Pythons",
    difficulty: 1,
    question: "How do green tree pythons subdue their prey?",
    options: ["Venom", "Constriction", "Electrocution", "Drowning"],
    answer: 1,
    explanation: "They're non-venomous constrictors — they strike, coil, and squeeze.",
  },
  {
    id: "gtp-08",
    category: "Green Tree Pythons",
    difficulty: 6,
    question: "Kofiau, home of famously yellow GTP babies, sits in which island group?",
    options: ["Raja Ampat", "Solomon Islands", "Bismarck Archipelago", "Lesser Sundas"],
    answer: 0,
    explanation: "Kofiau is part of the Raja Ampat archipelago off the Bird's Head Peninsula.",
  },
  {
    id: "gtp-09",
    category: "Green Tree Pythons",
    difficulty: 1,
    question: "Wild green tree pythons are native to…",
    options: ["New Guinea and nearby islands", "The Amazon basin", "Madagascar", "Mainland Southeast Asia"],
    answer: 0,
    explanation: "New Guinea and surrounding islands, plus Australia's Cape York Peninsula.",
  },
  {
    id: "gtp-10",
    category: "Green Tree Pythons",
    difficulty: 3,
    question: "In adult green tree pythons, which sex is typically larger?",
    options: ["Females", "Males", "They're identical", "It varies randomly"],
    answer: 0,
    explanation: "Adult females are usually the larger, heavier sex — handy for breeding projects.",
  },
  {
    id: "gtp-11",
    category: "Green Tree Pythons",
    difficulty: 5,
    question: "In Canopy Hunter's Southern Wilds region, the snakes are…",
    options: [
      "True Morelia viridis that throw yellow babies",
      "A mix of every locality",
      "Albino morphs",
      "Emerald tree boas",
    ],
    answer: 0,
    explanation: "The Southern Wilds (Aru + Merauke) is true Morelia viridis country — yellow babies only.",
  },
  {
    id: "gtp-12",
    category: "Green Tree Pythons",
    difficulty: 1,
    question: "Green tree pythons are primarily active…",
    options: ["At night", "At dawn", "At midday", "Only during rain"],
    answer: 0,
    explanation: "They're nocturnal ambush hunters, coiled on a branch waiting for dinner to wander by.",
  },
  {
    id: "gtp-13",
    category: "Green Tree Pythons",
    difficulty: 5,
    question: "The name “azurea” in Morelia azurea refers to…",
    options: ["Blue coloration", "The Azure Coast", "A researcher named Azure", "Its blue eggs"],
    answer: 0,
    explanation: "Azurea means azure — named for the blue tones of the northern animals.",
  },
  {
    id: "gtp-14",
    category: "Green Tree Pythons",
    difficulty: 5,
    question: "In Australia, wild green tree pythons are found only…",
    options: ["On the Cape York Peninsula", "Across the whole country", "In Tasmania", "Around Sydney"],
    answer: 0,
    explanation: "Australia's only GTP population hangs on at the tip of Cape York, Queensland.",
  },
  {
    id: "gtp-15",
    category: "Green Tree Pythons",
    difficulty: 6,
    question: "The 2020 green tree python split rested mainly on…",
    options: ["DNA evidence", "Captive breeding records", "Fossil finds", "A public vote"],
    answer: 0,
    explanation: "Molecular phylogenetics redrew the map — scale counts alone couldn't settle it.",
  },

  /* ------------------------- Emerald Tree Boas ------------------------- */
  {
    id: "etb-01",
    category: "Emerald Tree Boas",
    difficulty: 1,
    question: "Emerald tree boas are native to…",
    options: ["The Amazon rainforest", "The Sahara Desert", "The Australian outback", "The Himalayas"],
    answer: 0,
    explanation: "They're Amazon Basin canopy hunters, found across northern South America.",
  },
  {
    id: "etb-02",
    category: "Emerald Tree Boas",
    difficulty: 1,
    question: "Like green tree pythons, baby emerald tree boas are usually…",
    options: [
      "Red or orange, turning green as they grow",
      "Green from birth",
      "Bright blue their whole lives",
      "Patternless white",
    ],
    answer: 0,
    explanation: "Both species hatch in “neonate” colors and turn green with age — convergent evolution at work.",
  },
  {
    id: "etb-03",
    category: "Emerald Tree Boas",
    difficulty: 2,
    question: "Emerald tree boas subdue their prey by…",
    options: ["Constriction", "Venom", "Electrocution", "Hypnosis"],
    answer: 0,
    explanation: "Non-venomous constrictors — strike, coil, squeeze.",
  },
  {
    id: "etb-04",
    category: "Emerald Tree Boas",
    difficulty: 2,
    question: "The emerald tree boa's scientific name is…",
    options: ["Corallus caninus", "Morelia viridis", "Boa constrictor", "Corallus hortulanus"],
    answer: 0,
    explanation: "Corallus caninus — don't confuse it with the garden tree boa, Corallus hortulanus.",
  },
  {
    id: "etb-05",
    category: "Emerald Tree Boas",
    difficulty: 2,
    question: "Unlike green tree pythons, emerald tree boas…",
    options: ["Give live birth", "Lay eggs", "Build leaf nests", "Incubate eggs with body heat"],
    answer: 0,
    explanation: "Most boas are viviparous — babies arrive live, no eggs involved. Pythons lay eggs.",
  },
  {
    id: "etb-06",
    category: "Emerald Tree Boas",
    difficulty: 3,
    question: "Emerald tree boas are famous among non-venomous snakes for their…",
    options: ["Exceptionally long teeth", "Bright blue tongues", "Rattling tails", "Hooded necks"],
    answer: 0,
    explanation: "Their front teeth are proportionally among the longest of any non-venomous snake — built for gripping birds and mammals.",
  },
  {
    id: "etb-07",
    category: "Emerald Tree Boas",
    difficulty: 3,
    question: "An emerald tree boa senses the body heat of prey with pits located…",
    options: ["Along its upper lip", "On the tip of its tail", "Behind its eyes", "Under its chin"],
    answer: 0,
    explanation: "Labial pits line the upper lip — night-vision goggles for warm-blooded dinner.",
  },
  {
    id: "etb-08",
    category: "Emerald Tree Boas",
    difficulty: 4,
    question: "In 2009, southern emerald tree boas were recognized as a separate species:",
    options: ["Corallus batesii", "Corallus caninus", "Corallus hortulanus", "Corallus grenadensis"],
    answer: 0,
    explanation: "The Amazon Basin animals became Corallus batesii; true C. caninus is the northern (Guiana Shield) form.",
  },
  {
    id: "etb-09",
    category: "Emerald Tree Boas",
    difficulty: 5,
    question: "Green tree pythons and emerald tree boas look alike despite being unrelated. This is called…",
    options: ["Convergent evolution", "Mimicry", "Hybridization", "Genetic drift"],
    answer: 0,
    explanation: "Same canopy-ambush lifestyle, same solution — evolution arrived at the green coiled hunter twice.",
  },
  {
    id: "etb-10",
    category: "Emerald Tree Boas",
    difficulty: 5,
    question: "Corallus caninus was first described by Linnaeus in…",
    options: ["1758", "1858", "1908", "2009"],
    answer: 0,
    explanation: "Right in the 10th edition of Systema Naturae — one of the originals.",
  },
  {
    id: "etb-11",
    category: "Emerald Tree Boas",
    difficulty: 6,
    question: "The species name “caninus” refers to the snake's…",
    options: [
      "Long, dog-like teeth",
      "Barking defensive call",
      "Loyalty to a single perch",
      "Pack-hunting behavior",
    ],
    answer: 0,
    explanation: "Caninus means “of a dog” — a nod to those outsized canine-like teeth.",
  },

  /* ---------------------------- Tree Monitors ---------------------------- */
  {
    id: "mon-01",
    category: "Tree Monitors",
    difficulty: 1,
    question: "Tree monitors are native to…",
    options: ["New Guinea and nearby islands", "Florida", "Madagascar", "Borneo"],
    answer: 0,
    explanation: "The prasinus complex is a New Guinea region specialty.",
  },
  {
    id: "mon-02",
    category: "Tree Monitors",
    difficulty: 1,
    question: "A tree monitor's long tail is…",
    options: [
      "Prehensile — used like a fifth limb",
      "Venomous",
      "Used only for swimming",
      "Shed and regrown yearly",
    ],
    answer: 0,
    explanation: "It grips branches while the claws do the climbing — true canopy hardware.",
  },
  {
    id: "mon-03",
    category: "Tree Monitors",
    difficulty: 2,
    question: "The emerald tree monitor's scientific name is…",
    options: ["Varanus prasinus", "Varanus komodoensis", "Varanus salvator", "Varanus niloticus"],
    answer: 0,
    explanation: "Prasinus means “leek-green” — the name fits.",
  },
  {
    id: "mon-04",
    category: "Tree Monitors",
    difficulty: 2,
    question: "The blue tree monitor (Varanus macraei) lives only on…",
    options: ["Batanta Island", "Komodo Island", "Java", "Sri Lanka"],
    answer: 0,
    explanation: "A single-island endemic off New Guinea's Bird's Head Peninsula.",
  },
  {
    id: "mon-05",
    category: "Tree Monitors",
    difficulty: 3,
    question: "Female emerald tree monitors often lay their eggs…",
    options: [
      "Inside arboreal termite nests",
      "Buried in beach sand",
      "Underwater",
      "In abandoned bird nests",
    ],
    answer: 0,
    explanation: "The termite mound's warmth and humidity make a perfect natural incubator.",
  },
  {
    id: "mon-06",
    category: "Tree Monitors",
    difficulty: 4,
    question: "Tree monitors belong to the monitor subgenus…",
    options: ["Hapturosaurus", "Odatria", "Euprepiosaurus", "Varanus"],
    answer: 0,
    explanation: "Hapturosaurus — the dedicated tree-monitor lineage within Varanus.",
  },
  {
    id: "mon-07",
    category: "Tree Monitors",
    difficulty: 5,
    question: "The yellow tree monitor of Misool Island is…",
    options: ["Varanus reisingeri", "Varanus macraei", "Varanus prasinus", "Varanus beccarii"],
    answer: 0,
    explanation: "Described in 2005 — another island, another jewel-toned monitor.",
  },
  {
    id: "mon-08",
    category: "Tree Monitors",
    difficulty: 6,
    question: "The blue tree monitor was formally described in…",
    options: ["2001", "1951", "1975", "2021"],
    answer: 0,
    explanation: "Böhme & Jacobs, 2001 — a genuinely recent discovery.",
  },
  {
    id: "mon-09",
    category: "Tree Monitors",
    difficulty: 6,
    question: "Unlike their Komodo dragon cousins, adult tree monitors are typically…",
    options: [
      "Under 3 feet long including the tail",
      "Over 8 feet long",
      "Heavier than 50 pounds",
      "The same size as Komodos",
    ],
    answer: 0,
    explanation: "About a yard of slender, grippy canopy specialist.",
  },

  /* -------------------------- Boiga & Cat Snakes -------------------------- */
  {
    id: "boi-01",
    category: "Boiga & Cat Snakes",
    difficulty: 1,
    question: "Cat snakes are named for their…",
    options: ["Vertical, cat-like pupils", "Meowing call", "Whiskered snouts", "Love of milk"],
    answer: 0,
    explanation: "Those slit pupils scream nocturnal hunter.",
  },
  {
    id: "boi-02",
    category: "Boiga & Cat Snakes",
    difficulty: 1,
    question: "The gold-ringed cat snake is better known as the…",
    options: ["Mangrove snake", "Cobra", "Garter snake", "Milk snake"],
    answer: 0,
    explanation: "Boiga dendrophila — black with gold bands, a Southeast Asian classic.",
  },
  {
    id: "boi-03",
    category: "Boiga & Cat Snakes",
    difficulty: 2,
    question: "Cat snakes deliver their mild venom with…",
    options: ["Rear fangs", "Hinged front fangs", "A stinger", "Venomous spit"],
    answer: 0,
    explanation: "Opisthoglyphous — grooved fangs at the back of the mouth.",
  },
  {
    id: "boi-04",
    category: "Boiga & Cat Snakes",
    difficulty: 2,
    question: "The brown tree snake (Boiga irregularis) is infamous for…",
    options: [
      "Invading Guam and devastating native birds",
      "Building dams",
      "Eating only plants",
      "Colonizing Antarctica",
    ],
    answer: 0,
    explanation: "It wiped out most of Guam's native forest birds — a textbook invasive disaster.",
  },
  {
    id: "boi-05",
    category: "Boiga & Cat Snakes",
    difficulty: 3,
    question: "Mangrove snakes (Boiga dendrophila) are native to…",
    options: ["Southeast Asia", "South America", "Australia", "East Africa"],
    answer: 0,
    explanation: "From Thailand to the Philippines — lowland forests and mangroves.",
  },
  {
    id: "boi-06",
    category: "Boiga & Cat Snakes",
    difficulty: 3,
    question: "A mangrove snake's venom is considered…",
    options: [
      "Mild — not dangerous to healthy adults",
      "Lethal within minutes",
      "Nonexistent",
      "Psychoactive",
    ],
    answer: 0,
    explanation: "Rear-fanged and mild — built for frogs and lizards, not people.",
  },
  {
    id: "boi-07",
    category: "Boiga & Cat Snakes",
    difficulty: 4,
    question: "The brown tree snake is actually native to…",
    options: ["Australia, New Guinea, and the Solomon Islands", "Hawaii", "Florida", "Guam"],
    answer: 0,
    explanation: "Guam is where it was introduced — at home it's just another night-hunting cat snake.",
  },
  {
    id: "boi-08",
    category: "Boiga & Cat Snakes",
    difficulty: 5,
    question: "Brown tree snakes most likely reached Guam…",
    options: [
      "As stowaways in military cargo after WWII",
      "By swimming the Pacific",
      "On a cruise ship",
      "They were always there",
    ],
    answer: 0,
    explanation: "Post-war cargo movements gave a few snakes a ride — and Guam's birds paid for it.",
  },

  /* ---------------------------- Arboreal Vipers ---------------------------- */
  {
    id: "vip-01",
    category: "Arboreal Vipers",
    difficulty: 1,
    question: "An eyelash viper's “eyelashes” are actually…",
    options: ["Modified scales above the eyes", "Real eyelashes", "Venom glands", "Tiny feathers"],
    answer: 0,
    explanation: "Enlarged supraocular scales — great camouflage among flowers and moss.",
  },
  {
    id: "vip-02",
    category: "Arboreal Vipers",
    difficulty: 2,
    question: "Eyelash vipers live in…",
    options: ["Central and South America", "Africa", "Australia", "Europe"],
    answer: 0,
    explanation: "Neotropical canopy — from Mexico to Ecuador and Venezuela.",
  },
  {
    id: "vip-03",
    category: "Arboreal Vipers",
    difficulty: 2,
    question: "The eyelash viper's scientific name is…",
    options: ["Bothriechis schlegelii", "Atheris squamigera", "Bothrops asper", "Trimeresurus albolabris"],
    answer: 0,
    explanation: "Bothriechis schlegelii — the classic arboreal pit viper.",
  },
  {
    id: "vip-04",
    category: "Arboreal Vipers",
    difficulty: 3,
    question: "Like most vipers, eyelash vipers…",
    options: ["Give live birth", "Lay eggs", "Clone themselves", "Nurse their young"],
    answer: 0,
    explanation: "Viviparous — most vipers skip the egg stage entirely.",
  },
  {
    id: "vip-05",
    category: "Arboreal Vipers",
    difficulty: 4,
    question: "Bush vipers (Atheris) are found in…",
    options: ["Africa", "Asia", "South America", "Australia"],
    answer: 0,
    explanation: "Sub-Saharan Africa's forests — a whole genus of dragon-looking vipers.",
  },
  {
    id: "vip-06",
    category: "Arboreal Vipers",
    difficulty: 4,
    question: "Unlike eyelash vipers, African bush vipers…",
    options: ["Lack heat-sensing pits", "Are non-venomous", "Have no scales", "Cannot climb"],
    answer: 0,
    explanation: "Atheris are true vipers (Viperinae) — no pits, just excellent eyes and attitude.",
  },
  {
    id: "vip-07",
    category: "Arboreal Vipers",
    difficulty: 5,
    question: "The variable bush viper (Atheris squamigera) is famous for…",
    options: [
      "Heavily keeled, dragon-like scales",
      "Being bright pink",
      "Having no venom",
      "Living underwater",
    ],
    answer: 0,
    explanation: "Those raised keels give it an almost mythical look — and come in endless color phases.",
  },
  {
    id: "vip-08",
    category: "Arboreal Vipers",
    difficulty: 5,
    question: "African bush vipers belong to the subfamily…",
    options: ["Viperinae — the true vipers", "Crotalinae — the pit vipers", "Elapinae", "Colubrinae"],
    answer: 0,
    explanation: "True vipers, no heat pits — unlike their New World pit-viper cousins.",
  },
  {
    id: "vip-09",
    category: "Arboreal Vipers",
    difficulty: 6,
    question: "Bothriechis schlegelii was named for…",
    options: [
      "Hermann Schlegel, a German naturalist",
      "A type of eyelash",
      "A family of snake breeders",
      "A Costa Rican village",
    ],
    answer: 0,
    explanation: "Schlegel never saw one alive — the honor came from his museum work.",
  },
  {
    id: "vip-10",
    category: "Arboreal Vipers",
    difficulty: 6,
    question: "Atheris hispida is better known as the…",
    options: ["Hairy bush viper", "Smooth bush viper", "Desert viper", "Eyelash viper"],
    answer: 0,
    explanation: "Those bristly keeled scales look almost furry — “hairy” stuck.",
  },

  /* ---------------------------- Arboreal Geckos ---------------------------- */
  {
    id: "gec-01",
    category: "Arboreal Geckos",
    difficulty: 1,
    question: "Which of these geckos is terrestrial, NOT arboreal?",
    options: ["Leopard gecko", "Crested gecko", "Gargoyle gecko", "Tokay gecko"],
    answer: 0,
    explanation: "Leopard geckos prowl the ground — the rest are canopy crew.",
  },
  {
    id: "gec-02",
    category: "Arboreal Geckos",
    difficulty: 1,
    question: "Crested geckos come from…",
    options: ["New Caledonia", "Hawaii", "Florida", "Madagascar"],
    answer: 0,
    explanation: "A Pacific island east of Australia — gecko paradise.",
  },
  {
    id: "gec-03",
    category: "Arboreal Geckos",
    difficulty: 2,
    question: "Crested geckos were thought extinct until rediscovered in…",
    options: ["1994", "1894", "2004", "2024"],
    answer: 0,
    explanation: "Lost for decades, then found after a tropical storm — now one of the most popular pet reptiles on Earth.",
  },
  {
    id: "gec-04",
    category: "Arboreal Geckos",
    difficulty: 2,
    question: "If a crested gecko drops its tail…",
    options: ["It never grows back", "It regrows in a week", "Two grow back", "It becomes venomous"],
    answer: 0,
    explanation: "Unlike many lizards, cresties don't regenerate — tailless “frog butts” are permanent.",
  },
  {
    id: "gec-05",
    category: "Arboreal Geckos",
    difficulty: 3,
    question: "Geckos cling to smooth surfaces thanks to…",
    options: ["Microscopic hairs on their toe pads", "Suction cups", "Sticky glue", "Static-cling fur"],
    answer: 0,
    explanation: "Millions of tiny setae — molecular attraction doing the heavy lifting.",
  },
  {
    id: "gec-06",
    category: "Arboreal Geckos",
    difficulty: 3,
    question: "The tokay gecko is famous for…",
    options: ["Its loud “to-kay” bark", "Being completely silent", "Glowing in the dark", "Gliding between trees"],
    answer: 0,
    explanation: "Say it with feeling: “to-KAY!” — and mind the bite.",
  },
  {
    id: "gec-07",
    category: "Arboreal Geckos",
    difficulty: 4,
    question: "The gargoyle gecko's scientific name is…",
    options: ["Rhacodactylus auriculatus", "Correlophus ciliatus", "Gekko gecko", "Eublepharis macularius"],
    answer: 0,
    explanation: "Another New Caledonian giant — those cranial “horns” earned the gargoyle name.",
  },
  {
    id: "gec-08",
    category: "Arboreal Geckos",
    difficulty: 4,
    question: "Day geckos (Phelsuma) break the gecko mold by being…",
    options: ["Active during the day", "Venomous", "Legless", "Warm-blooded"],
    answer: 0,
    explanation: "Most geckos are night shift — Phelsuma works days, in brilliant green.",
  },
  {
    id: "gec-09",
    category: "Arboreal Geckos",
    difficulty: 5,
    question: "Unlike most geckos, leopard geckos…",
    options: ["Have movable eyelids", "Have no tail", "Are blind", "Give live birth"],
    answer: 0,
    explanation: "Eublepharids can blink — the rest of geckodom just licks its eyeballs.",
  },
  {
    id: "gec-10",
    category: "Arboreal Geckos",
    difficulty: 6,
    question: "The crested gecko was originally described in the genus…",
    options: ["Rhacodactylus", "Correlophus", "Gekko", "Phelsuma"],
    answer: 0,
    explanation: "Rhacodactylus ciliatus (1866) — moved to Correlophus in 2012.",
  },
  {
    id: "gec-11",
    category: "Arboreal Geckos",
    difficulty: 6,
    question: "A gecko's grip comes from…",
    options: [
      "Van der Waals forces between toe hairs and surfaces",
      "Superglue-like sweat",
      "Tiny hooks",
      "Magnetism",
    ],
    answer: 0,
    explanation: "Weak molecular forces, times millions of setae, equals Spider-Man.",
  },
  {
    id: "gec-12",
    category: "Arboreal Geckos",
    difficulty: 6,
    question: "Most geckos keep their eyes clean by…",
    options: ["Licking them with their tongue", "Blinking", "Wiping with their feet", "They don't bother"],
    answer: 0,
    explanation: "No eyelids? No problem — one quick tongue-swipe per eye.",
  },

  /* ---------------------------- Snake Biology ---------------------------- */
  {
    id: "bio-01",
    category: "Snake Biology",
    difficulty: 1,
    question: "A snake's forked tongue is mainly used for…",
    options: ["Smelling", "Tasting food", "Hearing", "Drinking"],
    answer: 0,
    explanation: "The tongue delivers scent particles to the Jacobson's organ in the roof of the mouth.",
  },
  {
    id: "bio-02",
    category: "Snake Biology",
    difficulty: 1,
    question: "How many eyelids does a snake have?",
    options: ["None", "Two", "Four", "One"],
    answer: 0,
    explanation: "Snakes have no eyelids — a transparent scale called the brille protects each eye.",
  },
  {
    id: "bio-03",
    category: "Snake Biology",
    difficulty: 3,
    question: "What is the brille?",
    options: ["A clear scale covering the eye", "A type of venom", "A throat pouch", "A tail rattle"],
    answer: 0,
    explanation: "The brille (spectacle) is a transparent scale shielding the eye — it sheds with the skin.",
  },
  {
    id: "bio-04",
    category: "Snake Biology",
    difficulty: 1,
    question: "The heat-sensing pits of pythons detect…",
    options: ["Infrared radiation", "Ultraviolet light", "Sound waves", "Magnetic fields"],
    answer: 0,
    explanation: "Pit organs sense the body heat of warm-blooded prey — night-vision goggles, built in.",
  },
  {
    id: "bio-05",
    category: "Snake Biology",
    difficulty: 3,
    question: "“Oviparous” means an animal…",
    options: ["Lays eggs", "Gives live birth", "Clones itself", "Hatches eggs internally"],
    answer: 0,
    explanation: "Oviparous = egg-laying. Pythons are oviparous; most boas are viviparous (live birth).",
  },
  {
    id: "bio-06",
    category: "Snake Biology",
    difficulty: 4,
    question: "Which gives live birth — the emerald tree boa or the green tree python?",
    options: ["Emerald tree boa", "Green tree python", "Both do", "Neither does"],
    answer: 0,
    explanation: "Most boas bear live young; pythons lay eggs. Convergent looks, different playbooks.",
  },
  {
    id: "bio-07",
    category: "Snake Biology",
    difficulty: 1,
    question: "A group of snakes is called…",
    options: ["A den", "A flock", "A school", "A pack"],
    answer: 0,
    explanation: "A den (also called a nest or pit) of snakes. Try not to find one unexpectedly.",
  },
  {
    id: "bio-08",
    category: "Snake Biology",
    difficulty: 3,
    question: "Brumation is…",
    options: ["A dormancy period like hibernation", "A mating dance", "A type of shed", "A venom delivery method"],
    answer: 0,
    explanation: "Brumation is the reptile version of hibernation — slowed metabolism through the cool season.",
  },
  {
    id: "bio-09",
    category: "Snake Biology",
    difficulty: 4,
    question: "Compared to adults, young growing snakes typically shed…",
    options: ["More often", "Less often", "Only once a year", "Never"],
    answer: 0,
    explanation: "Fast growth means frequent sheds — babies can shed every few weeks.",
  },
  {
    id: "bio-10",
    category: "Snake Biology",
    difficulty: 4,
    question: "Snakes with long, hinged, hollow fangs that fold back are…",
    options: ["Vipers", "Pythons", "Colubrids", "Boas"],
    answer: 0,
    explanation: "That's solenoglyphous dentition — classic viper hardware, like a switchblade.",
  },
  {
    id: "bio-11",
    category: "Snake Biology",
    difficulty: 2,
    question: "Snakes hear the way we do.",
    options: [
      "False — no external ears, they sense vibrations",
      "True — with keen hearing",
      "True — but only low rumbles",
      "False — they are completely deaf",
    ],
    answer: 0,
    explanation: "No external ears, but their jawbones pick up ground vibrations just fine.",
  },
  {
    id: "bio-12",
    category: "Snake Biology",
    difficulty: 5,
    question: "A snake's wide belly scales (ventral scutes) mainly help it…",
    options: ["Grip surfaces to move", "Absorb heat", "Sense smell", "Store fat"],
    answer: 0,
    explanation: "Ventral scutes grip the ground like cleats — that's how a snake with no legs gets around.",
  },
  {
    id: "bio-13",
    category: "Snake Biology",
    difficulty: 5,
    question: "Cobras and mambas have fixed front fangs — this is called…",
    options: [
      "Proteroglyphous dentition",
      "Solenoglyphous dentition",
      "Opisthoglyphous dentition",
      "Aglyphous dentition",
    ],
    answer: 0,
    explanation: "Proteroglyphous: fixed, grooved front fangs — the elapid setup.",
  },
  {
    id: "bio-14",
    category: "Snake Biology",
    difficulty: 6,
    question: "Boomslangs and twig snakes share what fang type?",
    options: ["Rear-fanged (opisthoglyphous)", "Hinged front fangs", "No fangs at all", "Spitting fangs"],
    answer: 0,
    explanation: "Rear-fanged colubrids — and proof that “rear-fanged” doesn't always mean harmless.",
  },

  /* ------------------------------ Husbandry ------------------------------ */
  {
    id: "hus-01",
    category: "Husbandry",
    difficulty: 1,
    question: "A shed that comes off in one complete piece suggests…",
    options: ["Good health and humidity", "Mites", "Old age", "Overfeeding"],
    answer: 0,
    explanation: "One clean tube of shed skin is the gold star of reptile keeping.",
  },
  {
    id: "hus-02",
    category: "Husbandry",
    difficulty: 3,
    question: "Stuck shed constricting toes or a tail tip can lead to…",
    options: ["Tissue loss", "Better color", "Faster growth", "Nothing at all"],
    answer: 0,
    explanation: "Retained shed cuts off circulation — always check toes and tail tips after a shed.",
  },
  {
    id: "hus-03",
    category: "Husbandry",
    difficulty: 2,
    question: "The safest way to thaw a frozen feeder is…",
    options: ["In the fridge or cold water", "In the microwave", "In direct sunlight", "With a hair dryer"],
    answer: 0,
    explanation: "Slow-thaw in the fridge or cold water. Microwaves cook unevenly and invite bacteria.",
  },
  {
    id: "hus-04",
    category: "Husbandry",
    difficulty: 3,
    question: "New animals are quarantined to…",
    options: [
      "Watch for illness or mites before joining the collection",
      "Tame them faster",
      "Save on heating",
      "Keep them hungry",
    ],
    answer: 0,
    explanation: "Quarantine keeps one sick newcomer from becoming a collection-wide problem.",
  },
  {
    id: "hus-05",
    category: "Husbandry",
    difficulty: 3,
    question: "Green tree pythons generally thrive at humidity around…",
    options: ["60–80%", "10–20%", "30–40%", "95–100%"],
    answer: 0,
    explanation: "They're rainforest canopy animals — moderate to high humidity keeps sheds clean.",
  },
  {
    id: "hus-06",
    category: "Husbandry",
    difficulty: 2,
    question: "A proper enclosure has a warm side and a cool side so the snake can…",
    options: ["Thermoregulate", "Hide from you", "Exercise", "Digest only"],
    answer: 0,
    explanation: "Reptiles can't make their own body heat — the gradient lets them pick their temperature.",
  },
  {
    id: "hus-07",
    category: "Husbandry",
    difficulty: 5,
    question: "The “wobble” condition is famously linked to which ball python morph?",
    options: ["Spider", "Albino", "Piebald", "Clown"],
    answer: 0,
    explanation: "The spider morph carries a neurological wobble of varying severity — a well-known ethics debate.",
  },
  {
    id: "hus-08",
    category: "Husbandry",
    difficulty: 1,
    question: "Fresh drinking water should be available…",
    options: ["At all times", "Once a week", "Only after feeding", "Only in summer"],
    answer: 0,
    explanation: "Always. A big water bowl also bumps humidity — double duty.",
  },
  {
    id: "hus-09",
    category: "Husbandry",
    difficulty: 5,
    question: "In reptile genetics, “het” means…",
    options: [
      "Heterozygous — carrying a hidden recessive gene",
      "A heating element",
      "A locality code",
      "Short for heterodont",
    ],
    answer: 0,
    explanation: "A het animal looks normal but carries one copy of a recessive gene it can pass on.",
  },
  {
    id: "hus-10",
    category: "Husbandry",
    difficulty: 4,
    question: "Handling a snake right after a meal risks…",
    options: ["Regurgitation", "A better bond", "Faster digestion", "Nothing"],
    answer: 0,
    explanation: "Give them 48 hours to digest in peace — a regurgitated meal is rough on the animal.",
  },
  {
    id: "hus-11",
    category: "Husbandry",
    difficulty: 3,
    question: "Hides on both the warm and cool ends let a snake…",
    options: ["Feel secure while thermoregulating", "Pick a favorite color", "Avoid drinking", "Sleep less"],
    answer: 0,
    explanation: "Security plus temperature choice — a hiding snake is a happy snake.",
  },
  {
    id: "hus-12",
    category: "Husbandry",
    difficulty: 2,
    question: "The most important first step when a reptile looks sick is…",
    options: ["See a reptile vet", "Bathe it in oil", "Crank the heat to max", "Wait a month"],
    answer: 0,
    explanation: "Find an exotics vet. Internet remedies can wait; a professional can't.",
  },
  {
    id: "hus-13",
    category: "Husbandry",
    difficulty: 6,
    question: "In reptile breeding, “pipping” is when…",
    options: ["A hatchling cuts through its eggshell", "A snake starts a shed", "Eggs are candled", "A thermostat fails"],
    answer: 0,
    explanation: "First slit in the shell — the long wait is almost over.",
  },

  /* ---------------------------- Arboreal Planet ---------------------------- */
  {
    id: "ap-01",
    category: "Arboreal Planet",
    difficulty: 2,
    question: "Hank Scale's catchphrase is…",
    options: [
      "We sell snakes and snake accessories.",
      "Got chondros?",
      "Snakes forever.",
      "Buy the dip.",
    ],
    answer: 0,
    explanation: "Hank Hill energy, reptile edition.",
  },
  {
    id: "ap-02",
    category: "Arboreal Planet",
    difficulty: 2,
    question: "The Chondro Dojo is…",
    options: [
      "An enclosure built to house a GTP from hatchling to adult",
      "A martial arts gym",
      "A snake restaurant",
      "A type of heat lamp",
    ],
    answer: 0,
    explanation: "Gage's real-life product — one enclosure for a chondro's whole life.",
  },
  {
    id: "ap-03",
    category: "Arboreal Planet",
    difficulty: 4,
    question: "The Arboreal Keeper intro grants new players…",
    options: ["$30,000 in credit", "A free car", "One cricket", "$30"],
    answer: 0,
    explanation: "Thirty grand in store credit at Hank Scale's Reptiles. Not a bad start.",
  },
  {
    id: "ap-04",
    category: "Arboreal Planet",
    difficulty: 2,
    question: "Which mini-game lets you catch wild GTPs and send them to your Keeper save?",
    options: ["Canopy Hunter", "Reptile Trivia", "Snake Poker", "The Dojo"],
    answer: 0,
    explanation: "Canopy Hunter — bag wild green tree pythons and import them into Arboreal Keeper.",
  },
  {
    id: "ap-05",
    category: "Arboreal Planet",
    difficulty: 4,
    question: "Arboreal Radio is…",
    options: [
      "An opt-in mini-player for music by Gage and collaborators",
      "A live snake cam",
      "A podcast about taxes",
      "A weather station",
    ],
    answer: 0,
    explanation: "Silent until you press play — 17 tracks of Lizard music and counting.",
  },
  {
    id: "ap-06",
    category: "Arboreal Planet",
    difficulty: 4,
    question: "Which carnivorous plant genus is featured in the Plants section?",
    options: ["Nepenthes", "Rosa", "Quercus", "Tulipa"],
    answer: 0,
    explanation: "Tropical pitcher plants — a bioactive-enclosure favorite.",
  },
  {
    id: "ap-07",
    category: "Arboreal Planet",
    difficulty: 3,
    question: "The game is called Arboreal Keeper. The community is called…",
    options: ["Arboreal Planet", "Arboreal Keeper", "Chondro World", "Snakebook"],
    answer: 0,
    explanation: "Arboreal Planet is the community; Arboreal Keeper is the game it made. Don't mix them up.",
  },
  {
    id: "ap-08",
    category: "Arboreal Planet",
    difficulty: 2,
    question: "In Canopy Hunter, how many trees are in each expedition?",
    options: ["12", "4", "8", "20"],
    answer: 0,
    explanation: "Twelve trees, eight searches, four hidden pythons. Spend those searches wisely.",
  },
  {
    id: "ap-09",
    category: "Arboreal Planet",
    difficulty: 4,
    question: "In Canopy Hunter, how many searches do you get per expedition?",
    options: ["8", "12", "4", "Unlimited"],
    answer: 0,
    explanation: "Eight searches for four pythons — a 50% hit rate if you play it perfectly.",
  },
  {
    id: "ap-10",
    category: "Arboreal Planet",
    difficulty: 5,
    question: "Which Canopy Hunter region is “true Morelia viridis country”?",
    options: ["Southern Wilds", "Cenderawasih Islands", "Bird's Head West", "Highlands & North Coast"],
    answer: 0,
    explanation: "The Southern Wilds (Aru + Merauke) — yellow babies only.",
  },
  {
    id: "ap-11",
    category: "Arboreal Planet",
    difficulty: 2,
    question: "Arboreal Planet is…",
    options: ["A reptile hobby community", "A planetarium", "A tree farm", "A crypto exchange"],
    answer: 0,
    explanation: "Reptiles, stories, keepers, and one extremely catchy radio station.",
  },
  {
    id: "ap-12",
    category: "Arboreal Planet",
    difficulty: 4,
    question: "The arcade's featured full game is…",
    options: ["Arboreal Keeper", "Canopy Hunter", "Reptile Trivia", "Pong"],
    answer: 0,
    explanation: "Arboreal Keeper — build a green tree python breeding program from the ground up.",
  },
];

/* ------------------------------------------------------------------ */
/* Round logic                                                         */
/* ------------------------------------------------------------------ */

type RandomFn = () => number;

function shuffleInPlace<T>(items: T[], random: RandomFn): T[] {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

/**
 * Build a round for a difficulty mode: shuffle the tier's question pool,
 * deal QUESTIONS_PER_ROUND, and shuffle each question's options so the
 * answer isn't always in the same slot.
 */
export function buildRound(mode: TriviaMode, random: RandomFn = Math.random): TriviaQuestion[] {
  const def = modeDef(mode);
  const pool = shuffleInPlace(
    TRIVIA_QUESTIONS.filter((q) => q.difficulty === def.difficulty),
    random,
  );
  return pool.slice(0, QUESTIONS_PER_ROUND).map((q) => {
    const order = shuffleInPlace([0, 1, 2, 3], random);
    const options = order.map((oi) => q.options[oi]) as [string, string, string, string];
    return { ...q, options, answer: order.indexOf(q.answer) };
  });
}

/** Score for a correct answer: base by difficulty + speed bonus + streak bonus. */
export function scoreFor(difficulty: TriviaDifficulty, secondsLeft: number, streak: number): number {
  const base = 100 * difficulty;
  const timeBonus = Math.round((secondsLeft / QUESTION_SECONDS) * 50);
  const streakBonus = Math.min(streak, 5) * 20;
  return base + timeBonus + streakBonus;
}

export interface TriviaRank {
  title: string;
  blurb: string;
}

/** Rank titles for a finished round, scaled to the mode's max possible score. */
export function rankFor(score: number, mode: TriviaMode): TriviaRank {
  const def = modeDef(mode);
  const max = QUESTIONS_PER_ROUND * (100 * def.difficulty + 50 + 100);
  const frac = max > 0 ? score / max : 0;
  if (frac >= 0.85)
    return { title: "Chondro Master", blurb: "The canopy bows to you. Hank would be proud." };
  if (frac >= 0.6)
    return { title: "Seasoned Keeper", blurb: "Years of shed skins and thermostat checks shine through." };
  if (frac >= 0.35)
    return { title: "Keeper in Training", blurb: "Solid foundation — the snakes can tell." };
  return { title: "Hatchling", blurb: "Every expert started exactly here. Run it back." };
}

function bestKey(mode: TriviaMode): string {
  return `${TRIVIA_BEST_KEY}:${mode}`;
}

/** Read the persisted best score for a mode (0 when none). */
export function readBestScore(mode: TriviaMode): number {
  try {
    const raw = window.localStorage.getItem(bestKey(mode));
    const n = raw ? parseInt(raw, 10) : 0;
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

/** Persist a best score for a mode. */
export function writeBestScore(mode: TriviaMode, score: number): void {
  try {
    window.localStorage.setItem(bestKey(mode), String(score));
  } catch {
    /* storage unavailable — best score just won't persist */
  }
}
