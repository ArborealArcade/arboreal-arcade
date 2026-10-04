/**
 * Snake Sorting — "The Sorting Ceremony" game data.
 *
 * You are the Sorting Hat. Each snake is presented on the dais; you probe
 * Scales / Crown / Origin, then call its House (subspecies) and, for bonus,
 * its Locality. Houses and localities follow the canonical taxonomy in
 * src/lib/green-tree-python-taxa.ts.
 *
 * Snake photos are NOT generated — they are supplied by the owner.
 * Drop a webp named `<snake-id>.webp` into
 * public/arcade/snake-sorting/snakes/ and set `photo` below.
 *
 * Ceremony flow per serpent: a Round One neonate-color wager (Red or
 * Yellow, small points — skipped only when the photo visibly shows a
 * neonate, since the color is right there), then Scales / Crown / Origin
 * probes, then the House (subspecies) call, then the native-haunts
 * (locality) bonus.
 */

export type HouseId = "azurea" | "utaraensis" | "pulcher" | "viridis" | "designer";

/** Game modes: the classic ceremony, the endless night, and the wildcard hard mode. */
export type GameMode = "ceremony" | "endless" | "wildcard";

export interface House {
  id: HouseId;
  name: string;
  taxon: string;
  shortTaxon: string;
  color: string; // hex accent
  glow: string; // rgba glow
  motto: string;
  region: string;
  localities: string[];
  marks: string; // field-mark summary shown in lessons
}

export const HOUSES: House[] = [
  {
    id: "azurea",
    name: "House Azurea",
    taxon: "Morelia azurea azurea",
    shortTaxon: "M. a. azurea",
    color: "#38bdf8",
    glow: "rgba(56,189,248,.45)",
    motto: "Isle-born and tide-true.",
    region: "Cenderawasih Islands",
    localities: ["Biak", "Numfor"],
    marks:
      "The island house. Heavy black dorsal scaling and strong yellow retention. Biak neonates hatch red or yellow — color alone never settles it.",
  },
  {
    id: "utaraensis",
    name: "House Utaraensis",
    taxon: "Morelia azurea utaraensis",
    shortTaxon: "M. a. utaraensis",
    color: "#34d399",
    glow: "rgba(52,211,153,.45)",
    motto: "Sharp eyes, northern skies.",
    region: "Northern Mainland",
    localities: ["Cyclops", "Jayapura", "Lereh", "Wamena", "Yapen"],
    marks:
      "The northern house. Blue striping down the dorsum and high white markings are the signature — the blue stripe never lies.",
  },
  {
    id: "pulcher",
    name: "House Pulcher",
    taxon: "Morelia azurea pulcher",
    shortTaxon: "M. a. pulcher",
    color: "#f87171",
    glow: "rgba(248,113,113,.45)",
    motto: "Bold blood of the western ranges.",
    region: "Western New Guinea",
    localities: ["Manokwari", "Arfak", "Sorong", "Timika", "Kofiau"],
    marks:
      "The western house. Breeders prize clean yellow retention with blue tones bleeding through. Kofiau animals hatch yellow every single time.",
  },
  {
    id: "viridis",
    name: "House Viridis",
    taxon: "Morelia viridis",
    shortTaxon: "M. viridis",
    color: "#fbbf24",
    glow: "rgba(251,191,36,.45)",
    motto: "Ancient gold of the southern wilds.",
    region: "Southern Wilds",
    localities: ["Aru", "Merauke"],
    marks:
      "The southern house — a true species apart. High white AND high black together is the classic look. Aru and Merauke neonates are always yellow.",
  },
  {
    id: "designer",
    name: "House Designer / Hybrid",
    taxon: "Morelia × designer",
    shortTaxon: "M. × designer",
    color: "#c084fc",
    glow: "rgba(192,132,252,.45)",
    motto: "Bred in racks, not rainforests.",
    region: "Captive Bred",
    localities: ["Captive Bred"],
    marks:
      "The wildcard house. Line-bred designer morphs and hybrid crosses — no wild map claims them. When the field marks refuse every homeland, call the wildcard.",
  },
];

export const HOUSE_BY_ID: Record<HouseId, House> = Object.fromEntries(
  HOUSES.map((h) => [h.id, h]),
) as Record<HouseId, House>;

export type ProbeKind = "scales" | "crown" | "origin";

export interface ProbeClue {
  probe: ProbeKind;
  label: string;
  text: string;
}

export interface SortingSnake {
  id: string;
  name: string;
  house: HouseId;
  locality: string;
  neonate: "red" | "yellow";
  photo: string | null;
  /** Alternate photo of the same animal — the deal picks one per game, never both. */
  photoAlt?: string | null;
  /** True when the photo visibly shows a neonate — the neonate wager is skipped. */
  isNeonate?: boolean;
  clues: ProbeClue[];
  deepScan: string;
  lesson: string;
}

