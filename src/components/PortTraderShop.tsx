"use client";

import Image from "next/image";
import { useRef, useState } from "react";

/* ------------------------------------------------------------------ */
/* Port trader item shape — CanopyHunter reuses these types so the shop */
/* and the expedition stay in sync.                                    */
/* ------------------------------------------------------------------ */

export type PortTraderItemId = "lantern-oil" | "scent-lure" | "sure-grip" | "local-intel";

export interface PortTraderItem {
  id: PortTraderItemId;
  name: string;
  cost: number;
  desc: string;
  emoji: string;
  iconSrc?: string;
}

/** A trail pickup the trader buys — id matches an item-*.webp icon. */
export interface TrailFind {
  id: string;
  name: string;
  value: number;
  icon: string;
}

export interface PortTraderBounty {
  locality: string;
  sex: string;
}

/** Shop tabs — Hank's store has Animals / Enclosures / Player Market; the */
/** port has these.                                                         */
export type PortShopView = "supplies" | "shed" | "bounty" | "boatman";

const VIEWS: Array<{ id: PortShopView; label: string; shortLabel: string; emoji: string }> = [
  { id: "supplies", label: "Supplies", shortLabel: "Supplies", emoji: "🧺" },
  { id: "shed", label: "Shed Trade", shortLabel: "Sheds", emoji: "🤝" },
  { id: "bounty", label: "Bounty Board", shortLabel: "Bounty", emoji: "📌" },
  { id: "boatman", label: "Rick", shortLabel: "Rick", emoji: "⛵" },
];

const TRADER_NIGHT_ART = "/arcade/canopy-hunter/port-river-night.webp";
const TRADER_PORTRAIT = "/arcade/canopy-hunter/port-trader.webp";
const BOATMAN_CARD = "/arcade/canopy-hunter/port-boatman-card.webp";

/**
 * The trader's idle animation loops. Empty for now — Gage generates the
 * animation; the still portrait holds the slot until the clips land, and
 * this component starts playing them the moment the array is filled.
 */
const TRADER_CLIPS: string[] = [];

