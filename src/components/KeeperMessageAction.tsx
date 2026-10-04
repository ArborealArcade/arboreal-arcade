"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export function KeeperMessageAction({ username }: { username: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    let active = true;
    async function refresh() {
      try {
        const r = await fetch(`/api/keepers/${encodeURIComponent(username)}/block-status`, { cache: "no-store" });
        const d = await r.json().catch(() => null);
        if (active) setBlocked(r.ok ? !d?.canInteract : false);
      } catch {
        if (active) setBlocked(false);
      }
    }
    void refresh();
    const onChange = (e: Event) => {
      const detail = (e as CustomEvent).detail as { username?: string } | undefined;
      if (detail?.username === username) void refresh();
    };
    window.addEventListener("ap:block-changed", onChange);
    return () => { active = false; window.removeEventListener("ap:block-changed", onChange); };
  }, [username]);

  async function start() {
    if (busy) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/keepers/${encodeURIComponent(username)}/message`, { method: "POST" });
      if (response.status === 401) {
        router.push(`/login?next=${encodeURIComponent(`/keepers/${username}`)}`);
        return;
      }
      const data = await response.json().catch(() => null) as { conversationId?: string; error?: string } | null;
      if (response.ok && data?.conversationId) router.push(`/messages/${encodeURIComponent(data.conversationId)}`);
    } finally {
      setBusy(false);
    }
  }

  if (blocked) return null;
  return <button type="button" onClick={() => void start()} disabled={busy} className="rounded-xl border border-white/[.08] bg-white/[.02] px-4 py-2.5 text-xs font-black text-white/55 transition hover:border-emerald-300/18 hover:bg-emerald-300/[.025] hover:text-emerald-100/70 disabled:opacity-45">{busy ? "Opening…" : "Message"}</button>;
}
