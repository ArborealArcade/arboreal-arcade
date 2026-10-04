"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { TableFelt } from "@/components/poker/TableFelt";
import { useBankroll } from "@/components/poker/useBankroll";
import { PokerCashier } from "@/components/poker/PokerCashier";
import { isSfxMuted, playSfx, setSfxMuted, unlockAudio } from "@/lib/poker/sfx";

const GAMES = [
  {
    href: "/arcade/snake-poker/coil",
    name: "Coil — Serpent Hold'em",
    desc: "Six seats. Five snake pros. Texas Hold'em against Mara the Breeder, Slink the Poacher, Old Bark, Vesper and Pip the Hatchling.",
    tag: "6-seat Hold'em",
  },
  {
    href: "/arcade/snake-poker/blackjack",
    name: "Canopy Blackjack",
    desc: "Four-deck shoe, dealer stands on all 17s, blackjack pays 3:2. Hit, stand, double, split and insurance. Table limits 10–500.",
    tag: "21",
  },
  {
    href: "/arcade/snake-poker/draw",
    name: "Serpent Draw",
    desc: "Jacks-or-Better video poker on the 9/6 paytable. 1–5 coins, tap to hold, single draw — then press your luck double-or-nothing.",
    tag: "Video poker",
  },
  {
    href: "/arcade/snake-poker/stakes",
    name: "Hatchling Stakes",
    desc: "Risk one of your snakes against the house's own stock in single-hand Den blackjack. Winner takes both. Two entries a week.",
    tag: "High risk",
  },
  {
    href: "/arcade/snake-poker/duels",
    name: "Snake Duels",
    desc: "Keeper-vs-keeper Texas Hold'em. Stake a snake, send a challenge link, and both duelists lock in run or fold — best five-card hand takes both snakes.",
    tag: "PvP",
  },
];

export function SnakePokerLobby() {
  const { signedIn, balance, loading, resetDemo, convert, claimBailout } = useBankroll();
  const [muted, setMuted] = useState(() => isSfxMuted());
  const [tokens, setTokens] = useState<{ tokens?: Array<{ status: string }> } | null>(null);

  useEffect(() => {
    if (signedIn) {
      fetch("/api/wagers/tokens", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then(setTokens)
        .catch(() => null);
    }
  }, [signedIn]);

  const toggleMute = () => {
    unlockAudio();
    const next = !muted;
    setSfxMuted(next);
    setMuted(next);
    if (!next) playSfx("click");
  };

  const tokensLeft = tokens?.tokens?.filter((t) => t.status === "available").length ?? null;

  return (
    <TableFelt className="min-h-dvh">
      <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:py-12">
        <header className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-emerald-300/80">
              Arboreal Arcade
            </p>
            <h1 className="mt-1 text-3xl font-black text-amber-100 sm:text-4xl">The Snake-Poker Den</h1>
            <p className="mt-2 max-w-xl text-sm text-emerald-100/70">
              Lifesap on the line, scales on the felt. All three tables share one bankroll.
            </p>
          </div>
          <button
            onClick={toggleMute}
            className="rounded-full border border-emerald-200/20 bg-black/40 px-3 py-1.5 text-xs text-emerald-100/80"
            aria-label={muted ? "Unmute sound" : "Mute sound"}
          >
            {muted ? "🔇 Muted" : "🔊 Sound"}
          </button>
        </header>

        <div className="mt-6 flex flex-wrap items-center gap-3 rounded-2xl border border-amber-200/15 bg-black/45 p-4">
          <div className="text-sm text-emerald-100/80">
            {loading ? (
              "Loading bankroll…"
            ) : (
              <>
                <span className="font-bold text-amber-200">{balance.toLocaleString()}</span> lifesap
                <span className="ml-2 text-xs text-emerald-100/50">
                  {signedIn ? "saved to your account" : "demo bankroll — sign in to keep it"}
                </span>
              </>
            )}
          </div>
          {!signedIn && !loading && (
            <div className="flex items-center gap-2">
              <Link
                href="/enter"
                className="rounded-full bg-emerald-500 px-4 py-1.5 text-xs font-bold text-black"
              >
                Sign in to save
              </Link>
              <button
                onClick={resetDemo}
                className="rounded-full border border-emerald-200/20 px-3 py-1.5 text-xs text-emerald-100/70"
              >
                Reset demo to 1,000
              </button>
            </div>
          )}
          {signedIn && tokensLeft !== null && (
            <div className="ml-auto text-xs text-emerald-100/60">
              🎰 {tokensLeft}/2 weekly stake {tokensLeft === 1 ? "token" : "tokens"} left
            </div>
          )}
        </div>

        <PokerCashier balance={balance} loading={loading} signedIn={signedIn} convert={convert} claimBailout={claimBailout} />

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {GAMES.map((g) => (
            <Link
              key={g.href}
              href={g.href}
              onClick={() => {
                unlockAudio();
                playSfx("click");
              }}
              className="group rounded-2xl border border-emerald-200/15 bg-black/45 p-5 transition hover:border-amber-200/40 hover:bg-black/60"
            >
              <div className="flex items-center justify-between">
                <span className="rounded-full bg-emerald-900/60 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-200">
                  {g.tag}
                </span>
                <span className="text-emerald-100/40 transition group-hover:translate-x-1 group-hover:text-amber-200">
                  →
                </span>
              </div>
              <h2 className="mt-3 text-lg font-bold text-amber-100">{g.name}</h2>
              <p className="mt-1 text-sm leading-relaxed text-emerald-100/65">{g.desc}</p>
            </Link>
          ))}
        </div>

        <p className="mt-8 text-center text-xs text-emerald-100/40">
          Lifesap is arcade fun-money with no cash value. Hatchling Stakes wagers are final — the winner
          takes both hatchlings.
        </p>
      </div>
    </TableFelt>
  );
}