function TraderAnimation() {
  const [clip, setClip] = useState(0);
  const refs = useRef<Array<HTMLVideoElement | null>>([]);

  const advance = () => {
    const next = (clip + 1) % TRADER_CLIPS.length;
    const upcoming = refs.current[next];
    if (upcoming) {
      upcoming.currentTime = 0;
      void upcoming.play().catch(() => {});
    }
    refs.current[clip]?.pause();
    setClip(next);
  };

  return (
    <>
      {TRADER_CLIPS.map((src, i) => {
        const active = i === clip;
        return (
          <video
            key={src}
            ref={(el) => {
              refs.current[i] = el;
            }}
            autoPlay={i === 0}
            muted
            playsInline
            preload="auto"
            disablePictureInPicture
            aria-hidden={!active}
            onEnded={active ? advance : undefined}
            className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-150 ${
              active ? "opacity-100" : "pointer-events-none opacity-0"
            }`}
          >
            <source src={src} type="video/mp4" />
          </video>
        );
      })}
    </>
  );
}

/**
 * Placeholder until the animation lands: the night port backdrop with a slow
 * drift, the trader's portrait bobbing gently at his stall, and a flickering
 * lantern glow behind him — the same "shopkeeper in his window" read as
 * Hank's store, minus the motion.
 */
function TraderPlaceholder() {
  return (
    <div className="absolute inset-0" aria-hidden="true">
      <div className="absolute inset-0 animate-[port-drift_32s_ease-in-out_infinite_alternate]">
        <Image
          src={TRADER_NIGHT_ART}
          alt=""
          fill
          sizes="(max-width: 640px) 100vw, 48rem"
          draggable={false}
          className="scale-110 object-cover"
        />
      </div>
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(4,10,8,.15)_0%,transparent_45%,rgba(4,10,8,.55)_100%)]" />
      {/* Lantern glow behind the trader */}
      <div className="absolute bottom-[8%] left-[2%] h-[72%] w-[42%] animate-[port-glow_3.8s_ease-in-out_infinite] rounded-full bg-amber-400/[.22] blur-3xl" />
      {/* The trader at his stall */}
      <div className="absolute bottom-0 left-[5%] h-[92%] animate-[port-bob_7s_ease-in-out_infinite]">
        <div className="relative h-full aspect-[1122/1402]">
          <Image
            src={TRADER_PORTRAIT}
            alt=""
            fill
            sizes="220px"
            draggable={false}
            className="object-contain object-bottom drop-shadow-[0_18px_30px_rgba(0,0,0,.55)]"
          />
        </div>
      </div>
    </div>
  );
}

const BOUNTY_BOARD_ART = "/arcade/canopy-hunter/port-bounty-board.webp";

/**
 * The bounty board takes over the shopkeeper window when the Bounty Board
 * pill is tapped — the night's bounty pinned as a notice on the blank
 * parchment, like a real wanted poster.
 */
function BountyBoard({
  bounty,
  bountyTaken,
  onTakeBounty,
}: {
  bounty: PortTraderBounty | null;
  bountyTaken: boolean;
  onTakeBounty: () => void;
}) {
  return (
    <div className="absolute inset-0" aria-label="Bounty board">
      <Image
        src={BOUNTY_BOARD_ART}
        alt=""
        fill
        sizes="(max-width: 640px) 100vw, 48rem"
        draggable={false}
        className="object-cover"
      />
      {/* Pinned notice on the blank parchment */}
      <div className="absolute left-[30%] top-[24%] flex h-[58%] w-[33%] -rotate-1 flex-col items-center justify-center rounded-[4px] bg-[linear-gradient(160deg,#f0e0b4_0%,#e3c990_60%,#d3b475_100%)] px-1.5 py-2 text-center shadow-[0_12px_28px_rgba(0,0,0,.55)] sm:px-3">
        <span aria-hidden="true" className="absolute -top-2 text-sm drop-shadow-[0_2px_3px_rgba(0,0,0,.5)]">📌</span>
        {bounty ? (
          <>
            <p className="text-[8px] font-black uppercase tracking-[.22em] text-[#6b4a1d] sm:text-[10px]">Wanted</p>
            <p className="mt-1 text-[10px] font-black leading-tight text-[#2e1f0a] sm:text-sm">
              {bounty.sex} {bounty.locality} python
            </p>
            <p className="mt-1 text-[8px] font-bold leading-tight text-[#6b4a1d] sm:text-[10px]">
              alive · <span className="text-[#2e1f0a]">5 tokens</span> on delivery
            </p>
            {bountyTaken ? (
              <p className="mt-1.5 text-[8px] font-black uppercase tracking-[.14em] text-emerald-900 sm:text-[10px]">✓ Taken</p>
            ) : (
              <button
                type="button"
                onClick={onTakeBounty}
                className="mt-1.5 rounded-full border border-[#6b4a1d]/40 bg-[#2e1f0a] px-2.5 py-1 text-[8px] font-black uppercase tracking-[.1em] text-amber-100 transition hover:bg-[#4a3315] active:scale-95 sm:px-3.5 sm:py-1.5 sm:text-[10px]"
              >
                Take it
              </button>
            )}
          </>
        ) : (
          <p className="text-[8px] italic leading-snug text-[#6b4a1d] sm:text-[10px]">
            No bounty posted tonight — check back next expedition.
          </p>
        )}
      </div>
    </div>
  );
}

const BOATMAN_ART = "/arcade/canopy-hunter/port-boatman.webp";

/**
 * Rick's panel: a clean river portrait with his line in a caption strip
 * below the art — nothing overlaid on him, ever.
 */
function BoatmanPanel({ line }: { line: string }) {
  return (
    <div className="w-full flex-none">
      <div className="relative aspect-[16/9] w-full overflow-hidden bg-black" aria-label="Rick, the boatman">
        <Image
          src={BOATMAN_ART}
          alt=""
          fill
          sizes="(max-width: 640px) 100vw, 48rem"
          draggable={false}
          className="object-cover"
        />
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(2,8,10,.22)_0%,transparent_55%,transparent_100%)]" />
      </div>
      <p className="border-b border-white/[.06] bg-black/40 px-4 py-3 text-[12px] italic leading-5 text-white/75 sm:px-5 sm:text-sm sm:leading-6">
        {line}
      </p>
    </div>
  );
}

const TRADER_TIPS = [
  "Evening, Gage. I stock what the river lets through — and the shelf's slimming fast.",
  "Lantern oil's the cheapest edge you'll buy all night. Ask anyone.",
  "Fresh shed skins — I pay good metal for those. Or trade you what I know.",
  "That board's got a name on it with your coin attached. Go have a look.",
  "Rick leaves when you say. The river don't wait — but I do.",
];

export interface PortTraderShopProps {
  view: PortShopView;
  onViewChange: (view: PortShopView) => void;
  items: PortTraderItem[];
  soldIds: PortTraderItemId[];
  boughtCount: number;
  buyLimit?: number;
  tokenBal: number;
  sheds: number;
  finds: TrailFind[];
  intelTaken: boolean;
  bounty: PortTraderBounty | null;
  bountyTaken: boolean;
  boatmanLine: string;
  onBuy: (item: PortTraderItem) => void;
  onTradeShed: (forIntel: boolean) => void;
  onSellFinds: () => void;
  onTakeBounty: () => void;
  onCastOff: () => void;
}

/**
 * The river port trader's shop — Hank Scale's store structure with the
 * port's options: tip bar, shopkeeper window, view pills (Supplies /
 * Shed Trade / Bounty Board / Rick), and the tab content below.
 * The animation slot is a still portrait until Gage's loops arrive.
 */
export function PortTraderShop({
  view,
  onViewChange,
  items,
  soldIds,
  boughtCount,
  buyLimit = 2,
  tokenBal,
  sheds,
  finds,
  intelTaken,
  bounty,
  bountyTaken,
  boatmanLine,
  onBuy,
  onTradeShed,
  onSellFinds,
  onTakeBounty,
  onCastOff,
}: PortTraderShopProps) {
  const [tip, setTip] = useState(0);
  const buysLeft = buyLimit - boughtCount;

  const viewTitle =
    view === "supplies" ? "Tonight's stock"
    : view === "shed" ? "Shed trade"
    : view === "bounty" ? "Bounty board"
    : "Rick · The boatman";

  return (
    <div className="mt-4 overflow-hidden rounded-[26px] border border-white/[.07] bg-white/[.02]">
      {/* Trader's tip — slim row above the store, tap for another tip */}
      <button
        type="button"
        onClick={() => setTip((t) => (t + 1) % TRADER_TIPS.length)}
        title="Ask the trader for another tip"
        className="flex w-full items-center gap-2 border-b border-white/[.06] bg-white/[.96] px-4 py-2.5 text-left"
      >
        <span className="min-w-0 flex-1 text-[11px] leading-4 text-[#0a120d] sm:text-[12px] lg:text-sm lg:leading-5">
          <span className="font-semibold">Trader says:</span> {TRADER_TIPS[tip]}
        </span>
        <span className="shrink-0 text-[9px] font-black uppercase tracking-[.12em] text-[#0a120d]/40">↻ tip</span>
      </button>

      {/* Shopkeeper window — the bounty board takes it over when that pill is tapped.
          Rick gets his own clean panel (portrait + caption strip, nothing overlaid). */}
      {view === "boatman" ? (
        <BoatmanPanel line={boatmanLine} />
      ) : (
        <div className={`relative w-full flex-none overflow-hidden bg-black ${view === "bounty" ? "aspect-[16/9]" : "h-56 sm:h-72"}`}>
          {view === "bounty" ? (
            <BountyBoard bounty={bounty} bountyTaken={bountyTaken} onTakeBounty={onTakeBounty} />
          ) : TRADER_CLIPS.length > 0 ? (
            <TraderAnimation />
          ) : (
            <TraderPlaceholder />
          )}
          {view === "supplies" ? (
            <span className="absolute right-2 top-2 z-10 rounded-full border border-amber-200/30 bg-black/65 px-3 py-1.5 text-[10px] font-black uppercase tracking-[.14em] text-amber-100 backdrop-blur-sm">
              🛒 {buysLeft} {buysLeft === 1 ? "buy" : "buys"} left tonight
            </span>
          ) : null}
        </div>
      )}

      {/* Cast off lives below the portrait — never over Rick */}
      {view === "boatman" ? (
        <div className="flex-none px-4 pt-2 sm:px-5">
          <button
            type="button"
            onClick={onCastOff}
            className="w-full rounded-2xl bg-emerald-300 px-5 py-3 text-sm font-black uppercase tracking-wide text-[#06100c] shadow-[0_8px_24px_rgba(0,0,0,.5)] transition hover:bg-emerald-200 active:scale-[.99]"
          >
            Cast off →
          </button>
        </div>
      ) : null}

      {/* View pills — Hank's Animals / Enclosures / Market, port-flavored */}
      <div className="hide-scrollbar flex flex-none items-center gap-1.5 overflow-x-auto px-4 pt-2 sm:overflow-visible sm:px-5 sm:pt-3">
        {VIEWS.map((v) => {
          const selected = v.id === view;
          return (
            <button
              key={v.id}
              type="button"
              onClick={() => onViewChange(v.id)}
              aria-current={selected ? "true" : undefined}
              className={`flex min-w-0 flex-none items-center justify-center gap-1.5 whitespace-nowrap rounded-full border py-1.5 pl-1 pr-2 text-[8px] font-black uppercase tracking-[.05em] transition sm:flex-1 sm:text-[9px] lg:py-2 lg:pl-1.5 lg:pr-3 lg:text-[11px] ${
                selected
                  ? "border-amber-200/70 bg-gradient-to-b from-amber-200 to-amber-300 text-[#1a1005] shadow-[0_0_18px_rgba(251,191,36,.45)] ring-1 ring-inset ring-white/40"
                  : "border-white/12 bg-white/[.05] text-white/60 backdrop-blur-sm hover:border-white/25 hover:bg-white/[.09] hover:text-white"
              }`}
            >
              <span className="shrink-0 text-[13px] leading-none lg:text-[15px]" aria-hidden="true">{v.emoji}</span>
              <span className="truncate">
                <span className="sm:hidden">{v.shortLabel}</span>
                <span className="hidden sm:inline">{v.label}</span>
              </span>
            </button>
          );
        })}
      </div>

      {/* Tab header */}
      <div className="mb-2 mt-3 flex items-center justify-between gap-2 px-4 sm:mb-3 sm:mt-4 sm:px-5">
        <h3 className="text-[10px] font-black uppercase tracking-[.2em] text-amber-200/60">{viewTitle}</h3>
        <span className="rounded-full border border-amber-200/25 bg-amber-200/[.07] px-3 py-1 text-xs font-bold text-amber-100">
          🪙 {tokenBal} tokens
        </span>
      </div>

      {/* Supplies */}
      {view === "supplies" ? (
        <div className="px-4 pb-5 sm:px-5">
          <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-1">
            {items.map((item) => {
              const sold = soldIds.includes(item.id);
              const limited = boughtCount >= buyLimit;
              const poor = tokenBal < item.cost;
              const disabled = sold || limited || poor;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onBuy(item)}
                  disabled={disabled}
                  className="relative min-w-[208px] max-w-[248px] flex-1 snap-start rounded-2xl border border-white/[.08] bg-black/30 p-4 text-left transition hover:border-amber-200/40 hover:bg-black/45 active:scale-[.98] disabled:opacity-45"
                >
                  <span className="flex items-center gap-2.5">
                    {item.iconSrc ? (
                      <span className="relative h-11 w-11 shrink-0">
                        <Image src={item.iconSrc} alt="" aria-hidden="true" fill sizes="44px" draggable={false} className="object-contain" />
                      </span>
                    ) : (
                      <span className="text-[28px] leading-none" aria-hidden="true">{item.emoji}</span>
                    )}
                    <span className="text-sm font-bold text-white">{item.name}</span>
                  </span>
                  <span className="mt-2 block min-h-[2.5rem] text-xs leading-5 text-white/45">{item.desc}</span>
                  <span className="mt-2 block text-xs font-black uppercase tracking-[.12em] text-amber-100">
                    {sold ? "Sold" : limited ? "Two's the limit" : poor ? `${item.cost} tokens — short` : `${item.cost} tokens`}
                  </span>
                  {sold ? (
                    <span className="absolute right-3 top-3 rotate-6 rounded-md border-2 border-amber-200/70 px-2 py-0.5 text-[10px] font-black uppercase tracking-[.14em] text-amber-200/80">
                      Sold
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* Shed trade */}
      {view === "shed" ? (
        <div className="px-4 pb-5 sm:px-5">
          {sheds > 0 ? (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => onTradeShed(false)}
                className="rounded-full border border-amber-200/30 bg-amber-200/[.07] px-4 py-2 text-xs font-bold text-amber-100 transition hover:bg-amber-200/[.14] active:scale-95"
              >
                Trade a shed → +4 tokens ({sheds} in hand)
              </button>
              {!intelTaken ? (
                <button
                  type="button"
                  onClick={() => onTradeShed(true)}
                  className="rounded-full border border-sky-200/30 bg-sky-300/[.07] px-4 py-2 text-xs font-bold text-sky-100 transition hover:bg-sky-300/[.14] active:scale-95"
                >
                  Trade a shed → local intel
                </button>
              ) : null}
            </div>
          ) : (
            <p className="text-xs italic leading-5 text-white/35">
              Bring me a fresh shed skin next time, Gage — I pay good metal for those.
            </p>
          )}
          {finds.length > 0 ? (
            <div className="mt-4 border-t border-white/[.06] pt-4">
              <p className="text-[10px] font-black uppercase tracking-[.18em] text-white/40">
                Trail finds — I pay metal for these too
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {finds.map((f) => (
                  <span
                    key={f.id + finds.indexOf(f)}
                    title={`${f.name} · ${f.value} tokens`}
                    className="relative h-11 w-11 overflow-hidden rounded-xl border border-white/10 bg-black/40"
                  >
                    <Image src={f.icon} alt={f.name} fill sizes="44px" draggable={false} className="object-contain" />
                  </span>
                ))}
              </div>
              <button
                type="button"
                onClick={onSellFinds}
                className="mt-3 rounded-full border border-amber-200/30 bg-amber-200/[.07] px-4 py-2 text-xs font-bold text-amber-100 transition hover:bg-amber-200/[.14] active:scale-95"
              >
                Sell {finds.length} {finds.length === 1 ? "find" : "finds"} → +{finds.reduce((n, f) => n + f.value, 0)} tokens
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

    </div>
  );
}