export const PROBE_META: Record<ProbeKind, { label: string; hint: string }> = {
  scales: { label: "Scales", hint: "Probe the pattern & color" },
  crown: { label: "Crown", hint: "Probe the head" },
  origin: { label: "Origin", hint: "Probe the homeland" },
};

export const SNAKES: SortingSnake[] = [
  {
    id: "ember",
    name: "“Ember”",
    house: "azurea",
    locality: "Biak",
    neonate: "red",
    photo: "/arcade/snake-sorting/snakes/ember.webp",
    clues: [
      { probe: "scales", label: "Neonate scales", text: "Brick-red neonate with heavy black dorsal scaling edging every scale." },
      { probe: "crown", label: "Head", text: "Crown mostly dark — black speckling across the whole head." },
      { probe: "origin", label: "Homeland", text: "Island moss and sea air. This clutch never knew a mainland." },
    ],
    deepScan: "Island clutch + heavy black scaling. Only one house owns the Cenderawasih islands.",
    lesson:
      "Heavy black scaling on an island animal is the Azurea signature. Biak and Numfor are the only island localities in the game — and Biak babies hatch red or yellow, so color alone never settles it.",
  },

  {
    id: "coal",
    name: "“Coal”",
    house: "azurea",
    locality: "Biak",
    neonate: "red",
    photo: "/arcade/snake-sorting/snakes/coal.webp",
    clues: [
      { probe: "scales", label: "Neonate scales", text: "Deep red neonate; black edging on every single dorsal scale." },
      { probe: "crown", label: "Head", text: "A near-solid black cap covers the head." },
      { probe: "origin", label: "Homeland", text: "Canopy over the big island of the Cenderawasih group — sea air, moss on every branch." },
    ],
    deepScan: "The black cap and black-edged scales scream the island house.",
    lesson:
      "High black is the Azurea hallmark. When the whole crown goes dark on a Biak animal, the Hat barely has to think.",
  },
  {
    id: "rust",
    name: "“Rust”",
    house: "azurea",
    locality: "Biak",
    neonate: "red",
    photo: "/arcade/snake-sorting/snakes/rust.webp",
    clues: [
      { probe: "scales", label: "Neonate scales", text: "A cherry-red neonate — the black dorsal markings broken into rough, rusty blocks." },
      { probe: "crown", label: "Head", text: "Head washed rust-red, dark only along the jawline." },
      { probe: "origin", label: "Homeland", text: "Island canopy, salt wind off the Cenderawasih sea." },
    ],
    deepScan: "Red baby, broken black blocks down the spine. The island house again.",
    lesson:
      "Azurea's island animals all wear black — but Biak splits them three ways by pattern. Broken dorsal blocks on red: Azurea, Biak division.",
  },
  {
    id: "spark",
    name: "“Spark”",
    house: "azurea",
    locality: "Biak",
    neonate: "red",
    photo: "/arcade/snake-sorting/snakes/spark.webp",
    photoAlt: "/arcade/snake-sorting/snakes/spark-alt.webp",
    isNeonate: true,
    clues: [
      { probe: "scales", label: "Neonate scales", text: "A fire-red neonate — fine black speckling dusted over every scale." },
      { probe: "crown", label: "Head", text: "A tiny crown, already going dark at the snout." },
      { probe: "origin", label: "Homeland", text: "Fresh from an island clutch — still on the perch it hatched on." },
    ],
    deepScan: "Neonate on the perch, red with black dusting, island clutch. Azurea.",
    lesson:
      "A visible neonate means no wager — the Hat reads the baby straight. Red with black dusting from an island clutch: House Azurea.",
  },
  {
    id: "ash",
    name: "“Ash”",
    house: "azurea",
    locality: "Biak",
    neonate: "red",
    photo: "/arcade/snake-sorting/snakes/ash.webp",
    isNeonate: true,
    clues: [
      { probe: "scales", label: "Neonate scales", text: "A smoky red neonate — the black markings blurred like ash over embers." },
      { probe: "crown", label: "Head", text: "A dusky crown, dark smudges behind the eyes." },
      { probe: "origin", label: "Homeland", text: "An island clutch, photographed days out of the egg." },
    ],
    deepScan: "Days old, smoky red, blurred black marks. The island house.",
    lesson:
      "Blurred, ashy black on a red neonate is Azurea's island fingerprint — Biak division.",
  },
  {
    id: "glacier",
    name: "“Glacier”",
    house: "utaraensis",
    locality: "Jayapura",
    neonate: "yellow",
    photo: "/arcade/snake-sorting/snakes/glacier.webp",
    clues: [
      { probe: "scales", label: "Adult scales", text: "Green dorsum split by a teal-blue vertebral stripe." },
      { probe: "crown", label: "Head", text: "White labial scales and a pale, almost frosted crown." },
      { probe: "origin", label: "Homeland", text: "North-coast lowlands, humid air, morning mist off the bay." },
    ],
    deepScan: "Blue vertebral stripe + high white on the north coast. That combination belongs to one house alone.",
    lesson:
      "Blue striping down the back with high white markings is the Utaraensis signature — the blue stripe never lies.",
  },
  {
    id: "zephyr",
    name: "“Zephyr”",
    house: "utaraensis",
    locality: "Jayapura",
    neonate: "yellow",
    photo: "/arcade/snake-sorting/snakes/zephyr.webp",
    clues: [
      { probe: "scales", label: "Neonate scales", text: "A yellow neonate — the blue vertebral stripe thin and broken by wind-blown gaps." },
      { probe: "crown", label: "Head", text: "A clean green crown, white only at the lip line." },
      { probe: "origin", label: "Homeland", text: "A bay on the north coast — humid air, mist off the water." },
    ],
    deepScan: "North coast, yellow baby, thin broken blue stripe. Utaraensis.",
    lesson:
      "Even a thin, broken blue stripe marks the north-coast house — Jayapura answers to Utaraensis.",
  },
  {
    id: "lumen",
    name: "“Lumen”",
    house: "utaraensis",
    locality: "Lereh",
    neonate: "yellow",
    photo: "/arcade/snake-sorting/snakes/lumen.webp",
    photoAlt: "/arcade/snake-sorting/snakes/lumen-alt.webp",
    clues: [
      { probe: "scales", label: "Neonate scales", text: "Yellow neonate — a thin blue seam already splitting the dorsum." },
      { probe: "crown", label: "Head", text: "Clean green crown, white lips just beginning to show." },
      { probe: "origin", label: "Homeland", text: "Lowland forest on the north coast, rivers slow and wide." },
    ],
    deepScan: "Yellow baby, blue seam on the dorsum, northern lowlands. Northern blood, Utaraensis.",
    lesson:
      "The yellow tempted you south toward Viridis — but the blue seam never lies, and Lereh is northern ground. House Utaraensis.",
  },
  {
    id: "mistral",
    name: "“Mistral”",
    house: "utaraensis",
    locality: "Cyclops",
    neonate: "yellow",
    photo: "/arcade/snake-sorting/snakes/mistral.webp",
    clues: [
      { probe: "scales", label: "Neonate scales", text: "Yellow neonate — white lateral dashes already showing through the gold." },
      { probe: "crown", label: "Head", text: "Pale snout with white flecks dusting the crown." },
      { probe: "origin", label: "Homeland", text: "Foothills rising steep behind the north coast." },
    ],
    deepScan: "A yellow baby flashing high white this early, from the steep foothills behind the north coast. Northern mainland blood — Utaraensis.",
    lesson:
      "Yellow hatchlings come from every house — that is the trap. But high white this early, blue tones on the crown, and the Cyclops foothills of the northern mainland: only House Utaraensis wears that combination.",
  },
  {
    id: "tempest",
    name: "“Tempest”",
    house: "utaraensis",
    locality: "Cyclops",
    neonate: "red",
    photo: "/arcade/snake-sorting/snakes/tempest.webp",
    clues: [
      { probe: "scales", label: "Neonate scales", text: "Red neonate — black edging on every dorsal scale, straight out of the island playbook." },
      { probe: "crown", label: "Head", text: "A dark cap over the crown — but blue ghosts beneath the black." },
      { probe: "origin", label: "Homeland", text: "Foothills rising steep behind the north coast." },
    ],
    deepScan: "Red baby, black-edged scales, steep north-coast foothills. The black tempted you toward Azurea — but island black never touches the mainland. Northern blood: Utaraensis.",
    lesson:
      "The cruelest trap in the ceremony: a red baby with black edging, straight out of the Azurea playbook. But Azurea never touches the mainland — Cyclops is northern ground, and the blue ghosting under the black is pure Utaraensis.",
  },
  {
    id: "cyclops-3",
    name: "Cyclops",
    house: "utaraensis",
    locality: "Cyclops",
    neonate: "red",
    photo: "/arcade/snake-sorting/snakes/cyclops-3.webp",
    clues: [
      { probe: "scales", label: "Adult scales", text: "Deep green coils, blue washing the flanks, white-gold flecks scattered throughout." },
      { probe: "crown", label: "Head", text: "A broad green crown — gold dusting the snout, blue creeping up the neck." },
      { probe: "origin", label: "Homeland", text: "Foothills rising steep behind the north coast." },
    ],
    deepScan: "Red-hatched, blue-flanked adult from the steep north-coast foothills. Northern mainland blood: Utaraensis.",
    lesson:
      "A red baby turned blue-flanked northern adult — the Cyclops Utaraensis arc.",
  },
  {
    id: "yapen-1",
    name: "Yapen",
    house: "utaraensis",
    locality: "Yapen",
    neonate: "yellow",
    photo: "/arcade/snake-sorting/snakes/yapen-1.webp",
    isNeonate: true,
    clues: [
      { probe: "scales", label: "Neonate scales", text: "Yellow neonate — rust-red markings traced in white, scattered like broken chain links." },
      { probe: "crown", label: "Head", text: "A yellow crown with rust-red bleeding back from the eyes." },
      { probe: "origin", label: "Homeland", text: "A small island off New Guinea's north coast — isolated canopy, monsoon winds." },
    ],
    deepScan: "Yellow baby, white-traced red markings, a northern island isolate. The far north keeps its own: Utaraensis.",
    lesson:
      "White-traced red on a yellow neonate from a northern island — the Yapen signature, House Utaraensis.",
  },

  {
    id: "topaz",
    name: "“Topaz”",
    house: "pulcher",
    locality: "Sorong",
    neonate: "yellow",
    photo: "/arcade/snake-sorting/snakes/topaz.webp",
    photoAlt: "/arcade/snake-sorting/snakes/topaz-alt.webp",
    clues: [
      { probe: "scales", label: "Adult scales", text: "Two years old and still glowing yellow-green — the yellow refuses to leave." },
      { probe: "crown", label: "Head", text: "Blue tones bleed from the crown down into the neck." },
      { probe: "origin", label: "Homeland", text: "Lowland forest on the Bird's Head Peninsula." },
    ],
    deepScan: "Yellow retention plus blue bleeding down the neck, Bird's Head lowlands. Western gold, blue-kissed: Pulcher.",
    lesson:
      "Clean yellow retention with blue tones is what western breeders prize most — the defining Pulcher combination, from the Bird's Head lowlands around Sorong.",
  },
  {
    id: "sorong-2",
    name: "Sorong",
    house: "pulcher",
    locality: "Sorong",
    neonate: "red",
    photo: "/arcade/snake-sorting/snakes/sorong-2.webp",
    clues: [
      { probe: "scales", label: "Adult scales", text: "Blue-green coils wound tight — the red baby long gone, but the island blue stayed." },
      { probe: "crown", label: "Head", text: "Head buried deep in the coil — a blue-washed crown glimpsed between the loops." },
      { probe: "origin", label: "Homeland", text: "Lowland forest on the western peninsula — hot, wet Bird's Head country." },
    ],
    deepScan: "Red-hatched, blue-washed adult from the western peninsula lowlands. Only one house wears that combination: Pulcher.",
    lesson:
      "A red-hatched baby that kept its blue into adulthood — the Sorong Pulcher signature.",
  },

  {
    id: "copper",
    name: "“Copper”",
    house: "pulcher",
    locality: "Manokwari",
    neonate: "red",
    photo: "/arcade/snake-sorting/snakes/copper.webp",
    photoAlt: "/arcade/snake-sorting/snakes/copper-alt.webp",
    clues: [
      { probe: "scales", label: "Neonate scales", text: "Red neonate — blue vertebral dashes marching down the spine." },
      { probe: "crown", label: "Head", text: "A rust-red crown washed with blue at the edges." },
      { probe: "origin", label: "Homeland", text: "Coastal lowlands on the Bird's Head — sea air, mangrove at the forest edge." },
    ],
    deepScan: "Red baby, blue dashes down the spine, Bird's Head coast. Western blood, Pulcher.",
    lesson:
      "Red tempted you toward Azurea — but Azurea wears black where Pulcher wears blue. Coastal Bird's Head with blue dashes: House Pulcher, the Manokwari division.",
  },
  {
    id: "amber",
    name: "“Amber”",
    house: "pulcher",
    locality: "Manokwari",
    neonate: "yellow",
    photo: "/arcade/snake-sorting/snakes/amber.webp",
    clues: [
      { probe: "scales", label: "Neonate scales", text: "A honey-gold neonate — sky-blue vertebral dashes marching down the spine." },
      { probe: "crown", label: "Head", text: "A golden crown, blue dusting at the temples." },
      { probe: "origin", label: "Homeland", text: "Bird's Head coast — western lowlands, salt on the wind." },
    ],
    deepScan: "Yellow baby, blue dashes, Bird's Head coast. Pulcher's golden division.",
    lesson:
      "Yellow tempts toward Utaraensis — but blue dashes on the Bird's Head coast belong to Pulcher. Manokwari division.",
  },
  {
    id: "dune",
    name: "“Dune”",
    house: "pulcher",
    locality: "Manokwari",
    neonate: "yellow",
    photo: "/arcade/snake-sorting/snakes/dune.webp",
    clues: [
      { probe: "scales", label: "Neonate scales", text: "A pale yellow neonate — the blue dashes stretched into long desert streaks." },
      { probe: "crown", label: "Head", text: "A sand-pale crown, faint blue at the jaw." },
      { probe: "origin", label: "Homeland", text: "Western New Guinea — sea-level forest, salt on the wind." },
    ],
    deepScan: "Pale yellow, long blue streaks, western lowlands. Pulcher again.",
    lesson:
      "Long blue streaks instead of dashes — still the Bird's Head coast, still House Pulcher.",
  },
  {
    id: "prairie",
    name: "“Prairie”",
    house: "pulcher",
    locality: "Manokwari",
    neonate: "yellow",
    photo: "/arcade/snake-sorting/snakes/prairie.webp",
    clues: [
      { probe: "scales", label: "Neonate scales", text: "A yellow neonate with bold blue chevrons marching down the back." },
      { probe: "crown", label: "Head", text: "A broad golden crown, blue edging along the lips." },
      { probe: "origin", label: "Homeland", text: "Western lowlands — the western door of New Guinea." },
    ],
    deepScan: "Yellow baby, blue chevrons, western lowlands. Pulcher.",
    lesson:
      "Chevrons or dashes, the blue-on-gold of the Bird's Head coast always answers to House Pulcher.",
  },
  {
    id: "pip",
    name: "“Pip”",
    house: "pulcher",
    locality: "Manokwari",
    neonate: "yellow",
    photo: "/arcade/snake-sorting/snakes/pip.webp",
    isNeonate: true,
    clues: [
      { probe: "scales", label: "Neonate scales", text: "A butter-yellow neonate — tiny blue flecks scattered like seed." },
      { probe: "crown", label: "Head", text: "A small bright crown, barely any dark yet." },
      { probe: "origin", label: "Homeland", text: "A western clutch — still curled where it hatched." },
    ],
    deepScan: "A visible neonate, butter-yellow with blue flecks, Bird's Head. Pulcher.",
    lesson:
      "No wager on a visible baby — but the blue flecks give it away anyway. Manokwari: House Pulcher.",
  },
  {
    id: "ivory",
    name: "“Ivory”",
    house: "viridis",
    locality: "Aru",
    neonate: "yellow",
    photo: "/arcade/snake-sorting/snakes/ivory.webp",
    clues: [
      { probe: "scales", label: "Neonate scales", text: "Yellow neonate with bold white dorsal dashes like ivory inlay." },
      { probe: "crown", label: "Head", text: "High-white crown dusted with black speckles." },
      { probe: "origin", label: "Homeland", text: "Island canopy in the far south, monsoon on the wind." },
    ],
    deepScan: "Southern islands, yellow baby, high white plus black speckles. The ancient southern combination: Viridis.",
    lesson:
      "High white AND high black together on a southern island animal — the classic Viridis look, from the Aru Islands.",
  },
  {
    id: "meridian",
    name: "“Meridian”",
    house: "viridis",
    locality: "Merauke",
    neonate: "yellow",
    photo: "/arcade/snake-sorting/snakes/meridian.webp",
    clues: [
      { probe: "scales", label: "Neonate scales", text: "Yellow neonate with heavy black lateral blotching." },
      { probe: "crown", label: "Head", text: "Black-speckled head with striking white lips." },
      { probe: "origin", label: "Homeland", text: "Forest edge near the southern savanna, hot and bright." },
    ],
    deepScan: "Southern savanna edge, heavy black blotching, white lips. The southernmost house.",
    lesson:
      "The southernmost blood in the game. Heavy black lateral blotching with white lips near Merauke is House Viridis at its most classic.",
  },
  {
    id: "merauke-2",
    name: "Merauke",
    house: "viridis",
    locality: "Merauke",
    neonate: "yellow",
    photo: "/arcade/snake-sorting/snakes/merauke-2.webp",
    isNeonate: true,
    clues: [
      { probe: "scales", label: "Neonate scales", text: "Yellow neonate — dark dorsal dashes marching down a gold back." },
      { probe: "crown", label: "Head", text: "A gold crown, dark flecks reaching all the way to the snout." },
      { probe: "origin", label: "Homeland", text: "Far southern lowlands — swamp forest near the south coast." },
    ],
    deepScan: "Yellow baby, dark-marked, deep southern lowlands. Viridis, no contest.",
    lesson:
      "Dark-marked yellow neonate from the deep south — Merauke Viridis.",
  },
  {
    id: "merauke-3",
    name: "Merauke",
    house: "viridis",
    locality: "Merauke",
    neonate: "yellow",
    photo: "/arcade/snake-sorting/snakes/merauke-3.webp",
    isNeonate: true,
    clues: [
      { probe: "scales", label: "Neonate scales", text: "Yellow hatchling — still half in the egg, rust saddles already painted on." },
      { probe: "crown", label: "Head", text: "A tiny gold crown pushing out of the shell." },
      { probe: "origin", label: "Homeland", text: "A southern clutch — lowland swamp forest at the bottom of the island." },
    ],
    deepScan: "Yellow straight out of the egg, from a deep-southern clutch. Viridis.",
    lesson:
      "Yellow hatchlings in a southern clutch — Merauke Viridis, straight from the shell.",
  },
  {
    id: "merauke-4",
    name: "Merauke",
    house: "viridis",
    locality: "Merauke",
    neonate: "yellow",
    photo: "/arcade/snake-sorting/snakes/merauke-4.webp",
    clues: [
      { probe: "scales", label: "Adult scales", text: "Green coils with a dotted white line running down the spine." },
      { probe: "crown", label: "Head", text: "A calm green crown, dark eyes, white lips." },
      { probe: "origin", label: "Homeland", text: "Forest edge near the southern savanna — hot, bright, far south." },
    ],
    deepScan: "Yellow-hatched, white-dotted green adult from the far southern edge. The southernmost house: Viridis.",
    lesson:
      "White vertebral dots on a southern green adult — Merauke Viridis.",
  },
  {
    id: "ghost",
    name: "“Ghost”",
    house: "viridis",
    locality: "Aru",
    neonate: "yellow",
    photo: "/arcade/snake-sorting/snakes/ghost.webp",
    clues: [
      { probe: "scales", label: "Juvenile scales", text: "A near-white juvenile — black vertebral dashes floating on ivory." },
      { probe: "crown", label: "Head", text: "A pale, ghost-like crown, barely any dark at all." },
      { probe: "origin", label: "Homeland", text: "A southern archipelago — low islands, monsoon winds." },
    ],
    deepScan: "Extreme high white from the southern archipelago. Only the southern house washes out this pale.",
    lesson:
      "When a southern animal goes this pale, there is no mistaking it: extreme high white from Aru is House Viridis, the ghost division.",
  },
  {
    id: "willow",
    name: "“Willow”",
    house: "viridis",
    locality: "Aru",
    neonate: "yellow",
    photo: "/arcade/snake-sorting/snakes/willow.webp",
    clues: [
      { probe: "scales", label: "Neonate scales", text: "A yellow neonate with a thin white vertebral thread over powder-blue flanks." },
      { probe: "crown", label: "Head", text: "A crown brushed willow-green, faint white lips." },
      { probe: "origin", label: "Homeland", text: "The far southern archipelago — low islands on a wide sea." },
    ],
    deepScan: "Southern islands, yellow baby, white thread on powder blue. Viridis.",
    lesson:
      "The white vertebral thread over blue-green is the Aru Viridis signature — the southern house, willow division.",
  },
  {
    id: "fern",
    name: "“Fern”",
    house: "viridis",
    locality: "Aru",
    neonate: "yellow",
    photo: "/arcade/snake-sorting/snakes/fern.webp",
    clues: [
      { probe: "scales", label: "Neonate scales", text: "A yellow neonate — white spots scattered like fallen petals, no clear pattern." },
      { probe: "crown", label: "Head", text: "A green crown, white flecks dusting the snout." },
      { probe: "origin", label: "Homeland", text: "The far southern archipelago — low islands on a wide sea." },
    ],
    deepScan: "Southern islands, yellow baby, scattered white petals. Viridis.",
    lesson:
      "Scattered white without a pattern still reads southern — the Aru Viridis look, fern division.",
  },
  {
    id: "aru-5",
    name: "Aru",
    house: "viridis",
    locality: "Aru",
    neonate: "yellow",
    photo: "/arcade/snake-sorting/snakes/aru-5.webp",
    clues: [
      { probe: "scales", label: "Adult scales", text: "Green coils dusted with white — southern confetti on every loop." },
      { probe: "crown", label: "Head", text: "Head resting low in the coils — a calm green crown, pale lips." },
      { probe: "origin", label: "Homeland", text: "A southern archipelago — low islands, monsoon winds." },
    ],
    deepScan: "Yellow-hatched, white-dusted green adult from the far southern islands. The ancient southern combination: Viridis.",
    lesson:
      "Yellow baby, white-dusted green, far southern islands — the Aru Viridis look.",
  },
  /* ---- Wildcard division: designer morphs and hybrid crosses join here as
     their photos arrive. Only the wildcard hard mode deals these; the
     classic ceremony never sees them. ---- */
];

