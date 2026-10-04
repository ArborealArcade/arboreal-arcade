"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export function KeeperBlockAction({ username }: { username: string }) {
  const router = useRouter();
  const [blocked, setBlocked] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/blocks", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!active) return;
        const list = Array.isArray(d?.blocked) ? d.blocked : [];
        setBlocked(list.some((x: { username?: string }) => x.username === username));
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
    return () => { active = false; };
  }, [username]);

  async function toggle() {
    if (busy) return;
    const next = !blocked;
    if (next && !window.confirm(`Block @${username}? They won't be able to follow you, friend you, or message you.`)) return;
    setBusy(true);
    try {
      const r = await fetch("/api/blocks", {
        method: next ? "POST" : "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username }),
      });
      if (r.status === 401) {
        router.push(`/login?next=${encodeURIComponent(`/keepers/${username}`)}`);
        return;
      }
      if (r.ok) {
        setBlocked(next);
        window.dispatchEvent(new CustomEvent("ap:block-changed", { detail: { username, blocked: next } }));
      }
    } finally {
      setBusy(false);
    }
  }

  if (!loaded) return null;
  return (
    <button
      type="button"
      onClick={() => void toggle()}
      disabled={busy}
      className={`rounded-xl border px-3 py-2.5 text-xs font-bold transition disabled:opacity-45 ${
        blocked
          ? "border-red-300/20 bg-red-300/[.06] text-red-200/70 hover:border-red-300/35"
          : "border-white/[.07] text-white/45 hover:border-red-300/20 hover:text-red-200/60"
      }`}
    >
      {busy ? "…" : blocked ? "Unblock" : "Block"}
    </button>
  );
}
