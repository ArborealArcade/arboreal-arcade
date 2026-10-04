"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChondroSnakeIcon } from "@/components/ChondroSnakeIcon";
import { animalHousingCapacity } from "@/lib/chondro-facility-limits";
import { playHankScaleLine } from "@/lib/hank-scale-voice";

type SnakeLite = {
  id: string;
  name: string;
  sex?: string;
  subspecies: string;
  locality?: string;
  lifeStage?: string;
  neonateColor?: "Red" | "Yellow";
  classification?: string;
  ancestry?: Record<string, number>;
  localityAncestry?: Record<string, number>;
  generation?: number;
  nidoStatus?: string;
  geneticsTested?: boolean;
  phenotypeScore?: number;
  highBlack?: number;
  highWhite?: number;
  blueStripe?: number;
  yellowRetention?: number;
  blotches?: number;
};

type Listing = {
  id: string;
  snake_id: string;
  seller_id?: string;
  price: number;
  listed_at?: string;
  isMine?: boolean;
  snake: SnakeLite;
};

type SaveState = {
  cash?: number;
  colony?: SnakeLite[];
  enclosures?: Record<string, number>;
  [key: string]: unknown;
};

const LOCAL_SAVE_KEY = "arboreal_chondro_breeder_v2";

async function persistPlayerMarketSave(save: SaveState) {
  const persisted = { ...save, updatedAt: Date.now() };
  window.localStorage.setItem(LOCAL_SAVE_KEY, JSON.stringify(persisted));
  const response = await fetch("/api/hatchery/chondro-breeder/save", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(persisted),
  });
  if (!response.ok) throw new Error("save failed");
  window.dispatchEvent(new Event("arboreal-chondro-breeder-save-change"));
}

const money = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);

function traitSummary(animal: SnakeLite) {
  if (!animal.geneticsTested) return "Traits untested";
  const rows = [
    ["Black", Number(animal.highBlack ?? 0)],
    ["White", Number(animal.highWhite ?? 0)],
    ["Blue", Number(animal.blueStripe ?? 0)],
    ["Yellow", Number(animal.yellowRetention ?? 0)],
    ["Blotches", Number(animal.blotches ?? 0)],
  ] as const;
  const best = rows.reduce((current, row) => (row[1] > current[1] ? row : current), rows[0]);
  return `Top tested trait · ${best[0]} ${best[1]}%`;
}