/* ------------------------------ Hat dialogue ----------------------------- */
/** Wildcard hard mode ships in code but stays hidden until Gage flips this. */
export const WILDCARD_ENABLED = false;

export const HAT_LINES = {
  greetings: [
    "Ahh... a new keeper steps into my chamber. I am the Sorting Hat — seer of scales, reader of bloodlines.",
    "Bring me your serpents, keeper. One by one, I shall tell you where each truly belongs.",
    "Ten serpents wait upon my dais. Probe them well — a hat is only as wise as its keeper's eyes.",
  ],
  arrive: [
    "Place the serpent upon the dais... steady now. Let me have a look at this one.",
    "Another coil for the dais. Come closer, little one — the Hat sees all.",
    "Hmm, what have we here? Up onto the dais with you.",
  ],
  scanIntro: [
    "Three probes, keeper — Scales, Crown, Origin. Choose where my gaze shall fall.",
    "My eyes are old but sharp. Probe the Scales, the Crown, the Origin — then we shall sort.",
  ],
  neonateIntro: [
    "Round one, keeper — a small wager before the probes. Was this serpent born red as ember, or yellow as morning sun? +25 for a true call.",
    "Before we probe, a gambler's question. Red or yellow — what color was this serpent's first dawn? Call it true for +25.",
  ],
  neonateCorrect: [
    "Born {actual} — and you called it! The wager is yours, keeper.",
    "A true call! This one hatched {actual}. +25 to the keeper with the eye.",
  ],
  neonateWrong: [
    "{picked}, you say? No — this serpent hatched {actual}. The probes will teach you.",
    "A miss! {actual} was its first color. No shame — the wager was only ever small.",
  ],
  neonateVisible: [
    "A babe on the dais — its first color is right there before your eyes. No wager on this one, keeper; straight to the probes.",
    "The neonate sits before you, plain as day. No points for calling what you can see — on to the probes.",
  ],
  probeDone: [
    "Noted... noted. What else shall we examine?",
    "Mmm, interesting. Probe deeper, keeper.",
    "The picture sharpens. One more probe, perhaps?",
  ],
  allProbed: [
    "The serpent is laid bare. Now — call its House!",
    "I have seen enough. Speak, keeper: which House claims this blood?",
  ],
  earlyCall: [
    "Bold! Calling it with sight unseen — the Hat respects a gambler.",
    "No more probing? Then trust your eyes, keeper. Speak its House!",
    "Hasty... or brilliant? The dais holds its breath.",
    "You would sort on half the evidence? Very well — the Hat loves nerve.",
  ],
  deliberating: [
    "Hmm... let me turn this one over in my brim...",
    "Scales don't lie, but they do love to tease...",
    "Quiet now. The Hat is thinking...",
    "Bloodlines whisper... let me listen...",
  ],
  correctHouse: {
    azurea: "Island blood runs true! The black-scaled isle calls it home!",
    utaraensis: "The blue stripe never lies — northern blood, through and through!",
    pulcher: "Western gold, blue-kissed! A true Pulcher!",
    viridis: "Ancient southern lines — the one true Viridis!",
    designer: "No map, no homeland — this blood was mixed by human hands! A true wildcard!",
  } as Record<HouseId, string>,
  wrongHouse: [
    "Oof. Even a blind skink saw that one coming.",
    "My brim itches... that was no {picked}. This beauty wears {correct} colors.",
    "A bold call, keeper — and a wrong one. {correct}, plain as day.",
  ],
  localityPrompt: [
    "The Hat senses more... name the native haunts — the homeland this blood is believed to hail from — and earn the True Local's bounty.",
    "House claimed! But can you call its native haunts? The Hat is listening...",
  ],
  localityCorrect: [
    "TRUE LOCAL! {locality} blood, through and through!",
    "{locality}! The Hat bows to your eye, keeper.",
  ],
  localityWrong: [
    "Close, keeper — but this one hailed from {locality}.",
    "A fine guess, but no. {locality} is written in these scales.",
  ],
  streak2: "Two in a row — the Hat is impressed.",
  streak3: "Three! A hat-trick of sorts!",
  streak5: "Five straight! The chamber itself applauds.",
  deepScan: "You ask for my deeper sight... very well. (-25 pts)",
  farewell: {
    master: "The chamber falls silent. Even the candles bow. You sort like the Hat itself, keeper.",
    sage: "A keen eye, keeper. The bloodlines whisper your name now.",
    scholar: "Solid sorting. A few more ceremonies and the Hat may retire.",
    coilkeeper: "Not bad, keeper — but the Hat has seen sharper eyes.",
    hatchling: "We all start as hatchlings. Come back and probe deeper next time.",
  },
};

