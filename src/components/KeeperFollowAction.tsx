"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type State = { signedIn: boolean; following: boolean; canFollow: boolean; target?: { username: string; displayName: string | null }; error?: string };

export function KeeperFollowAction({ username }: { username: string }) {
  const router = useRouter();
  const [state, setState] = useState<State | null>(null);
  const [busy, setBusy] = useState(false);
  const [canInteract, setCanInteract] = useState(true);

  useEffect(() => {
    let active = true;
    void fetch(`/api/keepers/${encodeURIComponent(username)}/follow`, { cache: "no-store" })
      .then(async (response) => ({ response, data: await response.json().catch(() => null) as State | null }))
      .then(({ response, data }) => {
        if (!active) return;
        if (!response.ok || !data) setState({ signedIn: false, following: false, canFollow: false, error: data?.error || "Follow unavailable" });
        else setState(data);
      });
    fetch(`/api/keepers/${encodeURIComponent(username)}/block-status`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (active && d && d.canInteract === false) setCanInteract(false); })
      .catch(() => {});
    const onChange = (e: Event) => {
      const detail = (e as CustomEvent).detail as { username?: string; blocked?: boolean } | undefined;
      if (detail?.username === username && active) setCanInteract(!detail.blocked);
    };
    window.addEventListener("ap:block-changed", onChange);
    return () => { active = false; window.removeEventListener("ap:block-changed", onChange); };
  }, [username]);

  async function toggle() {
    if (!state) return;
    if (!state.signedIn) {
      router.push(`/login?next=${encodeURIComponent(`/keepers/${username}`)}`);
      return;
    }
    if (!state.canFollow || busy) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/keepers/${encodeURIComponent(username)}/follow`, { method: "POST" });
      if (response.status === 401) {
        router.push(`/login?next=${encodeURIComponent(`/keepers/${username}`)}`);
        return;
      }
      const data = await response.json().catch(() => null) as { following?: boolean; error?: string } | null;
      if (response.ok && typeof data?.following === "boolean") setState((current) => current ? { ...current, following: data.following! } : current);
    } finally {
      setBusy(false);
    }
  }

  if (!state || state.error || !state.canFollow || !canInteract) return null;

  return <button type="button" onClick={() => void toggle()} disabled={busy} className={`rounded-xl border px-4 py-2.5 text-xs font-black transition disabled:opacity-45 ${state.following ? "border-white/[.08] bg-white/[.025] text-white/55 hover:border-red-200/15 hover:text-red-100/60" : "border-emerald-300/18 bg-emerald-300/[.045] text-emerald-100/72 hover:bg-emerald-300/[.08]"}`}>{busy ? "Working…" : state.following ? "Following" : state.signedIn ? "Follow keeper" : "Sign in to follow"}</button>;
}
