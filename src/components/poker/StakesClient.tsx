"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { CardView, type CardSuit } from "@/components/poker/CardView";
import { TableFelt } from "@/components/poker/TableFelt";
import { useBankroll } from "@/components/poker/useBankroll";
import { playSfx, unlockAudio } from "@/lib/poker/sfx";
import { handLabel } from "@/lib/poker/blackjack";

// Value tiers the house will match during the NPC pilot. The DB is the
// final gate; this just keeps the UI from offering dead ends.
const PILOT_TIERS = ["sprout", "vine", "canopy"];

// "No think, just play": a snake's league comes from its life stage, so
// picking the snake picks the league. No tier picker anywhere in the UI.
const LEAGUE_FOR_STAGE: Record<string, string> = {
  neonate: "sprout",
  juvenile: "vine",
  subadult: "canopy",
  adult: "canopy",
};

// The house plays under the zero UUID in every stakes table.
const HOUSE_ID = "00000000-0000-0000-0000-000000000000";
// Terminal game_sessions states. Settle writes 'complete' (void writes
// 'voided'); the match UI must treat all of these as finished.
const TERMINAL_SESSION_STATES = ["settled", "complete", "voided"];

interface Token {
  slot: number;
  status: string;
  wager_id: string | null;
}
interface Animal {
  asset_key: string;
  tier: string;
  trait_snapshot: { name?: string; keeper_id?: string } | null;
  created_at: string;
}
interface CollectionSnake {
  id: string;
  name: string;
  detail: string;
  lifeStage: "neonate" | "juvenile" | "subadult" | "adult";
  game: "gtp" | "emerald";
}
interface StakeTable {
  hands: { cards: { rank: number; suit: string }[] }[];
  activeHand: number;
  dealer: { rank: number; suit: string }[];
  holeHidden: boolean;
  phase: string;
  result?: { handIndex: number; outcome: string }[];
}
interface Session {
  wager_id: string;
  wager_state: string;
  session_state: string;
  player_score: number;
  hands_played: number;
  winner: string | null;
  npc_name: string | null;
  player_asset_name: string | null;
  tier: string | null;
  open_hand: StakeTable | null;
}
interface GameResponse {
  table?: StakeTable | null;
  result?: { handIndex: number; outcome: string }[];
  winner?: "player" | "house";
  push?: boolean;
  session: Session;
}
interface WagerRow {
  id: string;
  state: string;
  winner: string | null;
  created_at: string;
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { ...init, headers: { "Content-Type": "application/json" } });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error((data as { error?: string })?.error ?? `Failed (${res.status})`);
  return data as T;
}