export interface Rank {
  min: number;
  title: string;
  blurb: string;
}

export const RANKS: Rank[] = [
  { min: 1800, title: "Sorting Master", blurb: "The Hat itself could not have done better." },
  { min: 1400, title: "Serpent Sage", blurb: "The bloodlines whisper your name." },
  { min: 1000, title: "Scale Scholar", blurb: "A trained, trustworthy eye." },
  { min: 600, title: "Coilkeeper", blurb: "Steady hands, learning eyes." },
  { min: 0, title: "Hatchling", blurb: "Every master was once a hatchling." },
];

export function rankFor(score: number): Rank {
  return RANKS.find((r) => score >= r.min) ?? RANKS[RANKS.length - 1];
}

export const CEREMONY_SNAKES = 10;
export const HOUSE_POINTS = 100;
export const LOCALITY_POINTS = 50;
/* Round One: the neonate-color wager. Small points, decided before a
   single probe is spent. House Viridis is excluded — it hatches only
   yellow, so there is no wager to make. */
export const NEONATE_POINTS = 25;
export const DEEP_SCAN_COST = 25;
/* Early-call bonus: +25 for each probe left unrevealed when the House is
   called. Blind call (0 probes) = +75. Deep Scan forfeits it. */
export const EARLY_BONUS_PER_PROBE = 25;
export const MAX_SPEED_BONUS = 50;
export const SPEED_BONUS_WINDOW_MS = 30_000;

