"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArborealPlanetMark } from "@/components/BrandVisuals"; import { playHankScaleLine } from "@/lib/hank-scale-voice";

import { ArborealKeeperProgramHub } from "@/components/ArborealKeeperProgramHub";
import { ArborealKeeperAdHero } from "@/components/ArborealKeeperAdHero";
import IntroCinematic from "@/components/IntroCinematic";
import { ArborealKeeperFacilityOverview } from "@/components/ArborealKeeperFacilityOverview";
import { ArborealKeeperReptiShop } from "@/components/ArborealKeeperReptiShop";
import { ArborealKeeperReptiShopHalloween } from "@/components/ArborealKeeperReptiShopHalloween";
import { ChondroBreederGameV3, hasSeenIntroCinematic } from "@/components/ChondroBreederGameV3";
import { ChondroBreederManagementView } from "@/components/ChondroBreederCommandCenter";
import { ChondroBreederSubspeciesPhenotypes } from "@/components/ChondroBreederSubspeciesPhenotypes";
import { ChondroBreederHomeStatus } from "@/components/ChondroBreederHomeStatus";
import { ChondroGameNotifications } from "@/components/ChondroGameNotifications";
import { ChondroRetiredBreedersPanel } from "@/components/ChondroRetiredBreedersPanel";
import { ChondroClutchOutcomeExplainer } from "@/components/ChondroClutchOutcomeExplainer";
import { ChondroConservationPartnerships } from "@/components/ChondroConservationPartnerships";
import { ChondroBreedingFocusHeader } from "@/components/ChondroBreedingFocusHeader";
import { ChondroClutchHistoryTable } from "@/components/ChondroClutchHistoryTable";
import { ChondroClutchStageArt } from "@/components/ChondroClutchStageArt";
import { ChondroBreederScreenArt } from "@/components/ChondroBreederScreenArt";
import { ChondroCollectionManager } from "@/components/ChondroCollectionManager";
import { ChondroActiveClutchShowcase } from "@/components/ChondroActiveClutchShowcase";
import { ChondroColonyOverview } from "@/components/ChondroColonyOverview";
import { requestExpeditionOpen, EXPEDITION_FREE_COOLDOWN_MS, EXPEDITION_PYTHONS } from "@/lib/canopy-hunter";
import { CanopyHunterSlideshow } from "@/components/arcade/CanopyHunterSlideshow";
import { animalHousingCapacity } from "@/lib/chondro-facility-limits";

type WorkspaceView = "home" | "breeding" | "colony" | "clutches" | "market" | "career" | "projects" | "conservation" | "community" | "guide";

/** Seven-day window in ms — derived from the expedition free-cooldown so the
 * Home card stays in sync with the entry model in src/lib/canopy-hunter.ts. */
const DAY_MS = EXPEDITION_FREE_COOLDOWN_MS / 7;

// Live cadence for the Canopy Hunter Home quick action: only a started save
// gets the card, and it re-reads the save whenever the game persists (the
// Home screen and the game never mount at the same time). Also reads housing
// so the card reflects the blocked state instead of advertising a trip the
// entry gate would refuse. SSR-safe via the window guard.
function readExpeditionCardState(): { started: boolean; freeReady: boolean; freeInDays: number; blocked: boolean } {
  const empty = { started: false, freeReady: false, freeInDays: 0, blocked: false };
  if (typeof window === "undefined") return empty;
  try {
    const raw = window.localStorage.getItem("arboreal_chondro_breeder_v2");
    if (!raw) return empty;
    const parsed = JSON.parse(raw) as {
      started?: unknown;
      expeditionNextAt?: unknown;
      colony?: unknown;
      enclosures?: Record<string, number> | null;
    };
    if (parsed.started !== true) return empty;
    const nextAt = typeof parsed.expeditionNextAt === "number" ? parsed.expeditionNextAt : 0;
    const freeReady = Date.now() >= nextAt;
    const colonySize = Array.isArray(parsed.colony) ? parsed.colony.length : 0;
    const openSlots = Math.max(0, animalHousingCapacity(parsed.enclosures) - colonySize);
    return {
      started: true,
      freeReady,
      freeInDays: freeReady ? 0 : Math.max(1, Math.ceil((nextAt - Date.now()) / DAY_MS)),
      blocked: openSlots < EXPEDITION_PYTHONS,
    };
  } catch {
    return empty;
  }
}

