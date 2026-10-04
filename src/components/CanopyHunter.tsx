"use client";

import Image from "next/image";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  EXPEDITION_SEARCHES,
  EXPEDITION_RANK_LINES,
  CANOPY_LOCALITIES,
  CANOPY_REGION_PLANTS,
  CANOPY_REGION_TREES,
  SHED_FIND_CHANCE,
  SHED_FIND_CHANCE_SLOUGHING,
  PYTHONS_PER_GROVE,
  TRAIL_SIGN_LABELS,
  atmosphereForRegion,
  createGroveSpots,
  examineShedClue,
  generateWildSnake,
  loadCanopyCodex,
  nightPhaseForLeg,
  nightfallForLeg,
  PERMIT_GROVES,
  PERMIT_TOKENS,
  randomEscapeLine,
  randomShedLine,
  recordCanopyCodex,
  rollBatSwarm,
  rollEmptyTrailSign,
  rollLifeStage,
  rollNightEvent,
  rollPythonTrailSign,
  rollRegion,
  rollShedFind,
  rollZoneCenter,
  scoreExpedition,
  sweepMsForLeg,
  type CanopyAtmosphere,
  type CanopyLifeStage,
  type CanopyLocality,
  type CanopyRegion,
  type CanopySex,
  type ExpeditionRank,
  type GroveSpot,
  type NightEventKind,
  type TrailSignKind,
  type WildSnake,
} from "@/lib/canopy-hunter";
import {
  CANOPY_THEME_SRC,
  CANOPY_THEME_VOLUME,
  isGameMusicMuted,
  playGameMusic,
  setGameMusicMuted,
  stopGameMusic,
} from "@/lib/game-music";
import { playHankScaleLine } from "@/lib/hank-scale-voice";
import { addTokens, getTokenBalance, recordScore, reportArcadeEvent, spendTokens } from "@/lib/arcade";
import { ChondroSnakeIcon } from "@/components/ChondroSnakeIcon";
import { PortTraderShop, type PortShopView } from "@/components/PortTraderShop";
import type { PortTraderItem as PortItem, PortTraderItemId as PortItemId } from "@/components/PortTraderShop";
import type { TrailFind } from "@/components/PortTraderShop";

type Phase = "briefing" | "trail" | "grove" | "catch" | "results" | "port";

/* ------------------------------------------------------------------ */
/* River port (Phase 1 playtest — gated behind portStopEnabled)        */
/* ------------------------------------------------------------------ */


interface PortBounty {
  locality: CanopyLocality;
  sex: CanopySex;
}

const PORT_DUSK_ART = "/arcade/canopy-hunter/port-river-dusk.webp";

/** Trader stock — three of the four are on the table each visit; buy at most two. */
const PORT_ITEMS: PortItem[] = [
  {
    id: "lantern-oil",
    name: "Lantern Oil",
    cost: 4,
    desc: "+1 search in the next grove",
    emoji: "🏮",
    iconSrc: "/arcade/canopy-hunter/icon-lantern-oil.webp",
  },
  {
    id: "scent-lure",
    name: "Scent Lure",
    iconSrc: "/arcade/canopy-hunter/icon-scent-lure.webp",
    cost: 10,
    desc: "A lure charge for the next grove",
    emoji: "🍃",
  },
  {
    id: "sure-grip",
    name: "Sure Grip",
    iconSrc: "/arcade/canopy-hunter/icon-sure-grip.webp",
    cost: 10,
    desc: "Next grab cannot miss",
    emoji: "✊",
  },
  {
    id: "local-intel",
    name: "Local Intel",
    iconSrc: "/arcade/canopy-hunter/icon-local-intel.webp",
    cost: 6,
    desc: "The next fork tells the truth — and whispers the python's height",
    emoji: "🧭",
  },
];

/** Trail pickups — glinting finds on the walk between groves. The trader buys them. */
const TRAIL_FINDS: TrailFind[] = [
  { id: "dead-leaf", name: "Dead Leaf", value: 1, icon: "/arcade/canopy-hunter/item-dead-leaf.webp" },
  { id: "bark-pile", name: "Bark Shards", value: 1, icon: "/arcade/canopy-hunter/item-bark-pile.webp" },
  { id: "rope-coil", name: "Rope Coil", value: 1, icon: "/arcade/canopy-hunter/item-rope-coil.webp" },
  { id: "bamboo", name: "Bamboo Cuts", value: 1, icon: "/arcade/canopy-hunter/item-bamboo.webp" },
  { id: "blue-rock", name: "River Stone", value: 1, icon: "/arcade/canopy-hunter/item-blue-rock.webp" },
  { id: "black-rock", name: "Basalt Chunk", value: 1, icon: "/arcade/canopy-hunter/item-black-rock.webp" },
  { id: "monstera", name: "Monstera Leaf", value: 2, icon: "/arcade/canopy-hunter/item-monstera.webp" },
  { id: "green-berries", name: "Green Fig Cluster", value: 2, icon: "/arcade/canopy-hunter/item-green-berries.webp" },
  { id: "red-berries", name: "Red Berry Sprig", value: 2, icon: "/arcade/canopy-hunter/item-red-berries.webp" },
  { id: "feather", name: "Bird of Paradise Feather", value: 2, icon: "/arcade/canopy-hunter/item-feather.webp" },
  { id: "mossy-log", name: "Mossy Log", value: 2, icon: "/arcade/canopy-hunter/item-mossy-log.webp" },
  { id: "rope-nest", name: "Vine Nest", value: 2, icon: "/arcade/canopy-hunter/item-rope-nest.webp" },
  { id: "pitcher-plant", name: "Pitcher Plant", value: 3, icon: "/arcade/canopy-hunter/item-pitcher-plant.webp" },
  { id: "bromeliad", name: "Bromeliad Bloom", value: 3, icon: "/arcade/canopy-hunter/item-bromeliad.webp" },
  { id: "orchid", name: "Moon Orchid", value: 3, icon: "/arcade/canopy-hunter/item-orchid.webp" },
  { id: "shelf-fungi", name: "Shelf Fungi", value: 3, icon: "/arcade/canopy-hunter/item-shelf-fungi.webp" },
  { id: "amber", name: "Amber Chunk", value: 3, icon: "/arcade/canopy-hunter/item-amber.webp" },
  { id: "snake-shed", name: "Shed Skin", value: 3, icon: "/arcade/canopy-hunter/item-snake-shed.webp" },
];

/** Rarity-weighted find roll: commons show up most, rares are a treat. */
function rollTrailFindId(): string {
  const r = Math.random();
  const tier = r < 0.6 ? 1 : r < 0.9 ? 2 : 3;
  const pool = TRAIL_FINDS.filter((f) => f.value === tier);
  return pool[Math.floor(Math.random() * pool.length)].id;
}

const BOATMAN_LINES: Record<string, string> = {
  cenderawasih:
    "“The Cenderawasih swallows whole rivers and gives back snakes. Biak boys hunt it by lamplight — you'd fit right in.”",
  "birds-head":
    "“Bird's Head rain comes sideways and stays. The Arfak road's drowned to the axles — take my boat or stay poor.”",
  highlands:
    "“Highlands boats ride low and slow. Cyclops throws boulders at strangers, but the snakes don't mind strangers.”",
  southern:
    "“Southern water's black as tea and twice as strong. Merauke men swear the Aru pythons swim — I don't ask.”",
  default:
    "“River's kind tonight, Gage. Next leg's darker than the last — keep your lamp dry.”",
};

const SWEEP_MS = 1200;
const ZONE_HALF = 0.11; // 22% green zone

const GROVES_PER_EXPEDITION = 4;
const TREES_PER_GROVE = 3;
/** Searches refresh at every grove: each grove is always reachable, and the
 *  choice is which hiding spots to spend them on. */
const SEARCHES_PER_GROVE = EXPEDITION_SEARCHES / GROVES_PER_EXPEDITION;

// Keyed variants: edge-connected black flood-filled to transparent at build
// time, so the art composites solidly with normal blending (no screen-blend
// ghosting on the dark trail).
const TREE_ARTS = [
  "/arcade/canopy-hunter/tree-keyed.webp",
  "/arcade/canopy-hunter/tree-2-keyed.webp",
  "/arcade/canopy-hunter/tree-3-keyed.webp",
];
const BANNER_ART = "/arcade/canopy-hunter/canopy-banner.webp";
const CATCH_ART = "/arcade/canopy-hunter/catch-backdrop.webp";
const PATH_ART = "/arcade/canopy-hunter/path-night.webp";
const PATH_FORK_2_ART = "/arcade/canopy-hunter/path-fork-2.webp";
const PATH_FORK_3_ART = "/arcade/canopy-hunter/path-fork-3.webp";

/** The path backdrop matches the decision: straight trail, two-way fork, or three-way split. */
function pathArtForTrailCount(count: number): string {
  if (count === 2) return PATH_FORK_2_ART;
  if (count >= 3) return PATH_FORK_3_ART;
  return PATH_ART;
}
const EXPLORER_ART = "/arcade/canopy-hunter/explorer-back-standing.webp";
const FOREGROUND_ART = "/arcade/canopy-hunter/foreground-branches.webp";
/** Unused coiled-python illustration, repurposed as the results-screen quarry art. */
const PYTHON_ART = "/arcade/canopy-hunter/python.webp";

/**
 * A caught wild snake rendered through the exact same Keeper pipeline as the
 * colony (ChondroSnakeIcon): the true locality/stage sprite when art exists,
 * Keeper's own "Sprite pending" treatment when it doesn't. The sprite seed is
 * the wild snake's stable name, matching the seed stored on import, so the
 * catch screen, receipt, haul banner, and colony card all resolve identically.
 */
function WildSnakeArt({ wild, mini = false }: { wild: WildSnake; mini?: boolean }) {
  return (
    <ChondroSnakeIcon
      subspecies={wild.subspecies}
      name={wild.name}
      lifeStage={wild.lifeStage}
      neonateColor={wild.neonateColor}
      locality={wild.locality}
      classification="Pure"
      ancestry={{ [wild.subspecies]: 100 }}
      localityAncestry={{ [wild.locality]: 100 }}
      phenotypeScore={wild.phenotypeScore}
      spriteSeed={wild.name}
      mini={mini}
    />
  );
}