export function speedBonus(ms: number): number {
  if (ms >= SPEED_BONUS_WINDOW_MS) return 0;
  return Math.round(MAX_SPEED_BONUS * (1 - ms / SPEED_BONUS_WINDOW_MS));
}

export const BEST_CEREMONY_KEY = "snake_sorting_best_ceremony_v1";
export const BEST_ENDLESS_KEY = "snake_sorting_best_endless_v1";
export const BEST_WILDCARD_KEY = "snake_sorting_best_wildcard_v1";
export const PILE_BEST_KEY = "snake_sorting_best_piles_v1";

/* ------------------------- Pile-sort mode (photo piles) ------------------------- */
export const PILE_SORT_COUNT = 8;
export const PILE_CORRECT_POINTS = 100;
export const PILE_WRONG_PENALTY = 25;

/** Deal for the pile-sort mode: only serpents with photos on the table. */
export function pileSortDeal(count: number = PILE_SORT_COUNT): SortingSnake[] {
  return shuffle(SNAKES.filter((s) => s.photo))
    .slice(0, count)
    .map(photoForDeal);
}

/* ------------------------------------------------------------------ */
/* Daily Hat challenge — one fixed deal per calendar day, identical    */
/* for every keeper. A hint from the Hat costs points, once per game.  */
/* ------------------------------------------------------------------ */