type ViewMeta = {
  label: string;
  navLabel?: string;
  detail: string;
  icon: string;
};

const views: Array<{ id: WorkspaceView } & ViewMeta> = [
  { id: "home", label: "Home", detail: "Breeder command center", icon: "⌂" },
  { id: "breeding", label: "Breed", navLabel: "Breed", detail: "Choose adult breeders and follow the reproductive cycle", icon: "◇" },
  { id: "colony", label: "Animals", navLabel: "Animals", detail: "Raise, test and manage every animal", icon: "◎" },
  { id: "clutches", label: "Offspring", navLabel: "Offspring", detail: "Eggs, hatchlings, holdbacks and clutch history", icon: "◉" },
  { id: "market", label: "Store", navLabel: "Store", detail: "Buy enclosures and animals", icon: "$" },
  { id: "career", label: "Career", detail: "Facility, shows and progression", icon: "↗" },
  { id: "projects", label: "Projects", detail: "Lines, traits and breeding goals", icon: "◈" },
  { id: "conservation", label: "Conservation", detail: "Regional conservation program", icon: "⌁" },
  { id: "community", label: "Network", detail: "Breeder community and activity", icon: "◌" },
  { id: "guide", label: "Field Guide", detail: "Subspecies, locality and phenotype reference", icon: "?" },
];

const dockViews = ["home", "breeding", "colony", "clutches", "market"] as const;
const dockIconByView: Record<(typeof dockViews)[number], string> = {
  home: "/hatchery/game/dock/home.webp",
  breeding: "/hatchery/game/dock/breed.webp",
  colony: "/hatchery/game/dock/animals.webp",
  clutches: "/hatchery/game/dock/offspring.webp",
  market: "/hatchery/game/dock/store.webp",
};
const coreViews = new Set<WorkspaceView>(["breeding", "colony", "clutches"]);

