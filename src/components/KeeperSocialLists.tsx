"use client";

import Link from "next/link";
import { useState } from "react";

type Person = { username: string; display_name: string | null; avatar_url: string | null };
type ListType = "followers" | "following" | "friends";

const TITLES: Record<ListType, string> = { followers: "Followers", following: "Following", friends: "Friends" };

export function KeeperSocialLists({ username, followers, following, friends, isSelf }: {
  username: string;
  followers: number | null;
  following: number | null;
  friends: number | null;
  isSelf: boolean;
}) {
  const [open, setOpen] = useState<ListType | null>(null);
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(false);
  const [liveFollowers, setLiveFollowers] = useState(followers);

  async function show(type: ListType) {
    setOpen(type);
    setLoading(true);
    setPeople([]);
    try {
      const r = await fetch(`/api/keepers/${encodeURIComponent(username)}/followers?type=${type}`, { cache: "no-store" });
      const d = await r.json().catch(() => null);
      setPeople(Array.isArray(d?.people) ? d.people : []);
    } finally {
      setLoading(false);
    }
  }

  async function removeFollower(name: string) {
    if (!window.confirm(`Remove @${name} from your followers? They won't be notified.`)) return;
    const r = await fetch(`/api/keepers/${encodeURIComponent(username)}/followers`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: name }),
    });
    if (r.ok) {
      setPeople((ps) => ps.filter((p) => p.username !== name));
      setLiveFollowers((c) => (c === null ? null : Math.max(0, c - 1)));
    }
  }

  const btn = "transition hover:text-white/80";
  return (
    <>
      {liveFollowers !== null && (
        <button type="button" onClick={() => show("followers")} className={btn} title="See followers">
          <strong className="text-white/82">{liveFollowers}</strong> followers
        </button>
      )}
      {following !== null && (
        <button type="button" onClick={() => show("following")} className={btn} title="See who they follow">
          <strong className="text-white/82">{following}</strong> following
        </button>
      )}
      {friends !== null && (
        <button type="button" onClick={() => show("friends")} className={btn} title="See friends">
          <strong className="text-white/82">{friends}</strong> friends
        </button>
      )}

      {open && (
        <div className="fixed inset-0 z-[130] grid place-items-center bg-black/70 p-4 backdrop-blur-sm" onClick={() => setOpen(null)}>
          <div className="panel max-h-[70vh] w-full max-w-md overflow-hidden rounded-[24px]" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-white/[.06] p-5">
              <div className="text-sm font-bold text-white/75">{TITLES[open]} · @{username}</div>
              <button type="button" onClick={() => setOpen(null)} className="grid h-8 w-8 place-items-center rounded-full bg-black/40 text-white/60 hover:text-white">×</button>
            </div>
            <div className="max-h-[52vh] overflow-y-auto p-3">
              {loading && <div className="p-6 text-center text-xs text-white/35">Loading…</div>}
              {!loading && people.length === 0 && <div className="p-6 text-center text-xs text-white/35">Nobody here yet.</div>}
              {people.map((p) => (
                <div key={p.username} className="flex items-center gap-3 rounded-2xl p-2.5 transition hover:bg-white/[.03]">
                  <Link href={`/keepers/${encodeURIComponent(p.username)}`} onClick={() => setOpen(null)} className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full border border-white/10">
                    {p.avatar_url ? <img src={p.avatar_url} alt="" className="h-full w-full object-cover" /> : <span className="text-[9px] text-white/30">AP</span>}
                  </Link>
                  <Link href={`/keepers/${encodeURIComponent(p.username)}`} onClick={() => setOpen(null)} className="min-w-0 flex-1">
                    <div className="truncate text-xs font-bold text-white/70">{p.display_name || `@${p.username}`}</div>
                    <div className="truncate text-[10px] text-white/30">@{p.username}</div>
                  </Link>
                  {isSelf && open === "followers" && (
                    <button type="button" onClick={() => removeFollower(p.username)} className="shrink-0 rounded-lg border border-white/[.08] px-2.5 py-1.5 text-[9px] font-bold text-white/40 hover:border-red-300/20 hover:text-red-200/70" title="Remove follower">
                      Remove
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