/** One branch at a fork in the trail. Exactly one trail per leg hides a python. */
interface TrailOption {
  label: string;
  spots: GroveSpot[];
  /** Index into spots hiding the python, or null when this trail is empty. */
  pythonSpot: number | null;
  /**
   * The hidden python's life stage, pre-rolled so the hiding spot matches:
   * adults hunt the tall trees, neonates hide in the low plants. Null when
   * the region has no plant art (height mechanic off) or the trail is empty.
   */
  pythonLifeStage: CanopyLifeStage | null;
  /** Second python hiding spot on the python trail (null when the trail is empty). */
  secondPythonSpot: number | null;
  /** The second hidden python's life stage, pre-rolled like the first. */
  secondPythonLifeStage: CanopyLifeStage | null;
  /**
   * The briefing's promised "sign": rustling leaves, a fresh shed, heavy
   * tracks — or, rarely, the enormous shed that marks a trophy grove.
   * Cold trails sometimes lie with a stale shed.
   */
  sign: TrailSignKind | null;
}

interface Leg {
  trails: TrailOption[];
}

/** Triangle-wave sweep: 0 → 1 → 0 over two periods. */
function sweepPos(elapsedMs: number, periodMs: number): number {
  const phase = (elapsedMs % (periodMs * 2)) / periodMs;
  return phase < 1 ? phase : 2 - phase;
}