export function ChondroBreederWorkspace() {
  const [view, setView] = useState<WorkspaceView>("home");
  // Bottom dock collapses left (mobile) to reveal more of the current view —
  // e.g. extra store height. Always starts open so players never log in to a
  // missing nav; collapsing lasts only for the session. Desktop keeps the
  // dock always visible.
  const [navCollapsed, setNavCollapsed] = useState(false);
  // Seasonal shop theme: the owner can flip the Arboreal Keeper shop to its
  // Halloween reskin from the owner console. Fetched once on mount; any
  // failure keeps the standard shop.
  const [shopTheme, setShopTheme] = useState<"default" | "halloween">("default");
  useEffect(() => {
    let active = true;
    void fetch("/api/site-settings?key=shop_theme", { cache: "no-store" })
      .then((response) => response.json().catch(() => null))
      .then((data) => {
        if (active && data && data.value === "halloween") setShopTheme("halloween");
      })
      .catch(() => {});
    return () => { active = false; };
  }, []);
  // Hank's costume is its own owner toggle (site setting hank_costume),
  // separate from the shop theme: flipping it swaps Hank's shop loops to
  // the Captain Spaulding set in whichever shop is showing.
  const [hankCostume, setHankCostume] = useState(false);
  useEffect(() => {
    let active = true;
    void fetch("/api/site-settings?key=hank_costume", { cache: "no-store" })
      .then((response) => response.json().catch(() => null))
      .then((data) => {
        if (active && data && data.value === "on") setHankCostume(true);
      })
      .catch(() => {});
    return () => { active = false; };
  }, []);
  function toggleNavCollapsed() {
    setNavCollapsed((prev) => !prev);
  }
  // Title-screen behavior: the splash shows on every visit to the Arboreal
  // Keeper entry routes. Dismissing it reveals the game underneath, untouched.
  const [showAd, setShowAd] = useState(true);
  const [replayingIntro, setReplayingIntro] = useState(false);
  // The replay option only appears once the player has actually seen the
  // cinematic — read from the persisted mirror so it works on fresh devices.
  const [canReplayIntro] = useState(hasSeenIntroCinematic);
  const viewRef = useRef<WorkspaceView>("home"); const bredLineRef = useRef(false);
  const active = views.find((item) => item.id === view) ?? views[0];

  function openView(next: WorkspaceView) { if (viewRef.current === "market" && next !== "market") playHankScaleLine(16); if (next === "breeding" && !bredLineRef.current) { bredLineRef.current = true; playHankScaleLine(14); } viewRef.current = next;
    setView(next);
    window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "auto" }));
  }

  return (
    <div className="min-h-[100dvh] bg-[#030806] pb-[calc(104px+env(safe-area-inset-bottom))] text-white">
      {showAd ? (
        <ArborealKeeperAdHero
          onEnter={() => setShowAd(false)}
          onReplayIntro={canReplayIntro ? () => { setShowAd(false); setReplayingIntro(true); } : undefined}
        />
      ) : null}
      <header className="sticky top-0 z-[70] border-b border-white/[.055] bg-[#030806]/96 backdrop-blur-xl">
        <div className="mx-auto flex min-h-[60px] max-w-[1500px] items-center gap-3 px-3 sm:min-h-[66px] sm:px-5">
          <Link
            href="/"
            aria-label="Exit Arboreal Keeper and return to Arboreal Planet"
            title="Return to Arboreal Planet" onClick={() => playHankScaleLine(8)}
            className="group grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-white/[.07] bg-white/[.025] transition hover:border-emerald-300/20 hover:bg-white/[.045] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/40"
          >
            <ArborealPlanetMark className="h-9 w-9 transition group-hover:scale-[1.03]" />
          </Link>

          <div className="min-w-0">
            <div className="text-[9px] font-black uppercase tracking-[.17em] text-emerald-200/44">Arboreal Keeper</div>
            <div className="mt-0.5 truncate text-sm font-semibold text-white/80">{active.label}</div>
          </div>

          <div className="ml-auto hidden items-center gap-2 sm:flex">
            <div className="rounded-full border border-emerald-300/10 bg-emerald-300/[.035] px-3 py-1.5 text-[9px] font-black uppercase tracking-[.14em] text-emerald-100/48">Game running</div>
          </div>
        </div>
      </header>

      <main>
        {view === "home" ? <BreederHome onOpen={openView} /> : null}
        {view === "market" ? (
          shopTheme === "halloween"
            ? <ArborealKeeperReptiShopHalloween navCollapsed={navCollapsed} costume={hankCostume} />
            : <ArborealKeeperReptiShop navCollapsed={navCollapsed} costume={hankCostume} />
        ) : coreViews.has(view) ? <CoreGameScreen view={view as "breeding" | "colony" | "clutches"} /> : null}
        {view === "career" ? (
          <SecondaryScreen active={active} onBack={() => openView("home")}>
            <section className="mx-auto mb-6 max-w-7xl px-4 sm:px-6">
              <div className="overflow-hidden rounded-[30px] border border-amber-200/12 bg-[#06100c] shadow-[0_24px_70px_rgba(0,0,0,.22)]">
                <div className="grid lg:min-h-[300px] lg:grid-cols-[minmax(300px,42%)_1fr]">
                  <div className="relative min-h-[250px] overflow-hidden border-b border-white/[.06] bg-black/35 lg:min-h-full lg:border-b-0 lg:border-r">
                    <Image src="/hatchery/game/incubator.webp" alt="Illustrated Arboreal Keeper incubator" fill sizes="(max-width: 1024px) 100vw, 42vw" className="object-cover" />
                    <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,transparent_52%,rgba(3,8,6,.64)_100%)] lg:bg-[linear-gradient(90deg,transparent_60%,rgba(6,16,12,.75)_100%)]" />
                  </div>
                  <div className="relative flex items-center overflow-hidden p-5 sm:p-7 lg:p-9">
                    <div className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-amber-200/[.055] blur-3xl" />
                    <div className="relative">
                      <div className="text-[9px] font-black uppercase tracking-[.19em] text-amber-100/55">Facility progression</div>
                      <h2 className="mt-3 text-2xl font-semibold tracking-[-.04em] text-white sm:text-3xl">Build the operation behind the breeding program.</h2>
                      <p className="mt-3 max-w-xl text-sm leading-6 text-white/48 sm:text-[15px]">Capacity, incubation and research upgrades now have a visual home alongside the career systems.</p>
                    </div>
                  </div>
                </div>
              </div>
            </section>
            <ArborealKeeperFacilityOverview />
            <ChondroBreederManagementView section="career" />
          </SecondaryScreen>
        ) : null}
        {view === "projects" ? <SecondaryScreen active={active} onBack={() => openView("home")}><ChondroBreederManagementView section="projects" /></SecondaryScreen> : null}
        {view === "conservation" ? <SecondaryScreen active={active} onBack={() => openView("home")}><ChondroConservationPartnerships /></SecondaryScreen> : null}
        {view === "community" ? <SecondaryScreen active={active} onBack={() => openView("home")}><ChondroBreederManagementView section="community" /></SecondaryScreen> : null}
        {view === "guide" ? <SecondaryScreen active={active} onBack={() => openView("home")}><ChondroBreederSubspeciesPhenotypes /></SecondaryScreen> : null}
      </main>

      <ChondroGameNotifications />

      {/* Dock collapse handle — mobile only. Tucks the nav left; tap again to bring it back. */}
      <button
        type="button"
        onClick={toggleNavCollapsed}
        aria-expanded={!navCollapsed}
        aria-label={navCollapsed ? "Expand navigation bar" : "Collapse navigation bar"}
        className="fixed bottom-[calc(25px+env(safe-area-inset-bottom))] left-0 z-[81] flex h-12 w-7 items-center justify-center rounded-r-xl border border-l-0 border-white/10 bg-black/70 text-sm text-white/50 backdrop-blur-md transition hover:text-white/80 lg:hidden"
      >
        {navCollapsed ? "›" : "‹"}
      </button>

      <nav
        className={`fixed inset-x-0 bottom-0 z-[80] mx-auto grid h-[calc(98px+env(safe-area-inset-bottom))] grid-cols-5 gap-1 border-t border-white/[.08] bg-[#030806]/97 px-1.5 pb-[env(safe-area-inset-bottom)] pt-2 shadow-[0_-18px_50px_rgba(0,0,0,.34)] backdrop-blur-xl transition-transform duration-300 ease-out sm:px-3 lg:bottom-4 lg:h-[98px] lg:max-w-[800px] lg:rounded-[24px] lg:border lg:px-4 lg:pb-2 ${navCollapsed ? "max-lg:-translate-x-full" : ""}`}
        aria-label="Arboreal Keeper navigation"
      >
        {dockViews.map((id) => {
          const item = views.find((entry) => entry.id === id)!;
          const selected = view === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => openView(id)}
              aria-label={item.navLabel ?? item.label}
              title={item.navLabel ?? item.label}
              aria-current={selected ? "page" : undefined}
              className={`group flex min-w-0 items-center justify-center rounded-2xl p-0.5 transition ${selected ? "bg-emerald-300/[.09] shadow-[0_0_24px_rgba(110,231,183,.10)]" : "hover:bg-white/[.035]"}`}
            >
              <span className={`relative block h-[68px] w-[68px] overflow-hidden rounded-[19px] border transition sm:h-[74px] sm:w-[74px] ${selected ? "scale-[1.04] border-emerald-200/45 shadow-[0_0_24px_rgba(110,231,183,.18)]" : "border-white/[.07] opacity-88 group-hover:opacity-100"}`}>
                <Image
                  src={dockIconByView[id]}
                  alt=""
                  fill
                  sizes="74px"
                  className="object-cover"
                />
                <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/45 to-transparent px-1 pb-1.5 pt-6 text-center text-[8px] font-black uppercase tracking-[.2em] text-white/95">
                  {item.navLabel ?? item.label}
                </span>
              </span>
            </button>
          );
        })}
      </nav>

      {/* Title-screen intro replay: full-screen above everything; never re-grants credit. */}
      {replayingIntro ? (
        <div className="fixed inset-0 z-[95]">
          <IntroCinematic onDone={() => setReplayingIntro(false)} />
        </div>
      ) : null}
    </div>
  );
}

