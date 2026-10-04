"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { CardView, type CardSuit } from "@/components/poker/CardView";
import { TableFelt } from "@/components/poker/TableFelt";
import { useBankroll } from "@/components/poker/useBankroll";
import { playSfx, unlockAudio } from "@/lib/poker/sfx";
import { publicDuel, type PublicDuel } from "@/lib/poker/duel-flow";
import { parseDuelCard } from "@/lib/poker/duel-eval";

// Same "no think, just play" league mapping as Hatchling Stakes: the snake
// picks its league. The DB is the final gate; this just avoids dead ends.
const PILOT_TIERS = ["sprout", "vine", "canopy"];
const LEAGUE_FOR_STAGE: Record<string, string> = {
  neonate: "sprout",
  juvenile: "vine",
  subadult: "canopy",
  adult: "canopy",
};

interface Token {
  slot: number;
  status: string;
  wager_id: string | null;
}
interface Animal {
  asset_key: string;
  tier: string;
  trait_snapshot: { name?: string; keeper_id?: string } | null;
}
interface CollectionSnake {
  id: string;
  name: string;
  detail: string;
  lifeStage: "neonate" | "juvenile" | "subadult" | "adult";
  game: "gtp" | "emerald";
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { ...init, headers: { "Content-Type": "application/json" } });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error((data as { error?: string })?.error ?? `Failed (${res.status})`);
  return data as T;
}

function DuelCard({ code, faceDown }: { code?: string | null; faceDown?: boolean }) {
  if (faceDown || !code) {
    return (
      <CardView rank={0} suit="S" faceDown size="fluid" className="min-w-0 flex-1 max-w-[64px]" />
    );
  }
  let rank = 0;
  let suit: CardSuit = "S";
  try {
    const parsed = parseDuelCard(code);
    rank = parsed.rank;
    suit = parsed.suit;
  } catch {
    return (
      <CardView rank={0} suit="S" faceDown size="fluid" className="min-w-0 flex-1 max-w-[64px]" />
    );
  }
  return (
    <CardView rank={rank} suit={suit} size="fluid" className="min-w-0 flex-1 max-w-[64px]" />
  );
}

