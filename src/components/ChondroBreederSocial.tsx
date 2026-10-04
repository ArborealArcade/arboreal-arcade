"use client";

import { useEffect, useMemo, useState } from "react";
import { ChondroSnakeIcon } from "@/components/ChondroSnakeIcon";

type Friendship = {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: "pending" | "accepted";
};

type Breeder = {
  userId: string;
  initials: string;
  username: string | null;
  displayName: string;
  avatarUrl: string | null;
  showcaseCount: number;
  isSelf: boolean;
};

type Snake = {
  id: string;
  name?: string;
  sex?: string;
  lifeStage?: string;
  classification?: string;
  locality?: string;
  subspecies?: string;
  highBlack?: number;
  highWhite?: number;
  blueStripe?: number;
  yellowRetention?: number;
  blotches?: number;
  geneticsTested?: boolean;
  phenotypeScore?: number;
  showcasePublished?: boolean;
};

type Showcase = {
  owner_id: string;
  snake_id: string;
  snake: Snake;
  updated_at: string;
};

type SocialPayload = {
  authenticated: boolean;
  userId?: string;
  breeders: Breeder[];
  friendships: Friendship[];
  showcase: Showcase[];
  ownAnimals: Snake[];
};

function grade(score = 0) {
  if (score >= 95) return "A+";
  if (score >= 90) return "A";
  if (score >= 85) return "A-";
  if (score >= 80) return "B+";
  if (score >= 74) return "B";
  if (score >= 68) return "B-";
  if (score >= 62) return "C+";
  return "C";
}

function SnakeCard({ snake }: { snake: Snake }) {
  const traits = {
    highBlack: Number(snake.highBlack ?? 0),
    highWhite: Number(snake.highWhite ?? 0),
    blueStripe: Number(snake.blueStripe ?? 0),
    yellowRetention: Number(snake.yellowRetention ?? 0),
    blotches: Number(snake.blotches ?? 0),
  };
  const phenotype =
    snake.locality &&
    snake.locality !== "Designer" &&
    snake.locality !== "Mixed Locality" &&
    Number(snake.phenotypeScore ?? 0) > 0
      ? `${grade(Number(snake.phenotypeScore))} ${snake.locality} phenotype`
      : null;

  return (
    <article className="rounded-3xl border border-white/[.06] bg-black/10 p-4">
      {snake.subspecies ? (
        <ChondroSnakeIcon
          subspecies={snake.subspecies as
            | "Morelia azurea azurea"
            | "Morelia azurea pulcher"
            | "Morelia azurea utaraensis"
            | "Morelia viridis"}
          name={snake.name || "Snake"}
          traits={traits}
          compact
        />
      ) : null}
      <div className="mt-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="font-semibold text-white/75">{snake.name || "Unnamed snake"}</div>
          <div className="mt-1 text-[10px] text-white/30">
            {snake.sex || "Unknown sex"} · {snake.lifeStage || "Unknown stage"} · {snake.classification || "Unknown"}
          </div>
        </div>
        {phenotype ? (
          <span className="rounded-full border border-amber-200/15 bg-amber-200/[.04] px-2.5 py-1 text-[9px] font-bold text-amber-100/70">
            {phenotype}
          </span>
        ) : null}
      </div>
      <div className="mt-3 text-[10px] text-white/34">
        {snake.subspecies || "Unknown subspecies"} · {snake.locality || "Unknown locality"}
      </div>
      <div className="mt-2 rounded-xl border border-white/[.05] p-2.5 text-[10px] text-white/35">
        {snake.geneticsTested
          ? `HB ${traits.highBlack}% · HW ${traits.highWhite}% · Blue ${traits.blueStripe}% · Yellow ${traits.yellowRetention}% · Blotches ${traits.blotches}%`
          : "Genetics untested · exact percentages hidden"}
      </div>
    </article>
  );
}