function subscribeReducedMotion(onChange: () => void) {
  const query = window.matchMedia("(prefers-reduced-motion: reduce)");
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function pickTrailCount(): number {
  const r = Math.random();
  if (r < 0.15) return 1;
  if (r < 0.6) return 2;
  return 3;
}

function trailLabel(count: number, index: number): string {
  if (count === 1) return "Follow the trail";
  if (count === 2) return index === 0 ? "Left trail" : "Right trail";
  return index === 0 ? "Left trail" : index === 1 ? "Center trail" : "Right trail";
}

/* ------------------------------------------------------------------ */
/* Art: production sprites                                             */
/* ------------------------------------------------------------------ */

function SpotArt({ src, dimmed, swayDelay }: { src: string; dimmed: boolean; swayDelay: number }) {
  return (
    <Image
      src={src}
      alt=""
      aria-hidden="true"
      fill
      sizes="(max-width: 640px) 30vw, 22vw"
      draggable={false}
      className={`object-cover ${dimmed ? "opacity-35 saturate-50" : ""}`}
      style={{ transformOrigin: "50% 100%", animation: `ch-sway 5s ease-in-out ${swayDelay}s infinite` }}
    />
  );
}

/** The region's keyed tree set once its art lands, else the shared set. */
function regionTreeSet(region: CanopyRegion | null): string[] {
  const set = region ? CANOPY_REGION_TREES[region.id] : [];
  return set.length > 0 ? set : TREE_ARTS;
}

/**
 * Art for a grove hiding spot: the region's tall trees or low plants.
 * Plant spots only exist once the region's plant art has landed.
 */
function artForSpot(region: CanopyRegion | null, spot: GroveSpot): string {
  if (spot.kind === "plant") {
    const set = region ? CANOPY_REGION_PLANTS[region.id] : [];
    return set[spot.variant % set.length];
  }
  const set = regionTreeSet(region);
  return set[spot.variant % set.length];
}

/** Pulsing pink badge for a gravid female. */
function GravidBadge({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border border-pink-300/30 bg-pink-400/10 px-3 py-1 text-[10px] font-black uppercase tracking-[.14em] text-pink-200 ${className}`}
    >
      <span className="relative flex h-1.5 w-1.5">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-pink-300 opacity-70" />
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-pink-300" />
      </span>
      Gravid
    </span>
  );
}

function Fireflies({ count = 8, color = "#fef9c3" }: { count?: number; color?: string }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <span
          key={i}
          aria-hidden="true"
          className="pointer-events-none absolute h-1 w-1 rounded-full"
          style={{
            backgroundColor: color,
            boxShadow: `0 0 6px ${color}`,
            left: `${8 + ((i * 37) % 84)}%`,
            top: `${18 + ((i * 53) % 52)}%`,
            animation: `ch-firefly ${3 + (i % 4)}s ease-in-out ${i * 0.6}s infinite`,
          }}
        />
      ))}
    </>
  );
}

/**
 * Regional scenery: color grade, drifting fog, and fireflies layered
 * over the trail and grove scenes, deepening as the night wears on. Pure
 * CSS over the existing art — when painted region backdrops exist, the
 * region config's `backdrop` path layers in underneath automatically.
 */
function NightAtmosphere({
  region,
  legIndex,
  compact = false,
  showBackdrop = true,
}: {
  region: CanopyRegion | null;
  legIndex: number;
  compact?: boolean;
  /**
   * The trail scene passes false: its fork paintings are the base layer
   * and a region backdrop would bury them. Painted scenery lives in the
   * grove scene, where the player actually hunts.
   */
  showBackdrop?: boolean;
}) {
  if (!region) return null;
  const atmo: CanopyAtmosphere = atmosphereForRegion(region);
  const nightfall = nightfallForLeg(legIndex);
  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden="true">
      {showBackdrop && atmo.backdrop && (
        <Image
          src={atmo.backdrop}
          alt=""
          aria-hidden="true"
          fill
          sizes="(max-width: 640px) 100vw, 48rem"
          draggable={false}
          className="object-cover"
        />
      )}
      {/* regional color grade */}
      <div className="absolute inset-0" style={{ background: atmo.grade }} />
      {/* the night deepens grove by grove */}
      <div className="absolute inset-0 bg-black" style={{ opacity: nightfall * 0.45 }} />
      {/* drifting fog */}
      <div
        className="absolute -left-10 bottom-[-10%] h-40 w-[70%] rounded-full blur-3xl"
        style={{
          background: atmo.fogTint,
          opacity: atmo.fogOpacity * 0.5,
          animation: "ch-drift 11s ease-in-out infinite",
        }}
      />
      <div
        className="absolute -right-10 bottom-[-16%] h-48 w-[80%] rounded-full blur-3xl"
        style={{
          background: atmo.fogTint,
          opacity: atmo.fogOpacity * 0.35,
          animation: "ch-drift 14s ease-in-out 2s infinite reverse",
        }}
      />
      <Fireflies
        count={compact ? Math.max(3, Math.floor(atmo.fireflies / 2)) : atmo.fireflies}
        color={atmo.fireflyColor}
      />
    </div>
  );
}

/**
 * The briefing's promised "sign": fluttering leaves, a fresh shed, heavy
 * tracks — or the enormous shed that marks a trophy grove. Pure CSS so it
 * stays crisp at any size.
 */
function TrailSign({ kind }: { kind: TrailSignKind }) {
  const styles: Record<TrailSignKind, { chip: string; text: string }> = {
    rustle: { chip: "bg-emerald-300/85", text: "text-emerald-200/75" },
    shed: { chip: "bg-amber-200/85", text: "text-amber-200/80" },
    tracks: { chip: "bg-sky-300/85", text: "text-sky-200/80" },
    legendary: { chip: "bg-yellow-300", text: "text-yellow-200" },
    stale: { chip: "bg-white/30", text: "text-white/35" },
  };
  const s = styles[kind];
  return (
    <span className="pointer-events-none absolute -top-9 left-1/2 -translate-x-1/2" aria-hidden="true">
      <span className="flex items-end justify-center gap-1">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className={`block h-2.5 w-1.5 rounded-[50%_0] ${s.chip} ${kind === "legendary" ? "animate-pulse" : ""}`}
            style={{ animation: `ch-rustle 1.6s ease-in-out ${i * 0.28}s infinite` }}
          />
        ))}
      </span>
      <span className={`mt-1 block whitespace-nowrap text-center text-[9px] font-black uppercase tracking-[.18em] ${s.text}`}>
        {TRAIL_SIGN_LABELS[kind].label}
      </span>
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Game                                                                */
/* ------------------------------------------------------------------ */

export function CanopyHunter({
  onCatch,
  onClose,
  onExitToGate,
  region: regionProp,
  permit = false,
  hot = false,
  portStopEnabled = false,
}: {
  onCatch: (wilds: WildSnake[]) => void;
  onClose: () => void;
  /** Return to the Keeper expedition entry gate (weekly-free / paid entry). Never resets the trip internally. */
  onExitToGate: () => void;
  /** Pre-rolled expedition region (the flight intro already picked one). Falls back to rolling. */
  region?: CanopyRegion | null;
  /** Permit night: longer run, trait-boosted animals, two specialist tools. */
  permit?: boolean;
  /** Intel-flagged region: legendary signs show up twice as often. */
  hot?: boolean;
  /** River Port Stop private playtest (server-gated per account). */
  portStopEnabled?: boolean;
}) {
  const grovesPerExpedition = permit ? PERMIT_GROVES : GROVES_PER_EXPEDITION;
  const [phase, setPhase] = useState<Phase>("briefing");
  const [region, setRegion] = useState<CanopyRegion | null>(null);
  const [legs, setLegs] = useState<Leg[]>([]);
  const [legIndex, setLegIndex] = useState(0);
  const [grove, setGrove] = useState<TrailOption | null>(null);
  const [groveWilds, setGroveWilds] = useState<Record<number, WildSnake>>({});
  const [searched, setSearched] = useState<boolean[]>(() => Array(TREES_PER_GROVE).fill(false));
  const [searchesLeft, setSearchesLeft] = useState(SEARCHES_PER_GROVE);
  /** Total searches across all groves this expedition (for scoring). */
  const [totalSearchesUsed, setTotalSearchesUsed] = useState(0);
  const [bag, setBag] = useState<WildSnake[]>([]);
  const [escapedCount, setEscapedCount] = useState(0);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [sheds, setSheds] = useState(0);
  /** Trail finds pocketed this expedition (ids into TRAIL_FINDS). */
  const [satchel, setSatchel] = useState<string[]>([]);
  /* Ref mirror of the satchel — the night-end sale runs from the results
     transitions (event handlers), so it reads the current finds through the
     mirror instead of a stale effect closure. This effect only writes the
     ref, never state. */
  const satchelRef = useRef<string[]>([]);
  useEffect(() => {
    satchelRef.current = satchel;
  }, [satchel]);
  /** Glinting pickups on the trail, rolled once per leg. */
  const [pickupRolls, setPickupRolls] = useState<
    Record<number, Array<{ uid: string; findId: string; left: string; bottom: string }>>
  >({});
  /** A found shed can be examined once for a clue about the grove. */
  const [canExamineShed, setCanExamineShed] = useState(false);
  /** Expedition-wide night event (sloughing season), rolled once per night. */
  const [nightEvent, setNightEvent] = useState<NightEventKind>(null);
  /** Per-grove: a fruit-bat swarm covers the hunter's approach (wider zone). */
  const [batSwarm, setBatSwarm] = useState(false);
  /** Locality codex: every locality ever bagged, persisted across nights. */
  const [codex, setCodex] = useState<CanopyLocality[]>([]);
  /** Localities inked into the codex for the first time tonight. */
  const [newCodexAdds, setNewCodexAdds] = useState<CanopyLocality[]>([]);
  /** Spots whose python escaped this grove — the clues go cold for them. */
  const [escapedSpots, setEscapedSpots] = useState<number[]>([]);
  const [journal, setJournal] = useState<string[]>([]);
  const [groveNote, setGroveNote] = useState<string | null>(null);
  /** Permit tools remaining: each token is a scent lure or a sure grip. */
  const [tokens, setTokens] = useState(permit ? PERMIT_TOKENS : 0);
  /* River port stop (gated playtest) — rolled fresh each expedition. */
  const [portVisited, setPortVisited] = useState(false);
  const [portArrived, setPortArrived] = useState(false);
  const [introOpen, setIntroOpen] = useState(() => {
    try {
      return window.localStorage.getItem("canopy-hunter-intro") !== "collapsed";
    } catch {
      return false;
    }
  });
  function toggleIntro() {
    setIntroOpen((open) => {
      const next = !open;
      try {
        window.localStorage.setItem("canopy-hunter-intro", next ? "open" : "collapsed");
      } catch { /* private mode — just don't persist */ }
      return next;
    });
  }
  const [portShopView, setPortShopView] = useState<PortShopView>("supplies");
  const [portStock, setPortStock] = useState<PortItem[]>([]);
  const [portSold, setPortSold] = useState<PortItemId[]>([]);
  const [portBought, setPortBought] = useState(0);
  const [portBounty, setPortBounty] = useState<PortBounty | null>(null);
  const [portBountyTaken, setPortBountyTaken] = useState(false);
  /** +1 searches in the next grove (lantern oil). */
  const [portBonusSearches, setPortBonusSearches] = useState(0);
  /** Port-bought tool charges, usable by any expedition type. */
  const [portLures, setPortLures] = useState(0);
  const [portGrips, setPortGrips] = useState(0);
  /** Local intel: next fork tells the truth + whispers the python's height. */
  const [portIntel, setPortIntel] = useState(false);
  const [tokenBal, setTokenBal] = useState<number>(() => getTokenBalance());
  const [catchTree, setCatchTree] = useState<number | null>(null);
  const [zoneCenter, setZoneCenter] = useState(0.5);
  const [catchResolved, setCatchResolved] = useState(false);
  const [catchMessage, setCatchMessage] = useState<string | null>(null);
  const [catchSuccess, setCatchSuccess] = useState(false);
  const [sent, setSent] = useState(false);
  const [walking, setWalking] = useState(false);
  const [musicMuted, setMusicMuted] = useState<boolean>(() => isGameMusicMuted());

  // Keep the toggle in sync with the shared game-music mute (e.g. flipped in the shop).
  useEffect(() => {
    const onMuteChange = () => setMusicMuted(isGameMusicMuted());
    window.addEventListener("game-music-mute-changed", onMuteChange);
    return () => window.removeEventListener("game-music-mute-changed", onMuteChange);
  }, []);

  const markerRef = useRef<HTMLDivElement>(null);
  const sweepStartRef = useRef(0);
  const wildIdRef = useRef(1);
  // Reads the OS reduced-motion preference without an effect (same pattern as
  // IntroCinematic): server snapshot matches, and it follows live OS changes.
  const reducedMotion = useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => false,
  );
  const period = sweepMsForLeg(legIndex, reducedMotion ? SWEEP_MS * 2.5 : SWEEP_MS);
  const zoneHalf = (reducedMotion ? 0.2 : ZONE_HALF) * (batSwarm ? 1.35 : 1);

  const resolvedCount = bag.length + escapedCount;
  const phaseName = nightPhaseForLeg(legIndex);
  /** Distant trees on the trail — the region's own set once its art lands. */
  const trailTrees = regionTreeSet(region);
  /** Painted region grove backdrop, when the art exists. */
  const groveBackdrop = region?.id ? atmosphereForRegion(region).backdrop : undefined;

  /** Append a line to the night's field journal. */
  function log(line: string) {
    setJournal((j) => [...j, line]);
  }

  /* Ref mirrors for the night-end settlement — it runs from the results
     transitions (event handlers / timeouts), so it reads current values
     through mirrors instead of stale closures. These effects only write
     refs, never state. */
  const bagRef = useRef<WildSnake[]>([]);
  useEffect(() => {
    bagRef.current = bag;
  }, [bag]);
  const portBountyRef = useRef<PortBounty | null>(null);
  useEffect(() => {
    portBountyRef.current = portBounty;
  }, [portBounty]);
  const portBountyTakenRef = useRef(false);
  useEffect(() => {
    portBountyTakenRef.current = portBountyTaken;
  }, [portBountyTaken]);

  /* Guard so the two results transitions (auto-advance, final trail) can't
     settle the night twice. Reset in startExpedition. */
  const nightEndSettledRef = useRef(false);
  /** Night-end settlement: unsold trail finds are bought up, and the river
      port bounty pays once if the board's snake was bagged. Called from the
      results transitions — event handlers and timeouts — never from an
      effect, so the results effect stays free of synchronous state updates. */
  function settleNightEnd() {
    if (nightEndSettledRef.current) return;
    nightEndSettledRef.current = true;
    const finds = satchelRef.current;
    if (finds.length > 0) {
      const total = finds.reduce((n, id) => n + (TRAIL_FINDS.find((t) => t.id === id)?.value ?? 0), 0);
      addTokens(total, "Canopy Hunter — trail finds sold");
      log(`Trail finds sold at the expedition's end — +${total} tokens.`);
      setSatchel([]);
    }
    const bounty = portBountyRef.current;
    if (portBountyTakenRef.current && bounty) {
      const hasBounty = bagRef.current.some(
        (w) => w.locality === bounty.locality && w.sex === bounty.sex,
      );
      if (hasBounty) {
        addTokens(5, "Canopy Hunter — river port bounty");
        log(`River port bounty paid — ${bounty.sex} ${bounty.locality} delivered. +5 tokens.`);
      }
    }
  }

  /* The expedition theme lives as long as the expedition modal does. */
  useEffect(() => () => {
    stopGameMusic();
  }, []);

  /* Marker sweep while the catch is live. */
  useEffect(() => {
    if (phase !== "catch" || catchResolved) return;
    sweepStartRef.current = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const pos = sweepPos(now - sweepStartRef.current, period);
      if (markerRef.current) markerRef.current.style.left = `${pos * 100}%`;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [phase, catchResolved, period]);

  /* Auto-advance to results when every python is found. Searches refresh per
     grove, so the night always runs every grove. */
  useEffect(() => {
    if (phase !== "trail" && phase !== "grove" && phase !== "port") return;
    if (resolvedCount >= grovesPerExpedition * PYTHONS_PER_GROVE) {
      const t = setTimeout(() => {
        settleNightEnd();
        setPhase("results");
      }, 700);
      return () => clearTimeout(t);
    }
  }, [phase, resolvedCount, grovesPerExpedition]);

  /* Arcade meta-system: award tokens + leaderboard + achievements once per night. */
  const arcadeAwardedRef = useRef<unknown>(null);
  useEffect(() => {
    if (phase !== "results" || arcadeAwardedRef.current === legs) return;
    arcadeAwardedRef.current = legs;
    const primeCount = bag.filter((w) => w.prime).length;
    const s = scoreExpedition(bag.length, bestStreak, escapedCount, totalSearchesUsed, primeCount);
    const tokensEarned = { S: 25, A: 18, B: 12, C: 8, D: 5 }[s.rank] as number;
    addTokens(tokensEarned, `Canopy Hunter — ${s.rank}-rank expedition`);
    /* Night-end settlement (trail-find sale, river port bounty) runs from
       the results transitions via settleNightEnd — never from this effect. */
    recordScore("hunter", s.points, `${s.rank}-rank`);
    reportArcadeEvent({
      type: "hunt-complete",
      rank: s.rank,
      caught: bag.length,
      prime: primeCount,
      newCodex: newCodexAdds.length,
      codexTotal: codex.length,
    });
  }, [phase, legs, bag, bestStreak, escapedCount, totalSearchesUsed, newCodexAdds.length, codex.length]);

  function startExpedition() {
    // User gesture: the one safe moment to start audio. The expedition theme
    // usually already started with the flight video — this is a no-op then,
    // and covers players who skipped the flight (reduced motion).
    playGameMusic(CANOPY_THEME_SRC, CANOPY_THEME_VOLUME);
    setTokens(permit ? PERMIT_TOKENS : 0);
    const expeditionRegion = regionProp ?? rollRegion();
    const regionTrees = CANOPY_REGION_TREES[expeditionRegion.id];
    const regionPlants = CANOPY_REGION_PLANTS[expeditionRegion.id];
    const treeVariants = regionTrees.length > 0 ? regionTrees.length : TREE_ARTS.length;
    const plantVariants = regionPlants.length;
    const nextLegs: Leg[] = [];
    const nextPickupRolls: Record<number, Array<{ uid: string; findId: string; left: string; bottom: string }>> = {};
    for (let g = 0; g < grovesPerExpedition; g += 1) {
      const trailCount = pickTrailCount();
      const pythonTrail = Math.floor(Math.random() * trailCount);
      const trails: TrailOption[] = [];
      for (let t = 0; t < trailCount; t += 1) {
        const hidesPython = t === pythonTrail;
        const spots = createGroveSpots(treeVariants, plantVariants);
        let pythonSpot: number | null = null;
        let pythonLifeStage: CanopyLifeStage | null = null;
        let secondPythonSpot: number | null = null;
        let secondPythonLifeStage: CanopyLifeStage | null = null;
        if (hidesPython) {
          // Two pythons hide on the python trail, in two different spots.
          const taken = new Set<number>();
          const rollHidingSpot = (): { spot: number; lifeStage: CanopyLifeStage | null } => {
            let lifeStage: CanopyLifeStage | null = null;
            let pool: number[];
            if (plantVariants > 0) {
              // Height mechanic: adults hunt the tall trees, neonates hide low.
              lifeStage = rollLifeStage();
              pool = spots
                .map((s, i) => (lifeStage === "Adult" ? s.kind === "tree" : s.kind === "plant") && !taken.has(i) ? i : -1)
                .filter((i) => i >= 0);
              if (pool.length === 0) pool = spots.map((_, i) => i).filter((i) => !taken.has(i));
            } else {
              pool = spots.map((_, i) => i).filter((i) => !taken.has(i));
            }
            const pick = pool[Math.floor(Math.random() * pool.length)];
            taken.add(pick);
            return { spot: pick, lifeStage };
          };
          const first = rollHidingSpot();
          const second = rollHidingSpot();
          pythonSpot = first.spot;
          pythonLifeStage = first.lifeStage;
          secondPythonSpot = second.spot;
          secondPythonLifeStage = second.lifeStage;
        }
        trails.push({
          label: trailLabel(trailCount, t),
          spots,
          pythonSpot,
          pythonLifeStage,
          secondPythonSpot,
          secondPythonLifeStage,
          // The signs aren't always readable — some nights the canopy keeps
          // quiet, and cold trails sometimes lie with a stale shed.
          sign: hidesPython ? rollPythonTrailSign(Math.random, hot) : rollEmptyTrailSign(),
        });
      }
      nextLegs.push({ trails });
      /* Trail pickups: 1–2 glinting finds per walk between groves, rolled
         here with the legs (event handler) — never from an effect. */
      const pickupCount = Math.random() < 0.35 ? 2 : 1;
      const pickupSpots = [
        { left: "7%", bottom: "34%" },
        { left: "80%", bottom: "44%" },
      ];
      nextPickupRolls[g] = Array.from({ length: pickupCount }, (_, i) => ({
        uid: `leg${g}-${i}-${Math.floor(Math.random() * 1e9)}`,
        findId: rollTrailFindId(),
        left: pickupSpots[i].left,
        bottom: pickupSpots[i].bottom,
      }));
    }
    wildIdRef.current = 1;
    setRegion(expeditionRegion);
    setLegs(nextLegs);
    setLegIndex(0);
    setGrove(null);
    setGroveWilds({});
    setSearched(Array(TREES_PER_GROVE).fill(false));
    setSearchesLeft(SEARCHES_PER_GROVE);
    setTotalSearchesUsed(0);
    setBag([]);
    setEscapedCount(0);
    setStreak(0);
    setBestStreak(0);
    setSheds(0);
    setSatchel([]);
    setPickupRolls(nextPickupRolls);
    setCanExamineShed(false);
    const event = rollNightEvent();
    setNightEvent(event);
    setBatSwarm(false);
    setCodex(loadCanopyCodex());
    setNewCodexAdds([]);
    setJournal([
      `${expeditionRegion.name} — expedition begins at ${atmosphereForRegion(expeditionRegion).nightName}.`,
    ]);
    if (event === "sloughing") {
      setJournal((j) => [
        ...j,
        "The whole canopy is sloughing tonight — sheds everywhere, and every one is a clue waiting to be read.",
      ]);
    }
    setGroveNote(null);
    setCatchTree(null);
    setCatchResolved(false);
    setCatchMessage(null);
    setSent(false);
    setWalking(false);
    /* River port resets — one visit per expedition, stock re-rolled. */
    setPortVisited(false);
    setPortArrived(false);
    setPortStock([]);
    setPortSold([]);
    setPortBought(0);
    setPortBounty(null);
    setPortBountyTaken(false);
    setPortBonusSearches(0);
    setPortLures(0);
    setPortGrips(0);
    setPortIntel(false);
    nightEndSettledRef.current = false;
    setTokenBal(getTokenBalance());
    setPhase("trail");
  }

  function chooseTrail(trailIndex: number) {
    if (phase !== "trail" || walking) return;
    const trail = legs[legIndex]?.trails[trailIndex];
    if (!trail) return;
    log(`${nightPhaseForLeg(legIndex)} — took the ${trail.label.toLowerCase()} to grove ${legIndex + 1}.`);
    setGroveNote(null);
    setCanExamineShed(false);
    setWalking(true);
    window.setTimeout(() => {
      const wilds: Record<number, WildSnake> = {};
      if (region) {
        const hidden: Array<{ spot: number | null; lifeStage: CanopyLifeStage | null }> = [
          { spot: trail.pythonSpot, lifeStage: trail.pythonLifeStage },
          { spot: trail.secondPythonSpot, lifeStage: trail.secondPythonLifeStage },
        ];
        for (const { spot, lifeStage } of hidden) {
          if (spot === null) continue;
          const prime = trail.sign === "legendary";
          wilds[spot] = generateWildSnake(
            wildIdRef.current,
            region,
            Math.random,
            lifeStage,
            prime,
            permit,
          );
          wildIdRef.current += 1;
        }
        if (trail.sign === "legendary" && Object.keys(wilds).length > 0) {
          log(`Grove ${legIndex + 1} — the enormous shed wasn't lying. Something exceptional hunts here.`);
        }
      }
      const swarm = rollBatSwarm();
      setBatSwarm(swarm);
      if (swarm) {
        log(`Grove ${legIndex + 1} — a fruit-bat swarm crosses overhead. The snakes won't hear you coming.`);
      }
      setGrove(trail);
      setGroveWilds(wilds);
      setSearched(Array(TREES_PER_GROVE).fill(false));
      /* Lantern oil: the next grove searches brighter. */
      setSearchesLeft(SEARCHES_PER_GROVE + portBonusSearches);
      if (portBonusSearches > 0) setPortBonusSearches(0);
      /* Local intel whispers the python's height for this grove. */
      if (portIntel && trail.pythonSpot !== null && trail.pythonLifeStage) {
        setGroveNote(
          trail.pythonLifeStage === "Adult"
            ? "Your local intel whispers: something heavy moved up high here."
            : "Your local intel whispers: look low — something young hides in the undergrowth.",
        );
        setPortIntel(false);
      }
      setCatchTree(null);
      setCatchResolved(false);
      setCatchMessage(null);
      setEscapedSpots([]);
      setWalking(false);
      setPhase("grove");
    }, 750);
  }

  function searchTree(index: number) {
    if (phase !== "grove" || searched[index] || searchesLeft <= 0) return;
    const nextSearched = [...searched];
    nextSearched[index] = true;
    setSearched(nextSearched);
    setSearchesLeft((n) => n - 1);
    setTotalSearchesUsed((n) => n + 1);
    setGroveNote(null);
    if (groveWilds[index]) {
      setCatchTree(index);
      setZoneCenter(rollZoneCenter());
      setCatchResolved(false);
      setCatchMessage(null);
      setPhase("catch");
    } else if (rollShedFind(Math.random, nightEvent === "sloughing" ? SHED_FIND_CHANCE_SLOUGHING : SHED_FIND_CHANCE)) {
      // Consolation sign: a fresh shed means a python was here tonight —
      // and it can be examined for a clue about the grove.
      const line = randomShedLine();
      setSheds((n) => n + 1);
      setGroveNote(line);
      setCanExamineShed(true);
      log(`Grove ${legIndex + 1} — shed skin found.`);
    }
  }

  /** Spots in the current grove still hiding a catchable python. */
  function livePythonSpots(): number[] {
    if (!grove) return [];
    const spots = [grove.pythonSpot, grove.secondPythonSpot];
    return spots.filter(
      (s): s is number =>
        s !== null &&
        groveWilds[s] !== undefined &&
        !bag.includes(groveWilds[s]) &&
        !escapedSpots.includes(s),
    );
  }

  /** Read a found shed for clues about the grove's hidden python (if any). */
  function examineShed() {
    if (phase !== "grove" || !canExamineShed || !grove) return;
    const spot = livePythonSpots()[0] ?? null;
    const wild = spot !== null ? groveWilds[spot] ?? null : null;
    const clue =
      wild && bag.includes(wild)
        ? "This shed's owner is already in your bag — nice work."
        : examineShedClue(wild, Math.random);
    setCanExamineShed(false);
    setGroveNote(clue);
    log(`Grove ${legIndex + 1} — shed examined. ${clue}`);
  }

  function grab(force = false) {
    if (phase !== "catch" || catchResolved || catchTree === null) return;
    const pos = sweepPos(performance.now() - sweepStartRef.current, period);
    const success = force || Math.abs(pos - zoneCenter) <= zoneHalf;
    const wild = groveWilds[catchTree];
    setCatchSuccess(success);
    setCatchResolved(true);
    if (success && wild) {
      setBag((b) => [...b, wild]);
      const nextStreak = streak + 1;
      setStreak(nextStreak);
      setBestStreak((b) => Math.max(b, nextStreak));
      // Ink the locality into the codex the moment it's bagged.
      const { codex: nextCodex, newlyAdded } = recordCanopyCodex([wild.locality]);
      setCodex(nextCodex);
      if (newlyAdded.length > 0) {
        setNewCodexAdds((prev) => [...prev, ...newlyAdded]);
      }
      log(
        `Grove ${legIndex + 1} — bagged ${wild.name} (${wild.sex.toLowerCase()}, ${wild.lifeStage.toLowerCase()}).` +
          (nextStreak >= 2 ? ` Streak ×${nextStreak}.` : "") +
          (newlyAdded.length > 0 ? ` Codex — ${newlyAdded[0]} documented for the first time!` : ""),
      );
      setCatchMessage(
        wild.gravid
          ? "Bagged! She's gravid — she'll lay her clutch once she's settled in your colony."
          : nextStreak >= 2
            ? `Bagged! Streak ×${nextStreak} — you're on fire.`
            : "Bagged! A new animal for the collection.",
      );
      playHankScaleLine(25);
    } else {
      setEscapedCount((n) => n + 1);
      setStreak(0);
      if (catchTree !== null) setEscapedSpots((s) => [...s, catchTree]);
      log(`Grove ${legIndex + 1} — it slipped away.`);
      setCatchMessage(randomEscapeLine());
      playHankScaleLine(26);
    }
  }

  /** Total tool charges: permit tokens double as both tools; port-bought
   *  charges work on any expedition. Permit tokens are spent first. */
  const lureCharges = (permit ? tokens : 0) + portLures;
  const gripCharges = (permit ? tokens : 0) + portGrips;

  function spendToolCharge(kind: "lure" | "grip") {
    if (permit && tokens > 0) {
      setTokens((t) => t - 1);
    } else if (kind === "lure") {
      setPortLures((n) => Math.max(0, n - 1));
    } else {
      setPortGrips((n) => Math.max(0, n - 1));
    }
  }

  /**
   * Scent lure. Draws the grove's python straight out: no search spent,
   * straight to the catch. Deployable at any grove.
   */
  function deployLure() {
    if (phase !== "grove" || lureCharges <= 0 || !grove) return;
    const spot = livePythonSpots()[0] ?? null;
    const wild = spot !== null ? groveWilds[spot] : undefined;
    if (spot === null || !wild || bag.includes(wild) || escapedSpots.includes(spot)) return;
    spendToolCharge("lure");
    setCatchTree(spot);
    setZoneCenter(rollZoneCenter());
    setCatchResolved(false);
    setCatchMessage(null);
    setGroveNote(null);
    log(`Grove ${legIndex + 1} — scent lure deployed. ${wild.name} slides out to investigate.`);
    setPhase("catch");
  }

  /**
   * Sure grip. The grab cannot miss. Deployable at any catch.
   */
  function deploySureGrip() {
    if (phase !== "catch" || catchResolved || gripCharges <= 0) return;
    spendToolCharge("grip");
    log(`Grove ${legIndex + 1} — sure grip. No mistakes this time.`);
    grab(true);
  }

  /** Whether the scent lure has a live target in the current grove. */
  const lureSpot = livePythonSpots()[0] ?? null;
  const lureWild = lureSpot !== null ? groveWilds[lureSpot] : undefined;
  const canLure =
    phase === "grove" &&
    lureCharges > 0 &&
    lureWild !== undefined &&
    !bag.includes(lureWild) &&
    !escapedSpots.includes(lureSpot as number);
  const canSureGrip = phase === "catch" && !catchResolved && gripCharges > 0;

  function backToGrove() {
    setCatchTree(null);
    setPhase("grove");
  }

  function advanceLeg() {
    setLegIndex((n) => n + 1);
    setGrove(null);
    setPhase("trail");
  }

  /** The river port: once per expedition, after the middle grove. */
  function followTrail() {
    setGroveNote(null);
    if (legIndex + 1 >= grovesPerExpedition) {
      log(`${nightPhaseForLeg(legIndex)} — the night ends.`);
      settleNightEnd();
      setPhase("results");
      return;
    }
    const portLeg = permit ? 2 : 1;
    if (portStopEnabled && !portVisited && legIndex === portLeg && region) {
      setPortVisited(true);
      setPortStock(rollPortStock());
      setPortBounty(rollPortBounty(region));
      setPortShopView("supplies");
      setPortArrived(false);
      log(`${nightPhaseForLeg(legIndex)} — the trail reaches a lantern-lit river port. Time to resupply.`);
      setPhase("port");
      return;
    }
    advanceLeg();
  }

  /** Leave the port for the next leg. Pushing on skips the stalls and earns
   *  the bat-swarm ambush (wider green zone) in the next grove. */
  function castOff(pushOn = false) {
    if (pushOn) {
      setBatSwarm(true);
      log("You push past the port into deep night — a fruit-bat swarm crosses overhead. The snakes won't hear you coming.");
    } else {
      log("You cast off from the river port, lanterns shrinking behind you.");
    }
    advanceLeg();
  }

  /** Trader stock: three of the four goods are on the table each visit. */
  function rollPortStock(): PortItem[] {
    const items = [...PORT_ITEMS];
    for (let i = items.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [items[i], items[j]] = [items[j], items[i]];
    }
    return items.slice(0, 3);
  }

  /** One bounty per visit, drawn from tonight's region. */
  function rollPortBounty(r: CanopyRegion): PortBounty {
    return {
      locality: r.localities[Math.floor(Math.random() * r.localities.length)],
      sex: Math.random() < 0.5 ? "Male" : "Female",
    };
  }

  function buyPortItem(item: PortItem) {
    if (portBought >= 2 || portSold.includes(item.id)) return;
    if (!spendTokens(item.cost, `Canopy Hunter river port — ${item.name}`)) return;
    setTokenBal(getTokenBalance());
    setPortSold((s) => [...s, item.id]);
    setPortBought((n) => n + 1);
    if (item.id === "lantern-oil") setPortBonusSearches((n) => n + 1);
    if (item.id === "scent-lure") setPortLures((n) => n + 1);
    if (item.id === "sure-grip") setPortGrips((n) => n + 1);
    if (item.id === "local-intel") setPortIntel(true);
    log(`River port — bought ${item.name} for ${item.cost} tokens.`);
  }

  /** Pocket a glinting trail find. */
  function collectFind(leg: number, uid: string, findId: string) {
    setPickupRolls((rolls) => ({
      ...rolls,
      [leg]: (rolls[leg] ?? []).filter((p) => p.uid !== uid),
    }));
    setSatchel((prev) => [...prev, findId]);
    const f = TRAIL_FINDS.find((t) => t.id === findId);
    if (f) log(`Trail find pocketed — ${f.name} (worth ${f.value} ${f.value === 1 ? "token" : "tokens"} at the port).`);
  }

  /** Sell every trail find in the satchel to the port trader. */
  function sellFinds() {
    if (satchel.length === 0) return;
    const total = satchel.reduce((n, id) => n + (TRAIL_FINDS.find((t) => t.id === id)?.value ?? 0), 0);
    addTokens(total, "Canopy Hunter river port — trail finds");
    setTokenBal(getTokenBalance());
    log(`River port — sold ${satchel.length} trail ${satchel.length === 1 ? "find" : "finds"} for ${total} tokens.`);
    setSatchel([]);
  }

  /** Shed trade: one fresh shed for +4 tokens, or for local intel. */
  function tradeShed(forIntel: boolean) {
    if (sheds <= 0) return;
    setSheds((n) => n - 1);
    if (forIntel) {
      setPortIntel(true);
      log("River port — traded a fresh shed for local intel.");
    } else {
      addTokens(4, "Canopy Hunter river port — shed trade");
      setTokenBal(getTokenBalance());
      log("River port — traded a fresh shed for 4 tokens.");
    }
  }

  function bringHome() {
    if (bag.length === 0 || sent) return;
    onCatch(bag);
    setSent(true);
  }

  function toggleMusicMuted() {
    const next = !musicMuted;
    setMusicMuted(next);
    setGameMusicMuted(next);
    // Unmuting mid-expedition picks the theme back up right away.
    if (!next) playGameMusic(CANOPY_THEME_SRC, CANOPY_THEME_VOLUME);
  }

  const currentWild = catchTree !== null ? groveWilds[catchTree] : undefined;
  const currentTrails = legs[legIndex]?.trails ?? [];
  const satchelFinds = satchel
    .map((id) => TRAIL_FINDS.find((t) => t.id === id))
    .filter((f): f is TrailFind => Boolean(f));
  const bestFind =
    bag.length > 0
      ? bag.reduce((a, b) => (b.phenotypeScore > a.phenotypeScore ? b : a))
      : null;
  const searchesUsed = totalSearchesUsed;
  const primeCaught = bag.filter((w) => w.prime).length;
  const score = scoreExpedition(bag.length, bestStreak, escapedCount, searchesUsed, primeCaught);

  function trailButtonPos(count: number, index: number): React.CSSProperties {
    if (count === 1) return { left: "50%", bottom: "36%", transform: "translateX(-50%)" };
    if (count === 2) {
      return index === 0
        ? { left: "20%", bottom: "38%", transform: "translateX(-50%)" }
        : { left: "80%", bottom: "38%", transform: "translateX(-50%)" };
    }
    return {
      left: index === 0 ? "17%" : index === 1 ? "50%" : "83%",
      bottom: index === 1 ? "44%" : "36%",
      transform: "translateX(-50%)",
    };
  }

  return (
    <div className="mx-auto w-full max-w-3xl">
      <style>{`@keyframes ch-sway { 0%,100% { transform: rotate(-1.6deg); } 50% { transform: rotate(1.6deg); } }
@keyframes ch-firefly { 0%,100% { transform: translate(0,0); opacity: .25; } 50% { transform: translate(10px,-14px); opacity: 1; } }
@keyframes ch-rustle { 0%,100% { transform: rotate(-18deg) translateY(0); opacity: .55; } 50% { transform: rotate(24deg) translateY(-3px); opacity: 1; } }
@keyframes ch-drift { 0%,100% { transform: translateX(-24px); } 50% { transform: translateX(24px); } }`}</style>

      {/* Header — collapsible so the game sits near the top without scrolling */}
      <div className="relative text-center">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close expedition"
          className="absolute right-0 top-0 z-10 rounded-full border border-white/10 bg-black/60 p-2 text-white/60 transition hover:bg-white/[.1] hover:text-white"
        >
          <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden="true">
            <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
        {introOpen ? (
          <>
            <div className="inline-flex rounded-full border border-emerald-300/15 bg-emerald-300/[.06] px-4 py-2 text-[10px] font-bold uppercase tracking-[.2em] text-emerald-200/70">
              Arboreal Keeper · Special event
            </div>
            <h1 className="mt-4 text-4xl font-semibold tracking-[-.03em] text-white sm:text-5xl">Canopy Hunter</h1>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-7 text-white/55">
              Night in the New Guinea canopy. Walk the trail, read the signs, search the trees —
              and bring your pythons home to your Arboreal Keeper collection.
            </p>
            <button
              type="button"
              onClick={toggleIntro}
              className="mt-2 text-[10px] font-black uppercase tracking-[.2em] text-white/30 transition hover:text-white/60"
            >
              Hide intro ↑
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={toggleIntro}
            aria-expanded="false"
            className="mx-auto flex items-center gap-2 rounded-full border border-white/10 bg-white/[.03] px-4 py-2 text-[10px] font-black uppercase tracking-[.2em] text-white/40 transition hover:border-white/20 hover:text-white/70"
          >
            Canopy Hunter
            <span aria-hidden="true" className="text-white/25">·</span>
            <span className="normal-case tracking-normal text-white/30">about</span>
            <span aria-hidden="true">↓</span>
          </button>
        )}
      </div>

      {/* Briefing */}
      {phase === "briefing" && (
        <div className="mx-auto mt-8 max-w-xl overflow-hidden rounded-[26px] border border-white/[.07] bg-white/[.02]">
          <div className="relative h-44 sm:h-52">
            <Image src={BANNER_ART} alt="" aria-hidden="true" fill sizes="(max-width: 640px) 100vw, 36rem" draggable={false} className="object-cover" />
            <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,transparent_40%,rgba(4,10,8,.92)_100%)]" />
            <div className="absolute bottom-3 left-5 right-5">
              <h2 className="text-lg font-semibold text-white">Expedition briefing</h2>
              <p className="text-xs text-white/55">
                {permit
                  ? `Permit night — ${PERMIT_GROVES} groves, trait-boosted animals, and ${PERMIT_TOKENS} specialist tools.`
                  : "Four groves. One night. Your flashlight and your instincts."}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4 border-b border-white/[.06] px-6 py-4 sm:px-8">
            <Image
              src="/arcade/canopy-hunter/pilot-bush.webp"
              alt="Dave, the bush pilot, leaning against his plane"
              width={384}
              height={384}
              sizes="160px"
              draggable={false}
              className="h-36 w-36 shrink-0 rounded-3xl border border-white/10 object-cover object-[25%_30%] sm:h-44 sm:w-44"
            />
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[.16em] text-amber-100/60">Dave · Bush pilot</p>
              <p className="mt-1 text-sm italic leading-6 text-white/70">&quot;Evening. I&apos;m Dave — your ride in. I fly hunters over these ridges. Four groves, one night. Don&apos;t keep the engine waiting.&quot;</p>
            </div>
          </div>
          <ul className="space-y-2 p-6 text-sm leading-6 text-white/55 sm:px-8">
            <li>· {grovesPerExpedition} groves along the trail, {TREES_PER_GROVE} hiding spots each — search the tall trees and the undergrowth alike.</li>
            <li>· Each grove gives you {SEARCHES_PER_GROVE} searches — spend them wisely, then follow the trail to the next grove.</li>
            <li>· {grovesPerExpedition * PYTHONS_PER_GROVE} pythons are hiding out there. At every fork, read the signs — rustling leaves, fresh sheds, heavy tracks. Cold trails sometimes lie.</li>
            <li>· Spot one and grab it before it slips away.</li>
            <li>· Not all ground is equal — common localities show themselves often, legendary ones are ghosts. In pulcher country expect Sorong; pray for Arfak.</li>
            <li>· An enormous shed at a fork marks a trophy grove — something exceptional hunts there.{hot ? " Intel says this region is hot tonight — trophy signs are twice as common." : ""}</li>
            <li>· Hunt by height: adults cruise the high branches — search the tall trees. Neonates hide low — check the undergrowth.</li>
            <li>· Each expedition heads to one of four regions — tonight&apos;s snakes all come from the same corner of New Guinea, and each region hunts under its own sky.</li>
            <li>· The night deepens as you go — Dusk, Nightfall, Deep night, Blue hour — and the snakes get warier (and quicker) the later it gets.</li>
            <li>· Chain clean grabs for a streak. Your night earns a hunter&apos;s rank, S through D.</li>
            <li>· Empty trees sometimes turn up fresh shed skins — examine one and it&apos;ll tell you what&apos;s hiding in the grove.</li>
            {permit && (
              <li>· Permit perks: this region&apos;s signature traits run hot (floored at 30) and exceptional animals show up far more often. You carry {PERMIT_TOKENS} specialist tools — a 🍃 scent lure draws a python out with no search spent, and an ✊ sure grip never misses. Spend them at any grove.</li>
            )}
            {portStopEnabled && (
              <li>· Halfway through the night the trail reaches a lantern-lit river port — trade excess shed skins, buy a little edge, and check the notice board before you cast off.</li>
            )}
            <li>· Every bagged locality is inked into your codex — document all {CANOPY_LOCALITIES.length}.</li>
            <li>· Caught snakes head straight into your Keeper colony.</li>
          </ul>
          <div className="px-6 pb-6 sm:px-8 sm:pb-8">
            <button
              type="button"
              onClick={startExpedition}
              className="w-full rounded-2xl bg-emerald-300 px-6 py-4 text-base font-bold text-[#06100c] transition hover:bg-emerald-200 active:scale-[.99]"
            >
              Start expedition
            </button>
            <button
              type="button"
              onClick={toggleMusicMuted}
              aria-pressed={!musicMuted}
              className="mx-auto mt-4 flex items-center gap-2 rounded-full border border-white/10 bg-black/40 px-4 py-2 text-xs font-bold text-white/60 transition hover:bg-white/[.08] hover:text-white"
            >
              <span aria-hidden="true">{musicMuted ? "🔇" : "🎵"}</span>
              {musicMuted ? "Game music: off everywhere" : "Game music: on"}
            </button>
          </div>
        </div>
      )}

      {/* Trail — pseudo-3D third-person fork choice */}
      {phase === "trail" && (
        <div className="mt-8">
          <TrailStatus region={region} legIndex={legIndex} searchesLeft={searchesLeft} bagCount={bag.length} streak={streak} phaseName={phaseName} totalGroves={grovesPerExpedition} />
          <div className={`relative aspect-[4/3] overflow-hidden rounded-[26px] border border-white/[.07] transition-all duration-700 sm:aspect-[16/9] ${walking ? "scale-110 opacity-0" : "scale-100 opacity-100"}`}>
            <Image src={pathArtForTrailCount(currentTrails.length)} alt="" aria-hidden="true" fill sizes="(max-width: 640px) 100vw, 48rem" draggable={false} className="object-cover" />
            <NightAtmosphere region={region} legIndex={legIndex} showBackdrop={false} />
            {/* Distant trees near the vanishing point sell the depth (keyed art, plain opacity dimming) */}
            <div className="absolute left-[37%] top-[24%] w-16 opacity-90 sm:w-20">
              <div className="relative aspect-[3/4] brightness-[.55]">
                <SpotArt src={trailTrees[(legIndex + 1) % trailTrees.length]} dimmed={false} swayDelay={0.4} />
              </div>
            </div>
            <div className="absolute right-[37%] top-[24%] w-16 opacity-90 sm:w-20">
              <div className="relative aspect-[3/4] brightness-[.55]">
                <SpotArt src={trailTrees[(legIndex + 2) % trailTrees.length]} dimmed={false} swayDelay={1.3} />
              </div>
            </div>
            {/* Trail choices sit on the path ahead */}
            {currentTrails.map((trail, i) => (
              <div key={i} className="absolute z-10" style={trailButtonPos(currentTrails.length, i)}>
                {trail.sign && <TrailSign kind={trail.sign} />}
                <button
                  type="button"
                  onClick={() => chooseTrail(i)}
                  disabled={walking}
                  className="max-w-[7rem] rounded-full border border-amber-200/30 bg-black/65 px-4 py-2.5 text-center backdrop-blur-sm transition hover:-translate-y-0.5 hover:border-amber-200/60 hover:bg-black/80 active:scale-95 disabled:opacity-60 sm:max-w-[11rem]"
                >
                  <span className="text-[11px] font-black uppercase tracking-[.14em] text-amber-100">{trail.label}</span>
                </button>
                {portIntel && trail.pythonSpot !== null && (
                  <div className="mt-1 whitespace-nowrap rounded-full border border-sky-200/30 bg-sky-300/[.08] px-3 py-1 text-center text-[10px] font-bold text-sky-100">
                    🧭 Intel: the python took this trail
                  </div>
                )}
              </div>
            ))}
            {/* Third-person hunter (keyed art, fully opaque) */}
            <div className="pointer-events-none absolute bottom-1 left-1/2 z-10 h-32 w-24 -translate-x-1/2 sm:h-40 sm:w-32">
              <Image src={EXPLORER_ART} alt="" aria-hidden="true" fill sizes="96px" draggable={false} className="object-contain" />
            </div>
            {/* Glinting trail finds — tap to pocket */}
            {(pickupRolls[legIndex] ?? []).map((p) => {
              const f = TRAIL_FINDS.find((t) => t.id === p.findId);
              if (!f) return null;
              return (
                <button
                  key={p.uid}
                  type="button"
                  onClick={() => collectFind(legIndex, p.uid, p.findId)}
                  disabled={walking}
                  aria-label={`Pick up ${f.name}`}
                  className="absolute z-10 w-12 animate-[pickup-glint_2.4s_ease-in-out_infinite] transition hover:scale-110 active:scale-95 disabled:opacity-60 sm:w-14"
                  style={{ left: p.left, bottom: p.bottom }}
                >
                  <span aria-hidden="true" className="absolute inset-0 -z-10 rounded-full bg-amber-200/25 blur-md" />
                  <span className="relative block aspect-square">
                    <Image src={f.icon} alt="" aria-hidden="true" fill sizes="56px" draggable={false} className="object-contain drop-shadow-[0_6px_12px_rgba(0,0,0,.6)]" />
                  </span>
                  <span aria-hidden="true" className="absolute -right-1 -top-1 text-sm">✨</span>
                </button>
              );
            })}
            {satchel.length > 0 && (
              <div className="absolute left-3 top-3 z-10 rounded-full border border-white/10 bg-black/65 px-3 py-1.5 text-[10px] font-black uppercase tracking-[.14em] text-white/70 backdrop-blur-sm">
                🎒 {satchel.length} {satchel.length === 1 ? "find" : "finds"}
              </div>
            )}
            {/* Foreground foliage frames the shot */}
            <Image src={FOREGROUND_ART} alt="" aria-hidden="true" fill sizes="(max-width: 640px) 100vw, 48rem" draggable={false} className="pointer-events-none object-cover mix-blend-screen" />
            {walking && (
              <div className="absolute inset-0 z-20 grid place-items-center">
                <span className="rounded-full border border-white/10 bg-black/70 px-5 py-2.5 text-xs font-bold uppercase tracking-[.18em] text-white/70">
                  Walking…
                </span>
              </div>
            )}
          </div>
          <p className="mt-4 text-center text-xs text-white/35">
            {currentTrails.length <= 1 ? "One way forward." : "Read the signs — sheds, tracks and rustling leaves all talk. Cold trails sometimes lie."}
          </p>
        </div>
      )}

      {/* Grove — search the trees */}
      {phase === "grove" && grove && (
        <div className="mt-8">
          <TrailStatus region={region} legIndex={legIndex} searchesLeft={searchesLeft} bagCount={bag.length} streak={streak} phaseName={phaseName} grove totalGroves={grovesPerExpedition} />
          <div className="relative overflow-hidden rounded-[26px] border border-white/[.07]">
            {!groveBackdrop && (
              <Image src={PATH_ART} alt="" aria-hidden="true" fill sizes="(max-width: 640px) 100vw, 48rem" draggable={false} className="object-cover brightness-[.38]" />
            )}
            <NightAtmosphere region={region} legIndex={legIndex} compact />
            <div className="relative flex items-end justify-center gap-2 px-4 pb-8 pt-10 sm:gap-6">
              {grove.spots.map((spot, i) => {
                const wasSearched = searched[i];
                const showPython = wasSearched && (grove.pythonSpot === i || grove.secondPythonSpot === i);
                const isTree = spot.kind === "tree";
                const spotName = isTree ? "tree" : "undergrowth";
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => searchTree(i)}
                    disabled={wasSearched}
                    aria-label={wasSearched ? (showPython ? `${spotName} ${i + 1}: python found` : `${spotName} ${i + 1}: searched, empty`) : `Search ${isTree ? `tree ${i + 1}` : `the undergrowth`}`}
                    className={`group relative aspect-[3/4] transition active:scale-95 ${
                      isTree
                        ? i === 1
                          ? "w-24 -translate-y-3 sm:w-32"
                          : "w-32 sm:w-44"
                        : "w-20 sm:w-28"
                    } ${wasSearched ? "" : "hover:drop-shadow-[0_0_20px_rgba(52,211,153,.35)]"}`}
                  >
                    <div className={`absolute inset-0 transition-opacity duration-500 ${wasSearched && !showPython ? "opacity-60" : ""}`}>
                      <SpotArt src={artForSpot(region, spot)} dimmed={wasSearched && !showPython} swayDelay={(i % 5) * 0.7} />
                    </div>
                    {showPython && groveWilds[i] && (
                      <div className="absolute inset-x-1 bottom-1 top-4 grid place-items-center">
                        <WildSnakeArt wild={groveWilds[i]} mini />
                      </div>
                    )}
                    {wasSearched && !showPython && (
                      <span className="absolute right-2 top-2 rounded-full bg-black/70 px-2 py-0.5 text-[10px] font-bold text-white/40">
                        ∅
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            <Image src={FOREGROUND_ART} alt="" aria-hidden="true" fill sizes="(max-width: 640px) 100vw, 48rem" draggable={false} className="pointer-events-none object-cover opacity-60 mix-blend-screen" />
          </div>
          {grove.pythonSpot === null && searched.every(Boolean) && (
            <p className="mt-3 text-center text-xs italic text-white/40">Only leaves — the signs misled you this time.</p>
          )}
          {groveNote && (
            <p className="mt-3 text-center text-xs font-semibold text-amber-200/80">{groveNote}</p>
          )}
          {canExamineShed && (
            <div className="mt-3 text-center">
              <button
                type="button"
                onClick={examineShed}
                className="rounded-full border border-amber-200/30 bg-amber-200/[.07] px-5 py-2 text-xs font-bold uppercase tracking-[.14em] text-amber-100 transition hover:bg-amber-200/[.14] active:scale-95"
              >
                Examine the shed
              </button>
            </div>
          )}
          {canLure && (
            <div className="mt-3 text-center">
              <button
                type="button"
                onClick={deployLure}
                className="rounded-full border border-lime-300/30 bg-lime-300/[.07] px-5 py-2 text-xs font-bold uppercase tracking-[.14em] text-lime-100 transition hover:bg-lime-300/[.14] active:scale-95"
              >
                🍃 Deploy scent lure · {lureCharges} left
              </button>
              <p className="mt-1 text-[11px] text-white/35">Draws the python out — no search spent</p>
            </div>
          )}
          {lureCharges > 0 && !canLure && phase === "grove" && (
            <p className="mt-3 text-center text-[11px] font-bold uppercase tracking-[.16em] text-lime-200/50">
              🍃 {lureCharges} {permit ? (lureCharges === 1 ? "tool" : "tools") : lureCharges === 1 ? "scent lure ready" : "scent lures ready"}
            </p>
          )}
          {nightEvent === "sloughing" && (
            <p className="mt-3 text-center text-[11px] font-bold uppercase tracking-[.16em] text-amber-200/60">
              Sloughing night — sheds everywhere, every one a clue
            </p>
          )}
          {legIndex >= 2 && (
            <p className="mt-3 text-center text-[11px] font-bold uppercase tracking-[.16em] text-white/35">
              The night deepens — the snakes are warier now
            </p>
          )}
          <button
            type="button"
            onClick={followTrail}
            className="mt-4 w-full rounded-2xl border border-emerald-300/25 bg-emerald-300/[.07] px-6 py-3.5 text-sm font-bold text-emerald-100 transition hover:bg-emerald-300/[.12] active:scale-[.99]"
          >
            {legIndex + 1 >= grovesPerExpedition ? "Finish the expedition →" : "Follow the trail →"}
          </button>
          <p className="mt-3 text-center text-xs text-white/35">Tap a tree or the undergrowth to search it — or move on down the trail.</p>
        </div>
      )}

      {/* River port — resupply stop (gated playtest) */}
      {phase === "port" && (
        <div className="mt-8">
          <TrailStatus region={region} legIndex={legIndex} searchesLeft={searchesLeft} bagCount={bag.length} streak={streak} phaseName={phaseName} totalGroves={grovesPerExpedition} />
          {!portArrived ? (
            /* Arrival — pulling up to the river port at dusk */
            <div className="relative aspect-[4/3] overflow-hidden rounded-[26px] border border-white/[.07] sm:aspect-[16/9]">
              <div className="absolute inset-0 animate-[port-arrive_7s_ease-out_forwards]">
                <Image src={PORT_DUSK_ART} alt="Pulling up to the river port at dusk" fill sizes="(max-width: 640px) 100vw, 48rem" draggable={false} className="object-cover" />
              </div>
              <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,transparent_40%,rgba(4,10,8,.82)_100%)]" />
              <div className="absolute inset-x-0 bottom-0 p-6 text-center">
                <p className="text-[10px] font-black uppercase tracking-[.24em] text-amber-100/80">Pulling up to the river port</p>
                <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-white/60">
                  Lanterns on the water, halfway into the night. The trader&apos;s waiting.
                </p>
                <button
                  type="button"
                  onClick={() => setPortArrived(true)}
                  className="mt-4 rounded-2xl bg-amber-200 px-8 py-3.5 text-sm font-bold text-[#1a1005] transition hover:bg-amber-100 active:scale-[.99]"
                >
                  Step onto the dock →
                </button>
              </div>
            </div>
          ) : (
            <PortTraderShop
              view={portShopView}
              onViewChange={setPortShopView}
              items={portStock}
              soldIds={portSold}
              boughtCount={portBought}
              tokenBal={tokenBal}
              sheds={sheds}
              finds={satchelFinds}
              onSellFinds={sellFinds}
              intelTaken={portIntel}
              bounty={portBounty}
              bountyTaken={portBountyTaken}
              boatmanLine={BOATMAN_LINES[region?.id ?? "default"] ?? BOATMAN_LINES.default}
              onBuy={buyPortItem}
              onTradeShed={tradeShed}
              onTakeBounty={() => {
                setPortBountyTaken(true);
                log(`River port — took the notice-board bounty: ${portBounty?.sex} ${portBounty?.locality} tonight.`);
              }}
              onCastOff={() => castOff()}
            />
          )}

          <button
            type="button"
            onClick={() => castOff(true)}
            className="mt-4 w-full rounded-2xl border border-white/10 bg-white/[.04] px-6 py-3.5 text-sm font-bold text-white/80 transition hover:bg-white/[.08] active:scale-[.99]"
          >
            Push on into deep night → <span className="font-normal text-white/45">(bat-swarm edge next grove)</span>
          </button>
        </div>
      )}

      {/* Catch */}
      {phase === "catch" && currentWild && (
        <div className="mx-auto mt-8 max-w-xl overflow-hidden rounded-[26px] border border-white/[.07] bg-white/[.02]">
          <div className="relative">
            <div className="relative h-40 sm:h-48">
              <Image src={CATCH_ART} alt="" aria-hidden="true" fill sizes="(max-width: 640px) 100vw, 36rem" draggable={false} className="object-cover" />
              <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(4,10,8,.25)_0%,rgba(4,10,8,.88)_100%)]" />
            </div>
            <div className="relative mx-auto -mt-24 w-64 sm:-mt-28 sm:w-80">
              <div className="absolute inset-6 rounded-full bg-emerald-400/15 blur-3xl" aria-hidden="true" />
              <div className="relative drop-shadow-[0_0_35px_rgba(52,211,153,.25)]">
                <WildSnakeArt wild={currentWild} />
              </div>
            </div>
          </div>
          <div className="p-6 sm:p-8 sm:pt-2">
            <h2 className="text-center text-xl font-semibold text-white">{currentWild.name}</h2>
            <p className="mt-1 text-center text-sm text-white/50">
              {currentWild.locality} · {currentWild.sex} · {currentWild.lifeStage}
            </p>
            <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
              <span className="rounded-full border border-white/10 bg-white/[.05] px-3 py-1 text-[10px] font-black uppercase tracking-[.14em] text-white/60">
                {currentWild.lifeStage}
              </span>
              {currentWild.gravid && <GravidBadge />}
            </div>
            {currentWild.gravid && !catchResolved && (
              <p className="mx-auto mt-3 max-w-sm text-center text-xs leading-5 text-pink-200/80">
                She&apos;s carrying — bring her home and she&apos;ll lay a pure {currentWild.locality} clutch.
              </p>
            )}
            {currentWild.exceptionalTraitLabel && (
              <p className="mx-auto mt-3 w-fit rounded-full border border-amber-200/25 bg-amber-200/[.07] px-4 py-1.5 text-xs font-bold text-amber-100">
                {currentWild.exceptionalTraitLabel}
              </p>
            )}

            {!catchResolved ? (
              <div className="mt-6">
                {streak >= 1 && (
                  <p className="mb-3 text-center">
                    <span className="inline-block rounded-full border border-orange-300/30 bg-orange-400/10 px-4 py-1 text-[11px] font-black uppercase tracking-[.16em] text-orange-200">
                      Streak ×{streak} — keep it hot
                    </span>
                  </p>
                )}
                <p className="text-center text-xs uppercase tracking-[.16em] text-white/40">
                  Tap grab when the marker is in the green
                </p>
                {batSwarm && (
                  <p className="mt-2 text-center text-[11px] font-bold uppercase tracking-[.14em] text-sky-200/70">
                    Bat swarm overhead — wider green zone
                  </p>
                )}
                <div className="relative mt-3 h-5 overflow-hidden rounded-full border border-white/10 bg-black/50">
                  <div
                    className="absolute inset-y-0 rounded-full bg-emerald-400/35"
                    style={{ left: `${(zoneCenter - zoneHalf) * 100}%`, width: `${zoneHalf * 2 * 100}%` }}
                  />
                  <div
                    ref={markerRef}
                    className="absolute inset-y-[-2px] w-1.5 -translate-x-1/2 rounded-full bg-white shadow-[0_0_12px_rgba(255,255,255,.8)]"
                    style={{ left: "0%" }}
                  />
                </div>
                {canSureGrip && (
                  <button
                    type="button"
                    onPointerDown={(e) => {
                      if (e.pointerType !== "mouse") {
                        e.preventDefault();
                        deploySureGrip();
                      }
                    }}
                    onClick={deploySureGrip}
                    className="mb-3 w-full touch-manipulation select-none rounded-2xl border border-lime-300/30 bg-lime-300/[.07] px-6 py-3 text-sm font-bold uppercase tracking-[.12em] text-lime-100 transition hover:bg-lime-300/[.14] active:scale-[.99]"
                  >
                    ✊ Sure grip — cannot miss · {gripCharges} left
                  </button>
                )}
                <button
                  type="button"
                  onPointerDown={(e) => {
                    // Timing-critical: fire on press, not on release, and
                    // suppress the emulated click so grab() runs exactly once.
                    if (e.pointerType !== "mouse") {
                      e.preventDefault();
                      grab();
                    }
                  }}
                  onClick={() => grab()}
                  className="mt-5 w-full touch-manipulation select-none rounded-2xl bg-emerald-300 px-6 py-4 text-base font-bold text-[#06100c] transition hover:bg-emerald-200 active:scale-[.99]"
                >
                  GRAB
                </button>
              </div>
            ) : (
              <div className="mt-6 text-center">
                <p className={`text-sm leading-6 ${catchSuccess ? "text-emerald-200" : "text-white/55"}`}>
                  {catchMessage}
                </p>
                <button
                  type="button"
                  onClick={backToGrove}
                  className="mt-5 w-full rounded-2xl border border-white/10 bg-white/[.04] px-6 py-3.5 text-sm font-bold text-white/80 transition hover:bg-white/[.08]"
                >
                  Back to the grove
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Results */}
      {phase === "results" && (
        <div className="mx-auto mt-8 max-w-xl">
          <div className="overflow-hidden rounded-[26px] border border-white/[.07] bg-white/[.02]">
            <div className="relative h-44 sm:h-52">
              <Image src={PYTHON_ART} alt="" aria-hidden="true" fill sizes="(max-width: 640px) 100vw, 36rem" draggable={false} className="object-cover object-top" />
              <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(4,10,8,.30)_0%,rgba(4,10,8,.92)_100%)]" />
              <div className="absolute bottom-3 left-6 right-6 sm:left-8 sm:right-8">
                <h2 className="text-xl font-semibold text-white">Expedition complete</h2>
                <p className="mt-1 text-sm text-white/50">
                  {region ? `${region.name} · ` : ""}{bag.length} caught · {escapedCount} escaped
                </p>
              </div>
              <div
                className={`absolute bottom-4 right-6 grid h-16 w-16 place-items-center rounded-full border-2 bg-black/70 backdrop-blur-sm sm:right-8 ${RANK_STYLES[score.rank]}`}
                title={`Hunter rank ${score.rank} · ${score.points} pts`}
              >
                <span className="text-3xl font-black">{score.rank}</span>
              </div>
            </div>
            <div className="p-6 sm:p-8">

            <p className="text-center text-sm italic text-white/55">{EXPEDITION_RANK_LINES[score.rank]}</p>
            <p className="mt-1 text-center text-[11px] text-white/35">
              Hunter rank {score.rank} · {score.points} pts — +40 per catch, +10 per streak best, −10 per escape, −5 per search past the fourth, +10 per trophy animal
            </p>

            {bag.length > 0 ? (
              <>
                <div className="mt-4 flex flex-wrap items-center justify-center gap-x-5 gap-y-1 rounded-2xl border border-white/[.07] bg-white/[.02] px-4 py-3 text-[11px] font-semibold uppercase tracking-[.14em] text-white/50">
                  <span>
                    Found · <span className="text-emerald-200">{bag.length}/{grovesPerExpedition}</span>
                  </span>
                  <span>
                    Best streak · <span className="text-emerald-200">×{bestStreak}</span>
                  </span>
                  <span>
                    Sheds · <span className="text-emerald-200">{sheds}</span>
                  </span>
                  <span>
                    Searches used · <span className="text-emerald-200">{searchesUsed}</span>
                  </span>
                  <span>
                    Escaped · <span className="text-emerald-200">{escapedCount}</span>
                  </span>
                  {primeCaught > 0 && (
                    <span>
                      Trophies · <span className="text-amber-200">{primeCaught}</span>
                    </span>
                  )}
                </div>
                {bestFind && (
                  <p className="mt-3 text-center text-sm">
                    <span className="text-[10px] font-black uppercase tracking-[.16em] text-amber-200/70">Best find · </span>
                    <span className="font-bold text-amber-100">{bestFind.name}</span>
                    <span className="text-white/50"> — phenotype {bestFind.phenotypeScore}</span>
                  </p>
                )}
              </>
            ) : null}

            {codex.length > 0 && (
              <div className="mt-4 rounded-2xl border border-white/[.07] bg-white/[.02] p-4">
                <p className="text-center text-[10px] font-black uppercase tracking-[.16em] text-white/40">
                  Locality codex · <span className="text-emerald-200">{codex.length}/{CANOPY_LOCALITIES.length}</span> documented
                </p>
                <div className="mt-2.5 flex flex-wrap justify-center gap-1.5">
                  {CANOPY_LOCALITIES.map((loc) => {
                    const found = codex.includes(loc);
                    const isNew = newCodexAdds.includes(loc);
                    return (
                      <span
                        key={loc}
                        className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[.1em] ${
                          found
                            ? "border-emerald-300/30 bg-emerald-300/[.08] text-emerald-100"
                            : "border-white/10 text-white/25"
                        } ${isNew ? "ring-1 ring-amber-300/60" : ""}`}
                      >
                        {loc}
                        {isNew && <span className="text-amber-300"> · new</span>}
                      </span>
                    );
                  })}
                </div>
                {newCodexAdds.length > 0 && (
                  <p className="mt-2 text-center text-xs font-semibold text-amber-200/80">
                    New {newCodexAdds.length === 1 ? "locality" : "localities"} inked tonight: {newCodexAdds.join(", ")}
                  </p>
                )}
              </div>
            )}

            {bag.length > 0 ? (
              <ul className="mt-4 space-y-3">
                {bag.map((wild) => (
                  <li
                    key={wild.name}
                    className="flex items-center gap-4 rounded-2xl border border-white/[.06] bg-black/40 p-3"
                  >
                    <div className="h-20 w-20 shrink-0">
                      <WildSnakeArt wild={wild} mini />
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="truncate text-sm font-bold text-white">{wild.name}</div>
                        {wild.prime && (
                          <span className="rounded-full border border-yellow-300/40 bg-yellow-300/[.1] px-2 py-0.5 text-[9px] font-black uppercase tracking-[.14em] text-yellow-200">
                            Trophy
                          </span>
                        )}
                        {bestFind && wild.name === bestFind.name && (
                          <span className="rounded-full border border-amber-200/30 bg-amber-200/[.08] px-2 py-0.5 text-[9px] font-black uppercase tracking-[.14em] text-amber-200">
                            Best find
                          </span>
                        )}
                        {wild.gravid && <GravidBadge />}
                      </div>
                      <div className="mt-0.5 text-xs text-white/50">
                        {wild.locality} · {wild.sex} · {wild.lifeStage}
                        {wild.lifeStage === "Neonate" ? ` · ${wild.neonateColor} neonate` : ""}
                      </div>
                      {wild.exceptionalTraitLabel && (
                        <div className="mt-1 text-xs font-bold text-amber-200/90">
                          {wild.exceptionalTraitLabel}
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm leading-6 text-white/50">
                No snakes this time — the canopy kept its secrets. Try another expedition.
              </p>
            )}

            {bag.length > 0 && !sent && (
              <button
                type="button"
                onClick={bringHome}
                className="mt-6 w-full rounded-2xl bg-emerald-300 px-6 py-4 text-base font-bold text-[#06100c] transition hover:bg-emerald-200 active:scale-[.99]"
              >
                Bring {bag.length === 1 ? "it" : `all ${bag.length}`} home to the colony
              </button>
            )}

            {journal.length > 0 && (
              <div className="mt-6 rounded-2xl border border-white/[.07] bg-black/30 p-4 sm:p-5">
                <h3 className="text-[10px] font-black uppercase tracking-[.2em] text-white/40">
                  Field notes
                </h3>
                <ul className="mt-2 space-y-1.5">
                  {journal.map((line, i) => (
                    <li key={i} className="text-xs leading-5 text-white/55">
                      <span className="mr-2 text-emerald-300/50">·</span>
                      {line}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {sent && (
              <div className="mt-6 rounded-2xl border border-emerald-300/20 bg-emerald-300/[.07] p-4 text-center">
                <p className="text-sm font-bold text-emerald-200">
                  {bag.length} {bag.length === 1 ? "snake" : "snakes"} added to your colony.
                </p>
                <button
                  type="button"
                  onClick={onClose}
                  className="mt-2 text-sm font-semibold text-emerald-100 underline decoration-emerald-200/30 underline-offset-4 transition hover:text-white"
                >
                  Back to the game
                </button>
              </div>
            )}

            {(sent || bag.length === 0) && (
              <button
                type="button"
                onClick={onExitToGate}
                className="mt-4 w-full rounded-2xl border border-white/10 bg-white/[.04] px-6 py-3.5 text-sm font-bold text-white/80 transition hover:bg-white/[.08]"
              >
                Plan another expedition
              </button>
            )}
          </div>
        </div>
      </div>
      )}
    </div>
  );
}

/** Rank badge colors for the results screen. */
const RANK_STYLES: Record<ExpeditionRank, string> = {
  S: "border-amber-300/60 text-amber-300 shadow-[0_0_30px_rgba(252,211,77,.25)]",
  A: "border-emerald-300/60 text-emerald-300 shadow-[0_0_30px_rgba(110,231,183,.20)]",
  B: "border-sky-300/50 text-sky-300",
  C: "border-white/25 text-white/70",
  D: "border-white/15 text-white/40",
};

function TrailStatus({
  region,
  legIndex,
  searchesLeft,
  bagCount,
  streak,
  phaseName,
  grove = false,
  totalGroves,
}: {
  region: CanopyRegion | null;
  legIndex: number;
  searchesLeft: number;
  bagCount: number;
  streak: number;
  phaseName: string;
  grove?: boolean;
  totalGroves: number;
}) {
  return (
    <div className="mb-3 text-center">
      {region && (
        <>
          <div className="text-[10px] font-bold uppercase tracking-[.2em] text-emerald-200/60">
            {grove ? `Grove ${legIndex + 1} of ${totalGroves}` : `Leg ${legIndex + 1} of ${totalGroves} — choose your path`} · {phaseName}
          </div>
          <div className="mt-1 text-lg font-semibold text-white">{region.name}</div>
          <p className="mt-0.5 text-xs text-white/40">{region.tagline}</p>
        </>
      )}
      <div className="mx-auto mt-3 flex max-w-md items-center justify-between rounded-2xl border border-white/[.07] bg-white/[.02] px-4 py-3">
        <span className="text-xs font-semibold uppercase tracking-[.14em] text-white/50">
          Searches this grove · <span className="text-emerald-200">{searchesLeft}</span>
        </span>
        <span className={`text-xs font-semibold uppercase tracking-[.14em] ${streak >= 2 ? "text-orange-200" : "text-white/50"}`}>
          Streak · <span className={streak >= 2 ? "text-orange-200" : "text-emerald-200"}>×{streak}</span>
        </span>
        <span className="text-xs font-semibold uppercase tracking-[.14em] text-white/50">
          Bagged · <span className="text-emerald-200">{bagCount}</span>
        </span>
      </div>
    </div>
  );
}
