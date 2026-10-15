"use client";

import { useEffect, useState } from "react";

type SettingKey = "shop_theme" | "hank_costume";

const SETTINGS: Array<{
  key: SettingKey;
  label: string;
  blurb: string;
  options: Array<{ value: string; label: string }>;
}> = [
  {
    key: "shop_theme",
    label: "Shop theme",
    blurb: "Seasonal look for Hank's shop and the arcade loading screen.",
    options: [
      { value: "default", label: "Default" },
      { value: "halloween", label: "🎃 Halloween" },
    ],
  },
  {
    key: "hank_costume",
    label: "Hank's costume",
    blurb: "Puts Hank in his Captain Spaulding costume in the shop.",
    options: [
      { value: "off", label: "Off" },
      { value: "on", label: "On" },
    ],
  },
];

export function OwnerConsoleClient({ token }: { token: string }) {
  const [values, setValues] = useState<Record<SettingKey, string>>({
    shop_theme: "default",
    hank_costume: "off",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<SettingKey | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const entries = await Promise.all(
          SETTINGS.map(async (s) => {
            const response = await fetch(`/api/site-settings?key=${s.key}`, { cache: "no-store" });
            const data = (await response.json().catch(() => null)) as { value?: unknown } | null;
            return [s.key, typeof data?.value === "string" ? data.value : null] as const;
          })
        );
        if (!active) return;
        setValues((prev) => {
          const next = { ...prev };
          for (const [key, value] of entries) {
            if (value !== null) next[key] = value;
          }
          return next;
        });
      } catch {
        // Leave defaults; the toggles still work.
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  async function save(key: SettingKey, value: string) {
    if (saving || values[key] === value) return;
    setSaving(key);
    setSavedAt(null);
    setError(null);
    try {
      const response = await fetch("/api/admin/arcade-settings", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ key, value }),
        cache: "no-store",
      });
      const data = (await response.json().catch(() => null)) as { value?: unknown; error?: unknown } | null;
      if (!response.ok) {
        throw new Error(typeof data?.error === "string" ? data.error : "Could not save.");
      }
      if (typeof data?.value === "string") {
        setValues((prev) => ({ ...prev, [key]: data.value as string }));
        setSavedAt(new Date().toLocaleTimeString());
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setSaving(null);
    }
  }

  return (
    <main className="mx-auto max-w-xl px-4 py-10 text-neutral-100">
      <h1 className="text-2xl font-bold">Owner Console</h1>
      <p className="mt-1 text-sm text-neutral-400">
        These write straight to the Arcade&apos;s own settings — no cross-site sync involved.
      </p>

      {loading ? (
        <p className="mt-8 text-sm text-neutral-400">Loading current settings…</p>
      ) : (
        <div className="mt-8 space-y-6">
          {SETTINGS.map((setting) => (
            <section
              key={setting.key}
              className="rounded-2xl border border-neutral-800 bg-neutral-900/60 p-5"
            >
              <h2 className="text-base font-semibold">{setting.label}</h2>
              <p className="mt-1 text-sm text-neutral-400">{setting.blurb}</p>
              <div className="mt-4 flex gap-2">
                {setting.options.map((option) => {
                  const selected = values[setting.key] === option.value;
                  const busy = saving === setting.key;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      disabled={busy}
                      onClick={() => void save(setting.key, option.value)}
                      className={`rounded-full px-5 py-2 text-sm font-semibold transition ${
                        selected
                          ? "bg-emerald-500 text-black"
                          : "bg-neutral-800 text-neutral-200 hover:bg-neutral-700"
                      } ${busy ? "opacity-50" : ""}`}
                    >
                      {busy && selected ? "Saving…" : option.label}
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}

      {savedAt && (
        <p className="mt-6 text-sm text-emerald-400">Saved at {savedAt}.</p>
      )}
      {error && <p className="mt-6 text-sm text-red-400">{error}</p>}
    </main>
  );
}