export const PILE_HINT_COST = 50;

/** FNV-1a string hash — turns a date key into a numeric seed. */
export function hashSeed(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Deterministic PRNG so the daily deal shuffles identically everywhere. */
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

export function seededShuffle<T>(arr: T[], rand: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Local calendar day as "YYYY-MM-DD" — the daily deal's identity. */
export function dailyDealKey(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

/** "2026-09-29" -> "Sep 29" for display. */
export function prettyDailyKey(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  if (!y || !m || !d) return key;
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function dailyBestKey(key: string): string {
  return `${PILE_BEST_KEY}:daily:${key}`;
}

export function pileSortDailyDeal(key: string, count: number = PILE_SORT_COUNT): SortingSnake[] {
  const rand = mulberry32(hashSeed(`pile-daily:${key}`));
  return seededShuffle(
    SNAKES.filter((s) => s.photo),
    rand,
  )
    .slice(0, count)
    .map(photoForDeal);
}

export function readBest(key: string): number {
  try {
    const raw = window.localStorage.getItem(key);
    const n = raw == null ? 0 : parseInt(raw, 10);
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

export function writeBest(key: string, value: number): void {
  try {
    window.localStorage.setItem(key, String(value));
  } catch {
    /* private mode etc. — ignore */
  }
}

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Serpents eligible for a mode: the wildcard division only walks in hard mode. */
export function bankForMode(mode: GameMode): SortingSnake[] {
  return mode === "wildcard"
    ? [...SNAKES]
    : SNAKES.filter((s) => s.house !== "designer");
}

/** Sort options for a mode: the 5th option only exists in wildcard hard mode. */
export function sortHousesForMode(mode: GameMode): House[] {
  return mode === "wildcard" ? HOUSES : HOUSES.filter((h) => h.id !== "designer");
}

/**
 * When a serpent carries an alternate photo of the same animal, the deal
 * picks one for this game — the two never share a lineup.
 */
export function photoForDeal(s: SortingSnake): SortingSnake {
  if (s.photoAlt && Math.random() < 0.5) return { ...s, photo: s.photoAlt };
  return s;
}

/**
 * Build a ceremony order. Wildcard hard mode guarantees at least two
 * designer animals in the mix — otherwise the 5th option would be a
 * decoration instead of a threat.
 */
export function ceremonyOrder(mode: GameMode, count: number): SortingSnake[] {
  if (mode === "wildcard") {
    const wild = shuffle(SNAKES.filter((s) => s.house === "designer"));
    const pure = shuffle(SNAKES.filter((s) => s.house !== "designer"));
    const guaranteed = wild.slice(0, Math.min(2, wild.length));
    return shuffle([...guaranteed, ...pure.slice(0, Math.max(0, count - guaranteed.length))]).map(
      photoForDeal,
    );
  }
  return shuffle(bankForMode(mode)).slice(0, count).map(photoForDeal);
}