export function ChondroBreederSocial() {
  const [data, setData] = useState<SocialPayload | null>(null);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [openBreeder, setOpenBreeder] = useState<string | null>(null);

  async function load() {
    try {
      const response = await fetch("/api/hatchery/chondro-breeder/social", { cache: "no-store" });
      const payload = (await response.json()) as SocialPayload;
      setData(payload);
      if (!response.ok && response.status === 401)
        setStatus("Sign in to add breeder friends and share animals.");
    } catch {
      setStatus("Breeder friends are temporarily unavailable.");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function act(action: string, payload: Record<string, string>) {
    setBusy(`${action}:${Object.values(payload)[0] ?? "action"}`);
    setStatus("");
    try {
      const response = await fetch("/api/hatchery/chondro-breeder/social", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...payload }),
      });
      const result = await response.json();
      if (!response.ok) {
        setStatus(result.error ?? "That social action could not be completed.");
        return;
      }
      await load();
    } catch {
      setStatus("Breeder friends are temporarily unavailable.");
    } finally {
      setBusy(null);
    }
  }

  const relationshipByUser = useMemo(() => {
    const map = new Map<string, Friendship>();
    if (!data?.userId) return map;
    for (const friendship of data.friendships) {
      const other =
        friendship.requester_id === data.userId
          ? friendship.addressee_id
          : friendship.requester_id;
      map.set(other, friendship);
    }
    return map;
  }, [data]);

  const showcaseByOwner = useMemo(() => {
    const map = new Map<string, Showcase[]>();
    for (const item of data?.showcase ?? []) {
      map.set(item.owner_id, [...(map.get(item.owner_id) ?? []), item]);
    }
    return map;
  }, [data]);

  if (!data)
    return (
      <section className="mx-auto max-w-7xl px-5 pb-10 sm:px-6">
        <div className="panel rounded-[28px] p-6 text-sm text-white/35">Loading breeder friends…</div>
      </section>
    );

  const self = data.breeders.find((breeder) => breeder.isSelf) ?? null;
  const otherBreeders = data.breeders.filter((breeder) => !breeder.isSelf);
  const acceptedCount = data.friendships.filter((friendship) => friendship.status === "accepted").length;
  const incoming = data.friendships.filter(
    (friendship) => friendship.status === "pending" && friendship.addressee_id === data.userId,
  );

  return (
    <section className="mx-auto max-w-7xl px-5 pb-16 sm:px-6">
      <details className="group mt-5" open>
        <summary className="panel flex cursor-pointer list-none items-center justify-between gap-4 rounded-2xl px-5 py-4 [&::-webkit-details-marker]:hidden">
          <div>
            <div className="text-sm font-bold text-white/75">Breeder friends & showcases</div>
            <div className="mt-1 text-[10px] text-white/30">
              {acceptedCount} friend{acceptedCount === 1 ? "" : "s"} · {incoming.length} incoming request{incoming.length === 1 ? "" : "s"}
            </div>
          </div>
          <span className="grid h-8 w-8 place-items-center rounded-full border border-white/[.08] text-lg text-white/45 transition group-open:rotate-45">+</span>
        </summary>

        <div className="mt-3 space-y-5">
          <div className="panel rounded-[28px] p-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <div className="section-kicker">Your breeder showcase</div>
                <h2 className="mt-2 text-2xl font-semibold">Choose what other breeders can inspect.</h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-white/35">
                  Showcase animals include breeding-relevant information, but private notes are never published. You can add or remove an animal at any time.
                </p>
              </div>
              {self ? (
                <div className="rounded-xl border border-amber-200/10 px-3 py-2 text-xs text-amber-100/60">
                  {self.displayName} · {self.initials}
                </div>
              ) : null}
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {data.ownAnimals.map((snake) => {
                const published = Boolean(snake.showcasePublished);
                const key = `${published ? "unpublish" : "publish"}:${snake.id}`;
                return (
                  <div key={snake.id} className="rounded-2xl border border-white/[.06] p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-semibold text-white/70">{snake.name || "Unnamed snake"}</div>
                        <div className="mt-1 text-[10px] text-white/30">{snake.locality} · {snake.sex} · {snake.lifeStage}</div>
                      </div>
                      <span className={`rounded-full border px-2 py-1 text-[9px] font-bold uppercase ${published ? "border-emerald-300/15 text-emerald-100/65" : "border-white/[.07] text-white/30"}`}>
                        {published ? "Showcased" : "Private"}
                      </span>
                    </div>
                    <button
                      disabled={busy === key}
                      onClick={() => void act(published ? "unpublish" : "publish", { snakeId: snake.id })}
                      className="mt-3 rounded-xl border border-white/[.08] px-3 py-2 text-xs font-bold text-white/55 disabled:opacity-30"
                    >
                      {busy === key ? "Updating…" : published ? "Remove from showcase" : "Add to showcase"}
                    </button>
                  </div>
                );
              })}
              {!data.ownAnimals.length ? (
                <div className="rounded-2xl border border-dashed border-white/[.07] p-5 text-sm text-white/28 md:col-span-2 xl:col-span-3">
                  Your active colony will appear here after your account save has animals in it.
                </div>
              ) : null}
            </div>
          </div>

          <div className="panel rounded-[28px] p-6">
            <div className="section-kicker">Breeder network</div>
            <h2 className="mt-2 text-2xl font-semibold">Find breeders, become friends, compare programs.</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-white/35">
              Friend requests are two-way. Once accepted, the breeder's showcased animals can be opened here without exposing their private game records.
            </p>
            {status ? (
              <div role="status" className="mt-4 rounded-xl border border-amber-200/10 bg-amber-200/[.025] p-3 text-xs text-amber-100/65">{status}</div>
            ) : null}

            <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {otherBreeders.map((breeder) => {
                const friendship = relationshipByUser.get(breeder.userId);
                const accepted = friendship?.status === "accepted";
                const incomingRequest =
                  friendship?.status === "pending" && friendship.addressee_id === data.userId;
                const outgoingRequest =
                  friendship?.status === "pending" && friendship.requester_id === data.userId;
                const animals = showcaseByOwner.get(breeder.userId) ?? [];
                return (
                  <article key={breeder.userId} className="rounded-3xl border border-white/[.06] bg-black/10 p-4">
                    <div className="flex items-center gap-3">
                      {breeder.avatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={breeder.avatarUrl} alt="" className="h-11 w-11 rounded-full border border-white/[.08] object-cover" />
                      ) : (
                        <div className="grid h-11 w-11 place-items-center rounded-full border border-emerald-300/10 bg-emerald-300/[.04] text-xs font-black text-emerald-100/65">
                          {breeder.initials}
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="truncate font-semibold text-white/72">{breeder.displayName}</div>
                        <div className="mt-1 text-[10px] text-white/30">
                          {breeder.username ? `@${breeder.username} · ` : ""}{breeder.initials} · {breeder.showcaseCount} showcased
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      {!friendship ? (
                        <button
                          disabled={busy === `request:${breeder.userId}`}
                          onClick={() => void act("request", { targetId: breeder.userId })}
                          className="rounded-xl bg-emerald-300 px-3 py-2 text-xs font-black text-[#06100c] disabled:opacity-30"
                        >
                          Add friend
                        </button>
                      ) : incomingRequest ? (
                        <button
                          disabled={busy === `accept:${friendship.id}`}
                          onClick={() => void act("accept", { friendshipId: friendship.id })}
                          className="rounded-xl bg-amber-200 px-3 py-2 text-xs font-black text-[#17130a] disabled:opacity-30"
                        >
                          Accept friend request
                        </button>
                      ) : outgoingRequest ? (
                        <span className="rounded-xl border border-white/[.08] px-3 py-2 text-xs text-white/38">Request sent</span>
                      ) : accepted ? (
                        <button
                          onClick={() => setOpenBreeder(openBreeder === breeder.userId ? null : breeder.userId)}
                          className="rounded-xl border border-emerald-300/15 bg-emerald-300/[.04] px-3 py-2 text-xs font-bold text-emerald-100/65"
                        >
                          {openBreeder === breeder.userId ? "Hide animals" : "View animals"}
                        </button>
                      ) : null}

                      {friendship ? (
                        <button
                          disabled={busy === `remove:${friendship.id}`}
                          onClick={() => void act("remove", { friendshipId: friendship.id })}
                          className="rounded-xl border border-white/[.08] px-3 py-2 text-xs font-bold text-white/40 disabled:opacity-30"
                        >
                          {accepted ? "Remove friend" : "Cancel"}
                        </button>
                      ) : null}
                    </div>

                    {accepted && openBreeder === breeder.userId ? (
                      <div className="mt-4 border-t border-white/[.06] pt-4">
                        <div className="mb-3 text-[10px] font-black uppercase tracking-[.12em] text-white/28">
                          {breeder.initials} showcase
                        </div>
                        <div className="space-y-3">
                          {animals.map((item) => <SnakeCard key={item.snake_id} snake={item.snake} />)}
                          {!animals.length ? (
                            <div className="rounded-xl border border-dashed border-white/[.07] p-4 text-xs text-white/28">
                              This breeder has not showcased any animals yet.
                            </div>
                          ) : null}
                        </div>
                      </div>
                    ) : null}
                  </article>
                );
              })}
              {!otherBreeders.length ? (
                <div className="rounded-2xl border border-dashed border-white/[.07] p-5 text-sm text-white/28 md:col-span-2 xl:col-span-3">
                  More breeders will appear here as players claim breeder initials.
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </details>
    </section>
  );
}