function ScreenHeading({ eyebrow, title, detail }: { eyebrow: string; title: string; detail: string }) {
  return (
    <div className="mx-auto max-w-7xl px-4 pt-5 sm:px-6 sm:pt-7">
      <div className="border-b border-white/[.055] pb-4">
        <div className="text-[9px] font-black uppercase tracking-[.16em] text-emerald-200/42">{eyebrow}</div>
        <h1 className="mt-2 text-2xl font-semibold tracking-[-.035em] text-white sm:text-3xl">{title}</h1>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-white/42">{detail}</p>
      </div>
    </div>
  );
}

function BreederHome({ onOpen }: { onOpen: (view: WorkspaceView) => void }) {
  const tools: WorkspaceView[] = ["career", "projects", "conservation", "community", "guide"];
  const [expedition, setExpedition] = useState(readExpeditionCardState);
  useEffect(() => {
    const refresh = () => setExpedition(readExpeditionCardState());
    window.addEventListener("arboreal-chondro-breeder-save-change", refresh);
    return () => window.removeEventListener("arboreal-chondro-breeder-save-change", refresh);
  }, []);
  function openExpedition() {
    // One-shot intent: the game is not mounted while Home is showing, so flag
    // the request, then navigate to a core view where the game mounts and
    // consumes it (falling back to the CustomEvent if already mounted).
    requestExpeditionOpen();
    onOpen("colony");
  }
  return (
    <div className="mx-auto max-w-[1500px] px-3 py-3 sm:px-5 sm:py-5">
      <div className="overflow-hidden rounded-[28px] border border-white/[.065] bg-[#06100c] shadow-[0_26px_90px_rgba(0,0,0,.28)]">
        <div className="p-3 sm:p-5">
          <div className="relative min-h-44 overflow-hidden rounded-[26px] border border-white/[.08] bg-black shadow-2xl shadow-black/25 sm:min-h-56" role="img" aria-label="Arboreal Keeper shopkeeper Hank Scale holding a red neonate green tree python">
            <Image src="/hatchery/game/arboreal-keeper-ad-hero.webp" alt="" fill sizes="(max-width: 1500px) 100vw, 1500px" className="object-cover object-[center_22%]" priority />
            <div className="absolute inset-0 bg-gradient-to-r from-black/72 via-black/28 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/25 to-transparent p-5 sm:p-7">
              <div className="text-[10px] font-black uppercase tracking-[.2em] text-emerald-100/80">Arboreal Arcade</div>
              <div className="mt-1 text-3xl font-black tracking-[-.04em] text-white sm:text-4xl">Arboreal Keeper</div>
            </div>
          </div>

          {expedition.started ? (
            <div className="mt-4">
              <CanopyHunterSlideshow onPlay={openExpedition} />
            </div>
          ) : null}

          <section className="mt-4 overflow-hidden rounded-[30px] border border-emerald-300/12 bg-[#030806] shadow-[0_24px_70px_rgba(0,0,0,.28)]">
            <div className="grid lg:grid-cols-[minmax(330px,46%)_1fr]">
              <div className="relative min-h-[260px] overflow-hidden bg-black/35 lg:min-h-[360px]">
                <Image src="/hatchery/game/fresh-eggs.webp" alt="Illustrated green tree python eggs in the incubator" fill sizes="(max-width: 1024px) 100vw, 46vw" className="object-cover" priority />
              </div>
              <div className="relative flex items-center overflow-hidden p-5 sm:p-7 lg:p-9">
                <div className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-emerald-300/[.06] blur-3xl" />
                <div className="relative">
                  <div className="text-[9px] font-black uppercase tracking-[.19em] text-emerald-200/55">Your program is alive</div>
                  <h2 className="mt-3 text-2xl font-semibold tracking-[-.04em] text-white sm:text-3xl">Breed, incubate, hatch and build a lineage.</h2>
                  <p className="mt-3 max-w-2xl text-sm leading-6 text-white/48 sm:text-[15px]">The Arboreal Keeper artwork is part of the main experience. Move between breeding, animals, offspring and store screens to see the program progress visually.</p>
                  <div className="mt-5 h-px w-24 bg-gradient-to-r from-emerald-300/45 to-transparent" />
                </div>
              </div>
            </div>
          </section>

          <ArborealKeeperProgramHub />

          <ChondroBreederHomeStatus onOpen={(next) => onOpen(next)} />

          <section className="mt-4 rounded-[24px] border border-emerald-300/10 bg-emerald-300/[.025] p-4 sm:p-5">
            <div className="text-[9px] font-black uppercase tracking-[.16em] text-emerald-200/50">New player path</div>
            <h3 className="mt-2 text-lg font-semibold text-white/82">Follow these four steps and the game makes sense.</h3>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <QuickAction title="Store" detail="Buy an enclosure first, then choose your first animal." icon="1" onClick={() => onOpen("market")} emphasized />
              <QuickAction title="Animals" detail="Tap an animal to raise, test, name, sell or manage it." icon="2" onClick={() => onOpen("colony")} />
              <QuickAction title="Breed" detail="Once animals are adults, choose a male and female and start a cycle." icon="3" onClick={() => onOpen("breeding")} />
              <QuickAction title="Offspring" detail="Manage eggs and hatchlings, choose holdbacks and review results." icon="4" onClick={() => onOpen("clutches")} />
            </div>
          </section>

          <section className="mt-4 rounded-[24px] border border-white/[.06] bg-black/18 p-4 sm:p-6">
            <div className="text-[9px] font-black uppercase tracking-[.16em] text-emerald-200/44">Breeder command center</div>
            <h1 className="mt-3 text-3xl font-semibold tracking-[-.045em] text-white sm:text-4xl">Your breeding program</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-white/44">Your next recommended move stays at the top. The dock handles the main game loop while career, projects, conservation, breeder network and reference tools stay here when you need them.</p>
            <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {tools.map((id) => {
                const item = views.find((entry) => entry.id === id)!;
                return <ToolCard key={id} item={item} onClick={() => onOpen(id)} />;
              })}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function CoreGameScreen({ view }: { view: "breeding" | "colony" | "clutches" }) {
  const config: Record<"breeding" | "colony" | "clutches", { eyebrow: string; title: string; detail: string }> = {
    breeding: { eyebrow: "Reproduction", title: "Breed", detail: "Choose adult breeders, start a pairing and follow reproductive progress." },
    colony: { eyebrow: "Collection", title: "Animals", detail: "Tap any animal to raise its life stage, test it, rename it, add notes, sell it or manage its breeder record." },
    clutches: { eyebrow: "Offspring", title: "Offspring", detail: "Manage active eggs and hatchlings, choose holdbacks and review completed clutch history." } };
    
  const active = config[view];

  return (
    <>
      <ScreenHeading eyebrow={active.eyebrow} title={active.title} detail={active.detail} />
      <GameScreenGuide view={view} />
      {view === "breeding" || view === "colony" ? <ChondroBreederScreenArt screen={view} /> : null}
      {view === "breeding" ? <ChondroBreedingFocusHeader /> : null}
      {view === "clutches" ? <ChondroClutchStageArt /> : null}

      {view === "colony" ? <ChondroColonyOverview /> : null}
      {view === "clutches" ? <ChondroActiveClutchShowcase /> : null}
      {view === "colony" ? <div className="mx-auto mt-5 max-w-7xl px-5 sm:px-6"><ChondroCollectionManager /></div> : null}
      <ChondroBreederGameV3 screen={view} />
      {view === "clutches" ? <ChondroClutchOutcomeExplainer /> : null}
      {view === "colony" ? <div className="mx-auto mt-5 max-w-7xl px-5 sm:px-6"><ChondroRetiredBreedersPanel /></div> : null}
      {view === "clutches" ? <section className="mx-auto max-w-7xl px-5 pt-5 sm:px-6"><div className="panel rounded-[28px] p-4 sm:p-5"><ChondroClutchHistoryTable /></div></section> : null}
    </>
  );
}

function GameScreenGuide({ view }: { view: "breeding" | "colony" | "clutches" }) {
  const guides: Record<"breeding" | "colony" | "clutches", Array<{ step: string; title: string; detail: string }>> = {
    colony: [
      { step: "1", title: "Tap an animal", detail: "Its full management drawer opens." },
      { step: "2", title: "Raise or manage it", detail: "Life-stage growth, testing, notes, favorite and sale controls live there." },
      { step: "3", title: "Breed adults", detail: "Adult animals become eligible on the Breed screen." },
    ],
    breeding: [
      { step: "1", title: "Need adults?", detail: "Go to Animals and use Raise to advance younger snakes." },
      { step: "2", title: "Choose the pair", detail: "Select an eligible adult female and male." },
      { step: "3", title: "Start the cycle", detail: "Follow reproductive progress until a clutch is produced." },
    ],
    clutches: [
      { step: "1", title: "Check the active clutch", detail: "Eggs and hatchlings appear here as the cycle progresses." },
      { step: "2", title: "Choose holdbacks", detail: "Keep animals you want for future breeding projects." },
      { step: "3", title: "Close the clutch", detail: "Finish decisions, list non-holdbacks and continue the program." },
    ],
  };

  return (
    <section className="mx-auto max-w-7xl px-4 pt-4 sm:px-6">
      <details className="rounded-[22px] border border-emerald-300/12 bg-emerald-300/[.025] p-4" open={view === "colony"}>
        <summary className="cursor-pointer list-none text-sm font-semibold text-emerald-100/78">
          How this screen works{" "}
          <span className="text-[10px] font-normal text-white/35">tap to show/hide</span>
        </summary>
        <div className="mt-4 grid gap-2 md:grid-cols-3">
          {guides[view].map((item) => (
            <div key={item.step} className="rounded-2xl border border-white/[.06] bg-black/15 p-3">
              <div className="text-[9px] font-black uppercase tracking-[.12em] text-emerald-200/50">Step {item.step}</div>
              <div className="mt-1 text-sm font-semibold text-white/76">{item.title}</div>
              <div className="mt-1 text-[11px] leading-5 text-white/40">{item.detail}</div>
            </div>
          ))}
        </div>
      </details>
    </section>
  );
}

function SecondaryScreen({ active, onBack, children }: { active: ViewMeta; onBack: () => void; children: React.ReactNode }) {
  return (
    <>
      <div className="mx-auto max-w-7xl px-4 pt-4 sm:px-6 sm:pt-6">
        <button type="button" onClick={onBack} className="secondary-action px-3 py-2 text-[10px]">← Keeper Home</button>
      </div>
      <ScreenHeading eyebrow="Keeper tools" title={active.label} detail={active.detail} />
      <div>{children}</div>
    </>
  );
}

function QuickAction({ title, detail, icon, onClick, emphasized = false }: { title: string; detail: string; icon: string; onClick: () => void; emphasized?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group flex min-h-[118px] items-start gap-3 rounded-[22px] border p-4 text-left transition hover:-translate-y-0.5 ${emphasized ? "border-amber-200/20 bg-amber-200/[.04] hover:border-amber-200/35 hover:bg-amber-200/[.065]" : "border-white/[.065] bg-white/[.025] hover:border-emerald-300/18 hover:bg-white/[.045]"}`}
    >
      <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-[14px] border text-base ${emphasized ? "border-amber-200/20 bg-amber-200/[.06] text-amber-100" : "border-white/[.07] bg-black/25 text-emerald-200/70"}`}>{icon}</span>
      <span>
        <span className="block text-sm font-bold text-white/82">{title}</span>
        <span className="mt-1 block text-[11px] leading-5 text-white/40">{detail}</span>
      </span>
    </button>
  );
}

function ToolCard({ item, onClick }: { item: ViewMeta; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex min-h-[112px] flex-col items-start rounded-[20px] border border-white/[.065] bg-white/[.025] p-4 text-left transition hover:-translate-y-0.5 hover:border-emerald-300/18 hover:bg-white/[.045]"
    >
      <span className="grid h-10 w-10 place-items-center rounded-[14px] border border-white/[.07] bg-black/25 text-base text-emerald-200/70">{item.icon}</span>
      <span className="mt-auto pt-4 text-sm font-bold text-white/80">{item.label}</span>
      <span className="mt-1 text-[11px] leading-4 text-white/38">{item.detail}</span>
    </button>
  );
}