export function StakesClient() {
  const { signedIn, loading } = useBankroll();
  const [tokens, setTokens] = useState<Token[]>([]);
  const [animals, setAnimals] = useState<Animal[]>([]);
  const [collection, setCollection] = useState<CollectionSnake[]>([]);
  const [history, setHistory] = useState<WagerRow[]>([]);
  const [unlimitedTokens, setUnlimitedTokens] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [claimName, setClaimName] = useState("");
  // One picker drives the whole lobby: "eligible:<asset_key>" plays a
  // registered snake as-is; "collection:<id>" claims a keeper snake first
  // (league set automatically from its life stage) and then plays it.
  const [playPick, setPlayPick] = useState("");

  // Mirror of `busy` for the session poller: never let a stale poll response
  // clobber a fresher session snapshot while an action is in flight.
  const busyRef = useRef(false);
  useEffect(() => {
    busyRef.current = busy;
  }, [busy]);

  const claimedKeeperIds = new Set(
    animals.map((a) => a.trait_snapshot?.keeper_id).filter((k): k is string => !!k)
  );
  const unclaimedCollection = collection.filter((s) => !claimedKeeperIds.has(s.id));

  // One tap: pick a snake, get its league automatically, walk straight into
  // the match. Registered snakes play as-is; keeper snakes are claimed first
  // with the league derived from their life stage.

  const refresh = useCallback(async () => {
    if (!signedIn) return;
    try {
      const [t, a, h, c] = await Promise.all([
        api<{ tokens: Token[]; unlimited?: boolean }>("/api/wagers/tokens"),
        api<{ animals: Animal[] }>("/api/wagers/eligible"),
        api<{ wagers: WagerRow[] }>("/api/wagers/history"),
        api<{ animals: CollectionSnake[] }>("/api/wagers/collection").catch(() => ({ animals: [] })),
      ]);
      setTokens(t.tokens ?? []);
      setUnlimitedTokens(t.unlimited === true);
      setAnimals(a.animals ?? []);
      setCollection(c.animals ?? []);
      setHistory(h.wagers ?? []);
      const active = (h.wagers ?? []).find((w) => w.state === "in_progress" || w.state === "awaiting_start");
      if (active) setActiveId(active.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load stakes.");
    }
  }, [signedIn]);

  useEffect(() => {
    if (!signedIn) return;
    const id = setTimeout(() => void refresh(), 0);
    return () => clearTimeout(id);
  }, [signedIn, refresh]);


  const play = useCallback(async () => {
    if (!playPick || busy) return;
    setBusy(true);
    setError(null);
    try {
      unlockAudio();
      if (!unlimitedTokens && !tokens.some((t) => t.status === "available")) {
        throw new Error("No wager tokens left this week — they refresh Monday.");
      }
      let assetKey: string;
      if (playPick.startsWith("eligible:")) {
        assetKey = playPick.slice("eligible:".length);
      } else if (playPick.startsWith("collection:")) {
        const picked = collection.find((c) => c.id === playPick.slice("collection:".length));
        const league = LEAGUE_FOR_STAGE[picked?.lifeStage ?? ""] ?? "sprout";
        const claimed = await api<{ asset_key: string }>("/api/wagers/claim", {
          method: "POST",
          body: JSON.stringify({
            name: picked?.name ?? claimName.trim(),
            tier: league,
            lifeStage: picked?.lifeStage ?? "neonate",
            traits: picked ? { keeper_id: picked.id, game: picked.game, detail: picked.detail } : {},
          }),
        });
        assetKey = claimed.asset_key;
      } else {
        // Manual name entry (no keeper snakes found): sprout league.
        if (!claimName.trim()) throw new Error("Enter a snake name first.");
        const claimed = await api<{ asset_key: string }>("/api/wagers/claim", {
          method: "POST",
          body: JSON.stringify({ name: claimName.trim(), tier: "sprout", lifeStage: "neonate", traits: {} }),
        });
        assetKey = claimed.asset_key;
      }
      const w = await api<{ wagerId: string }>("/api/wagers/create", {
        method: "POST",
        body: JSON.stringify({ assetKey }),
      });
      setActiveId(w.wagerId);
      setClaimName("");
      setPlayPick("");
      playSfx("chip");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start the match.");
    } finally {
      setBusy(false);
    }
  }, [playPick, busy, tokens, unlimitedTokens, collection, claimName, refresh]);
  const loadSession = useCallback(async (id: string) => {
    try {
      const s = await api<Session>(`/api/wagers/${id}/state`, { cache: "no-store" });
      setSession(s);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load wager.");
    }
  }, []);

  useEffect(() => {
    if (!activeId) return;
    let cancelled = false;
    const tick = () => {
      if (!cancelled && !busyRef.current) void loadSession(activeId);
    };
    const first = setTimeout(tick, 0);
    const t = setInterval(tick, 6000);
    return () => {
      cancelled = true;
      clearTimeout(first);
      clearInterval(t);
    };
  }, [activeId, loadSession]);

  const deal = useCallback(async () => {
    if (!activeId || busy) return;
    setBusy(true);
    setError(null);
    try {
      unlockAudio();
      const s = await api<GameResponse>(`/api/wagers/${activeId}/deal`, { method: "POST" });
      setSession(s.session);
      playSfx(s.push ? "click" : "deal");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not deal.");
    } finally {
      setBusy(false);
    }
  }, [activeId, busy]);

  const act = useCallback(
    async (action: "hit" | "stand") => {
      if (!activeId || busy) return;
      setBusy(true);
      setError(null);
      try {
        unlockAudio();
        const s = await api<GameResponse>(`/api/wagers/${activeId}/action`, {
          method: "POST",
          body: JSON.stringify({ action }),
        });
        setSession(s.session);
        playSfx(action === "hit" ? "deal" : "click");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Illegal action.");
      } finally {
        setBusy(false);
      }
    },
    [activeId, busy]
  );

  const abandon = useCallback(async () => {
    if (!activeId || busy) return;
    if (!window.confirm("Abandon this wager? Your hatchling unlocks and your token is refunded.")) return;
    setBusy(true);
    try {
      await api(`/api/wagers/${activeId}/void`, { method: "POST", body: JSON.stringify({}) });
      setActiveId(null);
      setSession(null);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not abandon.");
    } finally {
      setBusy(false);
    }
  }, [activeId, busy, refresh]);

  if (loading) {
    return (
      <TableFelt className="min-h-dvh">
        <p className="p-8 text-center text-emerald-100/60">Loading…</p>
      </TableFelt>
    );
  }

  if (!signedIn) {
    return (
      <TableFelt className="min-h-dvh">
        <div className="mx-auto max-w-lg px-4 py-16 text-center">
          <h1 className="text-2xl font-black text-amber-100">Hatchling Stakes</h1>
          <p className="mt-3 text-sm text-emerald-100/70">
            Wagering a real hatchling needs your account — sign in to see your eligible animals and
            weekly tokens.
          </p>
          <Link
            href="/enter"
            className="mt-6 inline-block rounded-full bg-emerald-500 px-8 py-2.5 font-bold text-black"
          >
            Sign in
          </Link>
        </div>
      </TableFelt>
    );
  }

  const tokensLeft = tokens.filter((t) => t.status === "available").length;
  const rawTable = session?.open_hand ?? null;
  // open_hand is null until the first deal. Anything that isn't a real
  // table shape (e.g. the '{}' session default) counts as no open hand —
  // rendering it as a table crashes the page.
  const table =
    rawTable && Array.isArray(rawTable.hands) && Array.isArray(rawTable.dealer)
      ? rawTable
      : null;
  const playerCards = table?.hands?.[0]?.cards ?? [];

  return (
    <TableFelt className="min-h-dvh">
      <div className="mx-auto w-full max-w-3xl px-4 py-6">
        <div className="flex items-center justify-between">
          <Link href="/arcade/snake-poker" className="text-sm text-emerald-100/60 hover:text-amber-200">
            ← The Den
          </Link>
          <div className="text-sm text-emerald-100/80">
            🎰 {unlimitedTokens ? "∞ weekly tokens" : `${tokensLeft}/2 weekly tokens`}
          </div>
        </div>

        <h1 className="mt-4 text-2xl font-black text-amber-100">Hatchling Stakes</h1>
        <p className="text-xs text-emerald-100/50">
          One hand of Canopy Blackjack against the house. Win the hand and both hatchlings are
          yours — a push just re-deals.
        </p>

        {error && (
          <div className="mt-4 rounded-xl border border-red-400/40 bg-red-950/60 px-4 py-2 text-sm text-red-200">
            {error}
          </div>
        )}

        {activeId && session ? (
          <div className="mt-6">
            <div className="rounded-2xl border border-amber-200/20 bg-black/50 p-4">
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="truncate text-emerald-100/70">
                  {session.player_asset_name ?? "Your hatchling"}{" "}
                  <span className="text-emerald-100/40">vs</span>{" "}
                  {session.npc_name ?? "House hatchling"}
                </span>
                <span className="shrink-0 text-xs font-semibold text-amber-200/80">
                  winner takes both
                </span>
              </div>

              {TERMINAL_SESSION_STATES.includes(session.session_state) ? (
                <div className="mt-4 text-center">
                  <p className="text-xl font-black text-amber-100">
                    {session.winner === HOUSE_ID
                      ? "The house takes your hatchling."
                      : session.winner
                        ? "🏆 You take both hatchlings!"
                        : "Wager closed — both hatchlings unlocked."}
                  </p>
                  <button
                    onClick={() => {
                      setActiveId(null);
                      setSession(null);
                      void refresh();
                    }}
                    className="mt-4 rounded-full bg-emerald-500 px-6 py-2 text-sm font-bold text-black"
                  >
                    Back to stakes
                  </button>
                </div>
              ) : table ? (
                <div className="mt-4">
                  <div className="flex items-end justify-between">
                    <p className="text-[11px] uppercase tracking-widest text-emerald-100/50">House</p>
                    {table.phase === "done" && table.dealer.length > 0 && (
                      <p className="text-xs text-emerald-100/60">
                        {handLabel(table.dealer as { rank: number; suit: CardSuit }[])}
                      </p>
                    )}
                  </div>
                  <div className="mt-2 flex gap-2">
                    {table.dealer.map((c, i) => (
                      <CardView
                        key={i}
                        rank={c.rank}
                        suit={c.suit as CardSuit}
                        size="fluid"
                        className="min-w-0 flex-1 max-w-[72px]"
                      />
                    ))}
                    {table.holeHidden && (
                      <CardView
                        rank={0}
                        suit="S"
                        faceDown
                        size="fluid"
                        className="min-w-0 flex-1 max-w-[72px]"
                      />
                    )}
                  </div>
                  <div className="mt-4 flex items-end justify-between">
                    <p className="text-[11px] uppercase tracking-widest text-emerald-100/50">You</p>
                    {playerCards.length > 0 && (
                      <p className="text-xs font-semibold text-amber-100/90">
                        {handLabel(playerCards as { rank: number; suit: CardSuit }[])}
                      </p>
                    )}
                  </div>
                  <div className="mt-2 flex gap-2">
                    {playerCards.map((c, i) => (
                      <CardView
                        key={i}
                        rank={c.rank}
                        suit={c.suit as CardSuit}
                        size="fluid"
                        className="min-w-0 flex-1 max-w-[72px]"
                      />
                    ))}
                  </div>
                  {table.phase === "player" ? (
                    <div className="mt-4 flex flex-wrap justify-center gap-2">
                      <button onClick={() => act("hit")} disabled={busy} className="rounded-full bg-emerald-500 px-6 py-2 text-sm font-bold text-black disabled:opacity-50">
                        Hit
                      </button>
                      <button onClick={() => act("stand")} disabled={busy} className="rounded-full bg-emerald-500 px-6 py-2 text-sm font-bold text-black disabled:opacity-50">
                        Stand
                      </button>
                    </div>
                  ) : (
                    <div className="mt-4 text-center">
                      <p className="mb-3 text-sm font-bold text-amber-100">
                        Push — nobody takes the hatchlings. Run it back.
                      </p>
                      <button
                        onClick={deal}
                        disabled={busy}
                        className="rounded-full bg-emerald-500 px-8 py-2.5 font-bold text-black disabled:opacity-50"
                      >
                        {busy ? "Dealing…" : "Deal again"}
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="mt-4 text-center">
                  <button
                    onClick={deal}
                    disabled={busy}
                    className="rounded-full bg-emerald-500 px-8 py-2.5 font-bold text-black disabled:opacity-50"
                  >
                    {busy ? "Dealing…" : "Deal the hand"}
                  </button>
                </div>
              )}

              {session.session_state === "in_progress" && (
                <button onClick={abandon} disabled={busy} className="mt-4 w-full text-center text-xs text-emerald-100/40 hover:text-red-300 disabled:opacity-50">
                  Abandon wager (hatchling unlocks, token refunded)
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="mt-6 space-y-6">
            {/* Play — one picker, one button. The snake sets its league automatically. */}
            <div className="rounded-2xl border border-emerald-200/15 bg-black/45 p-5">
              <h2 className="font-bold text-amber-100">Play Hatchling Stakes</h2>
              <p className="mt-2 text-sm text-emerald-100/60">
                Pick a snake and you&apos;re in — its league is set automatically from its life
                stage. The house matches your league. Winner takes both hatchlings, no
                take-backs.
              </p>
              {animals.length > 0 || unclaimedCollection.length > 0 ? (
                <>
                  <label className="mt-3 block text-xs text-emerald-100/60">Your snake</label>
                  <select
                    value={playPick}
                    onChange={(e) => setPlayPick(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-emerald-200/20 bg-black/60 px-3 py-2 text-sm text-emerald-100"
                  >
                    <option value="">Choose…</option>
                    {animals.length > 0 && (
                      <optgroup label="Ready to stake">
                        {animals.map((a) => {
                          const pilotOpen = PILOT_TIERS.includes(a.tier);
                          return (
                            <option
                              key={a.asset_key}
                              value={`eligible:${a.asset_key}`}
                              disabled={!pilotOpen}
                            >
                              {a.trait_snapshot?.name ?? "Hatchling"} · {a.tier} league
                              {pilotOpen ? "" : " (pilot locked)"}
                            </option>
                          );
                        })}
                      </optgroup>
                    )}
                    {unclaimedCollection.length > 0 && (
                      <optgroup label="Your collection">
                        {unclaimedCollection.map((s) => (
                          <option key={s.id} value={`collection:${s.id}`}>
                            {s.name} · {s.detail} · {LEAGUE_FOR_STAGE[s.lifeStage] ?? "sprout"}{" "}
                            league
                          </option>
                        ))}
                      </optgroup>
                    )}
                  </select>
                </>
              ) : (
                <>
                  <label className="mt-3 block text-xs text-emerald-100/60">Snake name</label>
                  <input
                    value={claimName}
                    onChange={(e) => setClaimName(e.target.value)}
                    maxLength={80}
                    placeholder="e.g. Slinky"
                    className="mt-1 w-full rounded-xl border border-emerald-200/20 bg-black/60 px-3 py-2 text-sm text-emerald-100 placeholder:text-emerald-100/30"
                  />
                  <p className="mt-1 text-[11px] text-emerald-100/40">
                    No keeper snakes found — enter a name manually.
                  </p>
                </>
              )}
              <button
                onClick={play}
                disabled={busy || (!playPick && !claimName.trim())}
                className="mt-4 w-full rounded-full bg-emerald-500 px-6 py-3 text-base font-bold text-black disabled:opacity-50"
              >
                {busy ? "Starting…" : "Play"}
              </button>
            </div>


            {/* History */}
            {history.length > 0 && (              <div className="rounded-2xl border border-emerald-200/15 bg-black/45 p-5">
                <h2 className="font-bold text-amber-100">Past wagers</h2>
                <div className="mt-2 space-y-1">
                  {history.slice(0, 10).map((w) => (
                    <p key={w.id} className="text-xs text-emerald-100/60">
                      {new Date(w.created_at).toLocaleDateString()} · {w.state.replace(/_/g, " ")}
                      {w.winner ? ` · winner: ${w.winner === HOUSE_ID ? "House" : "You"}` : ""}
                    </p>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </TableFelt>
  );
}