export function ChondroPlayerMarket({ bare, layout }: { bare?: boolean; layout?: "stack" | "carousel" }) {
  const [listings, setListings] = useState<Listing[]>([]);
  const [save, setSave] = useState<SaveState>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  // Founder/testing allowlist: unlimited snake housing spaces, checked
  // server-side via /api/canopy-hunter/status so it follows the account.
  const [unlimitedSpaces, setUnlimitedSpaces] = useState(false);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/canopy-hunter/status", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && data?.unlimitedSpaces === true) setUnlimitedSpaces(true);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  const [marketLoaded, setMarketLoaded] = useState(false); const [refreshing, setRefreshing] = useState(false);
  const emptyAnnouncedRef = useRef(false);

  const refresh = useCallback(async () => { setRefreshing(true);
    try {
      const [marketResponse, saveResponse] = await Promise.all([
        fetch("/api/hatchery/chondro-breeder/player-market", { cache: "no-store" }),
        fetch("/api/hatchery/chondro-breeder/save", { cache: "no-store" }),
      ]);
      const market = await marketResponse.json();
      const saved = await saveResponse.json();
      if (marketResponse.ok) {
        setListings(Array.isArray(market.listings) ? market.listings : []);
        setMarketLoaded(true);
      }
      if (saveResponse.ok) {
        const apiState = saved.save?.state;
        if (apiState && typeof apiState === "object" && !Array.isArray(apiState)) {
          setSave(apiState as SaveState);
        } else {
          // Guests have no cloud save: the API returns no state, but the
          // player's cash/colony live in localStorage. Fall back to it so the
          // panel shows real values instead of $0 cash and 0 open spaces.
          try {
            const raw = window.localStorage.getItem(LOCAL_SAVE_KEY);
            const parsed: unknown = raw ? JSON.parse(raw) : null;
            if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
              setSave(parsed as SaveState);
            }
          } catch {}
        }
      }
      if (marketResponse.status === 401) setStatus("Sign in to browse and buy from the shared player market."); if (marketResponse.ok) setStatus("");
    } catch {
      setStatus("The player market could not be refreshed.");
    }
    setRefreshing(false); }, []);

  useEffect(() => {
    const first = window.setTimeout(() => void refresh(), 0);
    const timer = window.setInterval(() => void refresh(), 20_000);
    const onSave = () => void refresh();
    window.addEventListener("arboreal-chondro-breeder-save-change", onSave);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
      window.removeEventListener("arboreal-chondro-breeder-save-change", onSave);
    };
  }, [refresh]);

  const mine = useMemo(() => listings.filter((listing) => listing.isMine), [listings]);
  const available = useMemo(() => listings.filter((listing) => !listing.isMine), [listings]);

  // Hank Scale notes a bare market board once per empty spell, after the
  // market-tab greeting has had room to finish.
  useEffect(() => {
    if (!marketLoaded) return;
    if (available.length > 0) {
      emptyAnnouncedRef.current = false;
      return;
    }
    if (emptyAnnouncedRef.current) return;
    emptyAnnouncedRef.current = true;
    const timer = window.setTimeout(() => playHankScaleLine(20), 7000);
    return () => window.clearTimeout(timer);
  }, [marketLoaded, available.length]);
  const cash = Math.max(0, Number(save.cash ?? 0));
  const capacity = unlimitedSpaces ? Number.POSITIVE_INFINITY : animalHousingCapacity(save.enclosures);
  const openSlots = Math.max(0, capacity - (save.colony?.length ?? 0));

  async function buy(listing: Listing) {
    if (busy || cash < listing.price || openSlots <= 0) return;
    setBusy(listing.id);
    setStatus(`Claiming ${listing.snake.name}…`);
    try {
      const response = await fetch("/api/hatchery/chondro-breeder/player-market", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "buy", listingId: listing.id }),
      });
      const data = await response.json().catch(() => null) as { error?: string; result?: { snake?: SnakeLite } } | null;
      if (!response.ok) {
        setStatus(data?.error ?? "This animal is no longer available.");
        await refresh();
        return;
      }

      const purchasedSnake = data?.result?.snake ?? listing.snake;
      const next: SaveState = {
        ...save,
        cash: Math.max(0, cash - listing.price),
        colony: [...(save.colony ?? []), purchasedSnake],
      };
      await persistPlayerMarketSave(next);
      setSave(next);
      setListings((current) => current.filter((item) => item.id !== listing.id));
      setStatus(`${purchasedSnake.name} joined your Animals collection.`);
    } catch {
      setStatus("The purchase completed unsuccessfully. Refresh the market before trying again.");
      await refresh();
    } finally {
      setBusy(null);
    }
  }

  function marketIcon(animal: SnakeLite) {
    return (
      <ChondroSnakeIcon
        subspecies={animal.subspecies as never}
        name={animal.name}
        traits={{
          highBlack: Number(animal.highBlack ?? 0),
          highWhite: Number(animal.highWhite ?? 0),
          blueStripe: Number(animal.blueStripe ?? 0),
          yellowRetention: Number(animal.yellowRetention ?? 0),
          blotches: Number(animal.blotches ?? 0),
        }}
        lifeStage={(animal.lifeStage ?? "Adult") as never}
        neonateColor={animal.neonateColor}
        locality={animal.locality}
        classification={animal.classification as never}
        ancestry={animal.ancestry as never}
        localityAncestry={animal.localityAncestry}
        phenotypeScore={animal.phenotypeScore}
        spriteSeed={animal.id}
        compact
        tiny
      />
    );
  }

  function mineCarouselCard(listing: Listing) {
    const animal = listing.snake;
    return (
      <article key={listing.id} className="w-[66%] shrink-0 snap-start rounded-2xl border border-amber-200/10 bg-black/14 p-2.5 sm:w-[230px] lg:w-[300px]">
        {marketIcon(animal)}
        <div className="mt-2 truncate text-[13px] font-bold text-white/78">{animal.name}</div>
        <div className="mt-1 flex items-center justify-between gap-2">
          <span className="truncate text-[10px] text-amber-100/58">Listed by you</span>
          <span className="shrink-0 text-sm font-semibold text-amber-100/72">{money(listing.price)}</span>
        </div>
      </article>
    );
  }

  function availableCarouselCard(listing: Listing) {
    const animal = listing.snake;
    const cannotBuy = busy !== null || cash < listing.price || openSlots <= 0;
    return (
      <article key={listing.id} className="w-[66%] shrink-0 snap-start rounded-2xl border border-white/[.06] bg-black/12 p-2.5 sm:w-[230px] lg:w-[300px]">
        {marketIcon(animal)}
        <div className="mt-2 truncate text-[13px] font-bold text-white/78">{animal.name}</div>
        <div className="mt-2 flex items-center justify-between gap-2">
          <span className="text-sm font-semibold text-emerald-200/76">{money(listing.price)}</span>
          <button
            type="button"
            disabled={cannotBuy}
            onClick={() => void buy(listing)}
            className="rounded-lg bg-emerald-300 px-2.5 py-1.5 text-[10px] font-black text-[#06100c] disabled:opacity-30"
          >
            {busy === listing.id ? "…" : openSlots <= 0 ? "Need space" : cash < listing.price ? "Need cash" : "Buy"}
          </button>
        </div>
      </article>
    );
  }

  const body = (    <div className={layout === "carousel" ? "h-full overflow-x-hidden overflow-y-auto rounded-[22px] border border-emerald-300/10 bg-emerald-300/[.022] p-2.5 sm:overflow-hidden" : "overflow-hidden rounded-[28px] border border-emerald-300/10 bg-emerald-300/[.022] p-4 sm:p-5"}>
        {layout === "carousel" ? (
          <div className="flex flex-none items-center justify-between gap-2">
            <div className="truncate text-[10px] font-black uppercase tracking-[.15em] text-emerald-100/48">Player market · {mine.length + available.length} available</div>
            <button type="button" onClick={() => void refresh()} disabled={refreshing} aria-label="Refresh player market" className="shrink-0 rounded-lg border border-white/[.08] px-2 py-1 text-[10px] font-bold text-white/52 disabled:opacity-50">{refreshing ? "…" : "↻"}</button>
          </div>
        ) : (
        <>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-[9px] font-black uppercase tracking-[.15em] text-emerald-100/48">Player market · Virtual animals</div>
            <h2 className="mt-2 text-xl font-semibold text-white/84 sm:text-2xl">Player snake market</h2>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-white/38">Your active listings stay visible here while other breeders can browse and buy them. Shared virtual listings keep the animal&apos;s locality, testing and breeding record when it changes hands inside Arboreal Keeper.</p>
          </div>
          <button type="button" onClick={() => void refresh()} className="rounded-xl border border-white/[.08] px-3 py-2 text-[10px] font-bold text-white/52">Refresh</button>
        </div>

        <div className="mt-4 flex flex-wrap gap-2 text-[10px]">
          <span className="rounded-full border border-emerald-300/12 bg-emerald-300/[.035] px-2.5 py-1 font-black uppercase tracking-[.08em] text-emerald-100/60">Virtual only</span>
          <span className="rounded-full border border-white/[.06] px-2.5 py-1 text-white/38">Cash {money(cash)}</span>
          <span className="rounded-full border border-white/[.06] px-2.5 py-1 text-white/38">{unlimitedSpaces ? "Unlimited animal spaces" : `Open animal spaces ${openSlots}`}</span>
          <span className="rounded-full border border-amber-200/10 px-2.5 py-1 text-amber-100/48">{mine.length} your listing{mine.length === 1 ? "" : "s"}</span>
          <span className="rounded-full border border-white/[.06] px-2.5 py-1 text-white/38">{available.length} from other breeders</span>
        </div>
        </>
        )}

        {status ? <div role="status" className={layout === "carousel" ? "mt-2 truncate text-[11px] text-white/55" : "mt-4 rounded-xl border border-white/[.07] bg-black/15 px-3 py-2 text-xs text-white/55"}>{status}</div> : null}

        {layout === "carousel" ? (
          <div className="mt-2 flex snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain pb-1 [scrollbar-width:thin]">
            {mine.map((listing) => mineCarouselCard(listing))}
            {available.map((listing) => availableCarouselCard(listing))}
            {!mine.length && !available.length ? (
              <div className="w-full shrink-0 snap-start rounded-2xl border border-dashed border-white/[.08] p-4 text-xs text-white/30">No breeder-listed virtual snakes are available to you right now.</div>
            ) : null}
          </div>
        ) : (
        <>
        {mine.length ? (
          <div className="mt-5 rounded-[22px] border border-amber-200/10 bg-amber-200/[.025] p-4">
            <div className="text-[9px] font-black uppercase tracking-[.15em] text-amber-100/55">Your active listings</div>
            <p className="mt-1 text-xs leading-5 text-white/34">These snakes are still listed. They are intentionally kept visible here so selling an animal never makes it look lost. Listings unsold after 48 hours are cleared automatically at 85% of asking price.</p>
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {mine.map((listing) => {
                const animal = listing.snake;
                return (
                  <article key={listing.id} className="rounded-[22px] border border-amber-200/10 bg-black/14 p-3">
                    <div className="rounded-[18px] border border-white/[.045] bg-black/15 p-2">
                      <ChondroSnakeIcon
                        subspecies={animal.subspecies as never}
                        name={animal.name}
                        traits={{
                          highBlack: Number(animal.highBlack ?? 0),
                          highWhite: Number(animal.highWhite ?? 0),
                          blueStripe: Number(animal.blueStripe ?? 0),
                          yellowRetention: Number(animal.yellowRetention ?? 0),
                          blotches: Number(animal.blotches ?? 0),
                        }}
                        lifeStage={(animal.lifeStage ?? "Adult") as never}
                        neonateColor={animal.neonateColor}
                        locality={animal.locality}
                        classification={animal.classification as never}
                        ancestry={animal.ancestry as never}
                        localityAncestry={animal.localityAncestry}
                        phenotypeScore={animal.phenotypeScore}
                        spriteSeed={animal.id}
                        compact
                        tiny={false}
                      />
                    </div>
                    <>
                    <div className="mt-3 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-bold text-white/78">{animal.name}</div>
                        <div className="mt-1 truncate text-[10px] text-white/34">{animal.sex ?? "Unknown sex"} · {animal.lifeStage ?? "Unknown stage"} · {animal.locality ?? animal.subspecies}</div>
                      </div>
                      <div className="shrink-0 text-base font-semibold text-amber-100/72">{money(listing.price)}</div>
                    </div>
                    <div className="mt-3 rounded-xl border border-amber-200/10 bg-amber-200/[.025] px-3 py-2 text-[10px] font-semibold text-amber-100/58">Listed by you · visible to other players</div>
                    </>
                  </article>
                );
              })}
            </div>
          </div>
        ) : null}

        <div className="mt-5">
          <div className="text-[9px] font-black uppercase tracking-[.15em] text-emerald-100/48">Other breeders</div>
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {available.map((listing) => {
            const animal = listing.snake;
            const cannotBuy = busy !== null || cash < listing.price || openSlots <= 0;
            return (
              <article key={listing.id} className="rounded-[22px] border border-white/[.06] bg-black/12 p-3">
                <div className="rounded-[18px] border border-white/[.045] bg-black/15 p-2">
                  <ChondroSnakeIcon
                    subspecies={animal.subspecies as never}
                    name={animal.name}
                    traits={{
                      highBlack: Number(animal.highBlack ?? 0),
                      highWhite: Number(animal.highWhite ?? 0),
                      blueStripe: Number(animal.blueStripe ?? 0),
                      yellowRetention: Number(animal.yellowRetention ?? 0),
                      blotches: Number(animal.blotches ?? 0),
                    }}
                    lifeStage={(animal.lifeStage ?? "Adult") as never}
                    neonateColor={animal.neonateColor}
                    locality={animal.locality}
                    classification={animal.classification as never}
                    ancestry={animal.ancestry as never}
                    localityAncestry={animal.localityAncestry}
                    phenotypeScore={animal.phenotypeScore}
                    spriteSeed={animal.id}
                    compact
                    tiny={false}
                  />
                </div>
                <>
                <div className="mt-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <div className="truncate text-sm font-bold text-white/78">{animal.name}</div>
                      <span className="shrink-0 rounded-full border border-emerald-300/14 px-2 py-0.5 text-[7px] font-black uppercase tracking-[.1em] text-emerald-100/58">Virtual</span>
                    </div>
                    <div className="mt-1 truncate text-[10px] text-white/34">{animal.sex ?? "Unknown sex"} · {animal.lifeStage ?? "Unknown stage"} · {animal.locality ?? animal.subspecies}</div>
                  </div>
                  <div className="shrink-0 text-base font-semibold text-emerald-200/76">{money(listing.price)}</div>
                </div>
                <div className="mt-3 rounded-xl border border-white/[.05] px-3 py-2 text-[10px] text-white/38">{traitSummary(animal)} · Nido {animal.nidoStatus ?? "Unknown"}</div>
                <button
                  type="button"
                  disabled={cannotBuy}
                  onClick={() => void buy(listing)}
                  className="mt-3 w-full rounded-xl bg-emerald-300 px-4 py-2.5 text-xs font-black text-[#06100c] disabled:opacity-30"
                >
                  {busy === listing.id ? "Claiming…" : openSlots <= 0 ? "Need enclosure" : cash < listing.price ? "Not enough cash" : "Buy virtual snake"}
                </button>
                </>
              </article>
            );
          })}
          {!available.length ? <div className="rounded-2xl border border-dashed border-white/[.08] p-6 text-sm text-white/30 md:col-span-2 xl:col-span-3">No breeder-listed virtual snakes are available to you right now.</div> : null}
        </div>
        </>
        )}
      </div>
  );

  return bare ? body : (
    <section className="mx-auto mt-5 max-w-7xl px-5 sm:px-6">{body}</section>
  );
}