export function DuelClient({ duelId }: { duelId?: string | null }) {
  const { signedIn, loading } = useBankroll();
  const [tokens, setTokens] = useState<Token[]>([]);
  const [animals, setAnimals] = useState<Animal[]>([]);
  const [collection, setCollection] = useState<CollectionSnake[]>([]);
  const [unlimitedTokens, setUnlimitedTokens] = useState(false);
  const [duel, setDuel] = useState<PublicDuel | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [claimName, setClaimName] = useState("");
  // "eligible:<asset_key>" plays a registered snake as-is; "collection:<id>"
  // claims a keeper snake first (league from its life stage) and then plays it.
  const [pick, setPick] = useState("");

  const busyRef = useRef(false);
  useEffect(() => {
    busyRef.current = busy;
  }, [busy]);

  const loadDuel = useCallback(
    async (id: string) => {
      try {
        const res = await api<{ duel: unknown }>(`/api/duels/${id}`);
        if (!busyRef.current) setDuel(publicDuel(res.duel));
      } catch (e) {
        if (!busyRef.current) setError(e instanceof Error ? e.message : "Could not load duel.");
      }
    },
    []
  );

  const refresh = useCallback(async () => {
    if (!signedIn) return;
    try {
      const [t, a, c] = await Promise.all([
        api<{ tokens: Token[]; unlimited?: boolean }>("/api/wagers/tokens"),
        api<{ animals: Animal[] }>("/api/wagers/eligible"),
        api<{ animals: CollectionSnake[] }>("/api/wagers/collection").catch(() => ({ animals: [] })),
      ]);
      setTokens(t.tokens ?? []);
      setUnlimitedTokens(t.unlimited === true);
      setAnimals(a.animals ?? []);
      setCollection(c.animals ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load stakes.");
    }
  }, [signedIn]);

  useEffect(() => {
    if (!signedIn) return;
    const id = setTimeout(() => void refresh(), 0);
    return () => clearTimeout(id);
  }, [signedIn, refresh]);

  // Challenge link entry: load the duel straight away.
  useEffect(() => {
    if (!duelId || !signedIn) return;
    let cancelled = false;
    api<{ duel: unknown }>(`/api/duels/${duelId}`)
      .then((res) => {
        if (!cancelled && !busyRef.current) setDuel(publicDuel(res.duel));
      })
      .catch((e: unknown) => {
        if (!cancelled && !busyRef.current)
          setError(e instanceof Error ? e.message : "Could not load duel.");
      });
    return () => {
      cancelled = true;
    };
  }, [duelId, signedIn]);

  // Poll while waiting: open challenge (challenger view), decided-but-waiting,
  // or settling. Polling stops itself at complete / void / expired.
  const waiting =
    !!duel &&
    ((duel.state === "open" && duel.is_challenger) ||
      (duel.state === "in_progress" &&
        (duel.is_challenger || duel.is_opponent) &&
        !!duel.my_decision) ||
      duel.state === "settling");
  useEffect(() => {
    if (!waiting || !duel) return;
    const id = setInterval(() => {
      if (!busyRef.current) void loadDuel(duel.id);
    }, 4000);
    return () => clearInterval(id);
  }, [waiting, duel, loadDuel]);

  const claimedKeeperIds = new Set(
    animals.map((a) => a.trait_snapshot?.keeper_id).filter((k): k is string => !!k)
  );
  const unclaimedCollection = collection.filter((s) => !claimedKeeperIds.has(s.id));

  const guardTokens = () => {
    if (!unlimitedTokens && !tokens.some((t) => t.status === "available")) {
      throw new Error("No wager tokens left this week — they refresh Monday.");
    }
  };

  const resolveAssetKey = useCallback(async (): Promise<string> => {
    if (pick.startsWith("eligible:")) {
      return pick.slice("eligible:".length);
    }
    let name = claimName.trim();
    let league = "sprout";
    let lifeStage = "neonate";
    let traits: Record<string, string> = {};
    if (pick.startsWith("collection:")) {
      const picked = collection.find((c) => c.id === pick.slice("collection:".length));
      league = LEAGUE_FOR_STAGE[picked?.lifeStage ?? ""] ?? "sprout";
      lifeStage = picked?.lifeStage ?? "neonate";
      name = picked?.name ?? name;
      if (picked) traits = { keeper_id: picked.id, game: picked.game, detail: picked.detail };
    }
    if (!name) throw new Error("Enter a snake name first.");
    const claimed = await api<{ asset_key: string }>("/api/wagers/claim", {
      method: "POST",
      body: JSON.stringify({ name, tier: league, lifeStage, traits }),
    });
    return claimed.asset_key;
  }, [pick, claimName, collection]);

  const create = useCallback(async () => {
    if (busy || (!pick && !claimName.trim())) return;
    setBusy(true);
    setError(null);
    try {
      unlockAudio();
      guardTokens();
      const assetKey = await resolveAssetKey();
      const res = await api<{ duel_id: string; duel: unknown }>("/api/duels", {
        method: "POST",
        body: JSON.stringify({ asset_key: assetKey }),
      });
      setPick("");
      setClaimName("");
      setDuel(publicDuel(res.duel));
      await refresh();
      playSfx("deal");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not open the challenge.");
    } finally {
      setBusy(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy, pick, claimName, resolveAssetKey, refresh]);

  const accept = useCallback(async () => {
    if (busy || !duel || (!pick && !claimName.trim())) return;
    setBusy(true);
    setError(null);
    try {
      unlockAudio();
      guardTokens();
      const assetKey = await resolveAssetKey();
      const res = await api<{ duel: unknown }>(`/api/duels/${duel.id}/accept`, {
        method: "POST",
        body: JSON.stringify({ asset_key: assetKey }),
      });
      setPick("");
      setClaimName("");
      setDuel(publicDuel(res.duel));
      await refresh();
      playSfx("deal");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not accept the challenge.");
    } finally {
      setBusy(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy, duel, pick, claimName, resolveAssetKey, refresh]);

  const decide = useCallback(
    async (decision: "run" | "fold") => {
      if (busy || !duel) return;
      setBusy(true);
      setError(null);
      try {
        unlockAudio();
        const res = await api<{ duel: unknown; waiting: boolean }>(
          `/api/duels/${duel.id}/decide`,
          { method: "POST", body: JSON.stringify({ decision }) }
        );
        setDuel(publicDuel(res.duel));
        playSfx(decision === "run" ? "chip" : "click");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not lock in your decision.");
      } finally {
        setBusy(false);
      }
    },
    [busy, duel]
  );

  const cancel = useCallback(async () => {
    if (busy || !duel) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/api/duels/${duel.id}/void`, { method: "POST", body: JSON.stringify({}) });
      setDuel(null);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not cancel the challenge.");
    } finally {
      setBusy(false);
    }
  }, [busy, duel, refresh]);

  const shareLink = duel ? `${typeof window !== "undefined" ? window.location.origin : ""}/arcade/snake-poker/duels/${duel.id}` : "";

  const copyLink = useCallback(async () => {
    if (!shareLink) return;
    try {
      if (navigator.share) {
        await navigator.share({ title: "Snake Duel challenge", url: shareLink });
        return;
      }
      await navigator.clipboard.writeText(shareLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      try {
        await navigator.clipboard.writeText(shareLink);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch {
        setError("Copy this link manually: " + shareLink);
      }
    }
  }, [shareLink]);

  const reset = () => {
    setDuel(null);
    setError(null);
    setPick("");
    setClaimName("");
  };

  if (loading) {
    return (
      <TableFelt className="min-h-dvh">
        <div className="mx-auto max-w-lg px-4 py-10 text-center text-emerald-100/60">Loading…</div>
      </TableFelt>
    );
  }

  if (!signedIn) {
    return (
      <TableFelt className="min-h-dvh">
        <div className="mx-auto max-w-lg px-4 py-10 text-center">
          <h1 className="text-2xl font-bold text-amber-100">Snake Duels</h1>
          <p className="mt-2 text-sm text-emerald-100/60">
            Keeper-vs-keeper Texas Hold&apos;em. Stake a snake, send a challenge link, and the
            winner takes both.
          </p>
          <Link
            href="/enter"
            className="mt-6 inline-block rounded-full bg-emerald-500 px-8 py-3 font-bold text-black"
          >
            Sign in to play
          </Link>
        </div>
      </TableFelt>
    );
  }

  const snakePicker = (tierFilter?: string) => {
    const eligible = tierFilter ? animals.filter((a) => a.tier === tierFilter) : animals;
    const unclaimed = tierFilter
      ? unclaimedCollection.filter((s) => (LEAGUE_FOR_STAGE[s.lifeStage] ?? "sprout") === tierFilter)
      : unclaimedCollection;
    if (eligible.length === 0 && unclaimed.length === 0) {
      return (
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
      );
    }
    return (
      <>
        <label className="mt-3 block text-xs text-emerald-100/60">Your snake</label>
        <select
          value={pick}
          onChange={(e) => setPick(e.target.value)}
          className="mt-1 w-full rounded-xl border border-emerald-200/20 bg-black/60 px-3 py-2 text-sm text-emerald-100"
        >
          <option value="">Choose…</option>
          {eligible.length > 0 && (
            <optgroup label="Ready to stake">
              {eligible.map((a) => {
                const pilotOpen = PILOT_TIERS.includes(a.tier);
                return (
                  <option key={a.asset_key} value={`eligible:${a.asset_key}`} disabled={!pilotOpen}>
                    {a.trait_snapshot?.name ?? "Hatchling"} · {a.tier} league
                    {pilotOpen ? "" : " (pilot locked)"}
                  </option>
                );
              })}
            </optgroup>
          )}
          {unclaimed.length > 0 && (
            <optgroup label="Your collection">
              {unclaimed.map((s) => (
                <option key={s.id} value={`collection:${s.id}`}>
                  {s.name} · {s.detail} · {LEAGUE_FOR_STAGE[s.lifeStage] ?? "sprout"} league
                </option>
              ))}
            </optgroup>
          )}
        </select>
      </>
    );
  };

  const renderTable = () => {
    if (!duel) return null;
    const me = duel.is_challenger ? "challenger" : duel.is_opponent ? "opponent" : null;
    const myHole = duel.my_hole ?? null;
    const board = duel.board ?? [];
    const done = duel.state === "complete";
    const iWon = done && duel.winner && me && ((me === "challenger" && duel.winner === duel.challenger) || (me === "opponent" && duel.winner === duel.opponent));
    const tie = done && duel.win_reason === "tie";
    // Prefer registry names; asset keys are never display names.
    const challengerName = duel.challenger_snake_name ?? duel.challenger_snake;
    const opponentName = duel.opponent_snake_name ?? duel.opponent_snake ?? "Opponent";
    const myName =
      duel.is_challenger ? challengerName : duel.is_opponent ? opponentName : challengerName;

    return (
      <div className="rounded-2xl border border-emerald-200/15 bg-black/45 p-5">
        <div className="flex items-baseline justify-between">
          <h2 className="font-bold text-amber-100">
            {myName} <span className="font-normal text-emerald-100/50">vs</span>{" "}
            {duel.is_challenger ? opponentName : duel.is_opponent ? challengerName : opponentName}
          </h2>
          <p className="text-xs text-emerald-100/50">{duel.tier} league</p>
        </div>

        {done ? (
          <div className="mt-3 rounded-xl border border-amber-200/20 bg-amber-200/10 p-3 text-center">
            <p className="text-lg font-bold text-amber-100">
              {tie ? "Tied board — both snakes go home." : iWon ? "You take both snakes!" : "Opponent takes both snakes."}
            </p>
            {duel.winning_hand && (
              <p className="mt-1 text-sm text-emerald-100/70">{duel.winning_hand}</p>
            )}
            {duel.win_reason === "fold" && (
              <p className="mt-1 text-xs text-emerald-100/50">Won by fold — no board needed.</p>
            )}
          </div>
        ) : (
          <p className="mt-2 text-sm text-emerald-100/60">
            Heads-up Texas Hold&apos;em. Both duelists lock in <b>run</b> or <b>fold</b> at the
            same time — if you both run, the board runs out and the best five-card hand takes
            both snakes.
          </p>
        )}

        {/* Opponent */}
        <div className="mt-4">
          <p className="text-[11px] uppercase tracking-widest text-emerald-100/50">
            {duel.is_opponent ? challengerName : opponentName}
          </p>
          <div className="mt-2 flex gap-2">
            {done ? (
              <>
                <DuelCard code={(duel.is_opponent ? duel.challenger_hole : duel.opponent_hole)?.[0]} />
                <DuelCard code={(duel.is_opponent ? duel.challenger_hole : duel.opponent_hole)?.[1]} />
              </>
            ) : (
              <>
                <DuelCard faceDown />
                <DuelCard faceDown />
              </>
            )}
          </div>
        </div>

        {/* Board */}
        <div className="mt-4">
          <p className="text-[11px] uppercase tracking-widest text-emerald-100/50">Board</p>
          <div className="mt-2 flex gap-2">
            {done && board.length === 5
              ? board.map((c, i) => <DuelCard key={i} code={c} />)
              : [0, 1, 2, 3, 4].map((i) => <DuelCard key={i} faceDown />)}
          </div>
        </div>

        {/* You */}
        {me && (
          <div className="mt-4">
            <p className="text-[11px] uppercase tracking-widest text-emerald-100/50">
              You{myName ? ` — ${myName}` : ""}
            </p>
            <div className="mt-2 flex gap-2">
              {myHole && myHole.length === 2 ? (
                <>
                  <DuelCard code={myHole[0]} />
                  <DuelCard code={myHole[1]} />
                </>
              ) : (
                <>
                  <DuelCard faceDown />
                  <DuelCard faceDown />
                </>
              )}
            </div>
          </div>
        )}

        {/* Decisions */}
        {me && duel.state === "in_progress" && !duel.my_decision && (
          <div className="mt-5 grid grid-cols-2 gap-3">
            <button
              onClick={() => void decide("run")}
              disabled={busy}
              className="rounded-full bg-emerald-500 px-6 py-3 font-bold text-black disabled:opacity-50"
            >
              {busy ? "Locking…" : "Run it"}
            </button>
            <button
              onClick={() => void decide("fold")}
              disabled={busy}
              className="rounded-full border border-red-300/30 bg-red-500/15 px-6 py-3 font-bold text-red-200 disabled:opacity-50"
            >
              {busy ? "Locking…" : "Fold"}
            </button>
          </div>
        )}
        {me && duel.state === "in_progress" && duel.my_decision && (
          <p className="mt-5 rounded-xl border border-emerald-200/15 bg-black/40 p-3 text-center text-sm text-emerald-100/70">
            Locked in: <b>{duel.my_decision === "run" ? "run it" : "fold"}</b>. Waiting on your
            opponent…
          </p>
        )}
        {duel.state === "settling" && (
          <p className="mt-5 text-center text-sm text-emerald-100/60">Running out the board…</p>
        )}

        {done && (
          <div className="mt-5 flex gap-3">
            <button
              onClick={reset}
              className="flex-1 rounded-full bg-emerald-500 px-6 py-3 font-bold text-black"
            >
              Duel again
            </button>
            <Link
              href="/arcade/snake-poker"
              className="flex-1 rounded-full border border-emerald-200/25 px-6 py-3 text-center font-bold text-emerald-100"
            >
              Den lobby
            </Link>
          </div>
        )}
      </div>
    );
  };

  return (
    <TableFelt className="min-h-dvh">
      <div className="mx-auto max-w-lg px-4 py-6">
        <div className="flex items-baseline justify-between">
          <h1 className="text-2xl font-bold text-amber-100">Snake Duels</h1>
          <Link href="/arcade/snake-poker" className="text-xs text-emerald-100/50 hover:text-emerald-100">
            Den lobby
          </Link>
        </div>

        {error && (
          <p className="mt-3 rounded-xl border border-amber-200/25 bg-amber-200/10 p-3 text-sm text-amber-100">
            {error}
          </p>
        )}

        {duel?.state === "open" && duel.is_challenger && (
          <div className="mt-6 rounded-2xl border border-emerald-200/15 bg-black/45 p-5">
            <h2 className="font-bold text-amber-100">Challenge is live</h2>
            <p className="mt-2 text-sm text-emerald-100/60">
              {duel.challenger_snake_name ?? duel.challenger_snake} ({duel.tier} league) is staked. Send this link to a keeper
              who&apos;ll match it — the challenge expires in 48 hours.
            </p>
            <button
              onClick={copyLink}
              className="mt-4 w-full rounded-full bg-emerald-500 px-6 py-3 font-bold text-black"
            >
              {copied ? "Copied!" : "Copy challenge link"}
            </button>
            <button
              onClick={cancel}
              disabled={busy}
              className="mt-3 w-full text-center text-xs text-emerald-100/40 hover:text-red-300 disabled:opacity-50"
            >
              Cancel challenge (snake unlocks, token refunded)
            </button>
          </div>
        )}

        {duel?.state === "open" && !duel.is_challenger && (
          <div className="mt-6 rounded-2xl border border-emerald-200/15 bg-black/45 p-5">
            <h2 className="font-bold text-amber-100">You&apos;ve been challenged</h2>
            <p className="mt-2 text-sm text-emerald-100/60">
              {duel.challenger_snake_name ?? duel.challenger_snake} is staked in the {duel.tier} league. Match it with one of
              your {duel.tier}-league snakes — winner takes both.
            </p>
            {snakePicker(duel.tier)}
            <button
              onClick={accept}
              disabled={busy || (!pick && !claimName.trim())}
              className="mt-4 w-full rounded-full bg-emerald-500 px-6 py-3 text-base font-bold text-black disabled:opacity-50"
            >
              {busy ? "Staking…" : "Accept & stake"}
            </button>
            {duelId && (
              <Link
                href="/arcade/snake-poker/duels"
                className="mt-3 block text-center text-xs text-emerald-100/40 hover:text-emerald-100"
              >
                Or open your own challenge instead
              </Link>
            )}
          </div>
        )}

        {duel && (duel.state === "in_progress" || duel.state === "settling" || duel.state === "complete") && (
          <div className="mt-6">{renderTable()}</div>
        )}

        {(duel?.state === "void" || duel?.state === "expired") && (
          <div className="mt-6 rounded-2xl border border-emerald-200/15 bg-black/45 p-5 text-center">
            <p className="text-sm text-emerald-100/60">
              {duel.state === "expired"
                ? "This challenge expired — the snake was unlocked."
                : "This challenge was cancelled."}
            </p>
            <button
              onClick={reset}
              className="mt-4 rounded-full bg-emerald-500 px-8 py-2.5 font-bold text-black"
            >
              Back to duels
            </button>
          </div>
        )}

        {!duel && (
          <div className="mt-6 space-y-6">
            <div className="rounded-2xl border border-emerald-200/15 bg-black/45 p-5">
              <h2 className="font-bold text-amber-100">Open a challenge</h2>
              <p className="mt-2 text-sm text-emerald-100/60">
                Stake one of your snakes and get a challenge link. A keeper who accepts stakes a
                snake from the same league — heads-up Hold&apos;em, winner takes both.
              </p>
              {snakePicker()}
              <button
                onClick={create}
                disabled={busy || (!pick && !claimName.trim())}
                className="mt-4 w-full rounded-full bg-emerald-500 px-6 py-3 text-base font-bold text-black disabled:opacity-50"
              >
                {busy ? "Staking…" : "Stake & get challenge link"}
              </button>
              <p className="mt-2 text-center text-[11px] text-emerald-100/40">
                {unlimitedTokens
                  ? "∞ weekly tokens"
                  : `${tokens.filter((t) => t.status === "available").length} wager tokens left this week`}
              </p>
            </div>
          </div>
        )}
      </div>
    </TableFelt>
  );
}
