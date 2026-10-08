"use client";

import { useEffect, useState } from "react";

type Theme = "default" | "halloween";

const OPTIONS: Array<{ id: Theme; label: string; blurb: string }> = [
  { id: "default", label: "Default", blurb: "The standard Arcade splash." },
  { id: "halloween", label: "🎃 Halloween", blurb: "Spooky Halloween loading art." },
];

// Owner-only theme switch for the standalone Arcade. Writes to the Arcade's
// own arcade_settings table via the owner-gated API. The same control is
// mirrored in Planet's owner console; both flip the same flag.
// Requires an Arcade JWT (ap_arcade_jwt), minted by Planet's server.
export function ArcadeThemeSwitch({ token }: { token: string }) {
  const [theme, setTheme] = useState<Theme>("default");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<Theme | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void fetch("/api/site-settings?key=shop_theme", { cache: "no-store" })
      .then((response) => response.json().catch(() => null))
      .then((data) => {
        if (active && data && data.value === "halloween") setTheme("halloween");
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function save(next: Theme) {
    if (saving || next === theme) return;
    setSaving(next);
    setError(null);
    try {
      const response = await fetch("/api/admin/arcade-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ key: "shop_theme", value: next }),
      });
      const data = (await response.json().catch(() => null)) as { value?: unknown; error?: unknown } | null;
      if (!response.ok) throw new Error(typeof data?.error === "string" ? data.error : "Could not save.");
      setTheme(data?.value === "halloween" ? "halloween" : "default");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setSaving(null);
    }
  }

  if (loading) return <p className="text-sm text-white/40">Loading current theme…</p>;

  return (
    <div className="grid gap-2.5 sm:grid-cols-2">
      {OPTIONS.map((option) => {
        const selected = option.id === theme;
        const busy = saving === option.id;
        return (
          <button
            key={option.id}
            type="button"
            disabled={saving !== null}
            onClick={() => void save(option.id)}
            aria-pressed={selected}
            className={`rounded-2xl border p-4 text-left transition ${
              selected
                ? "border-emerald-300/50 bg-emerald-300/[.07]"
                : "border-white/[.08] bg-white/[.015] hover:border-white/20 hover:bg-white/[.04]"
            } ${saving !== null && !busy ? "opacity-60" : ""}`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-black uppercase tracking-[.06em] text-white/85">{option.label}</span>
              {selected ? (
                <span className="rounded-full bg-emerald-300/20 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-[.1em] text-emerald-100/90">
                  Live
                </span>
              ) : null}
            </div>
            <p className="mt-1.5 text-xs leading-5 text-white/45">{option.blurb}</p>
            {busy ? <p className="mt-2 text-xs text-white/50">Saving…</p> : null}
          </button>
        );
      })}
      {error ? <p className="text-xs text-red-300/90 sm:col-span-2">{error}</p> : null}
    </div>
  );
}
