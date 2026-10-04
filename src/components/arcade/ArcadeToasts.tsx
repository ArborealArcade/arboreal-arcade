"use client";

import { useEffect, useState } from "react";
import type { ArcadeToast } from "@/lib/arcade";

/** Global achievement / token / quest toasts. Mount once per page. */
export function ArcadeToasts() {
  const [toasts, setToasts] = useState<ArcadeToast[]>([]);

  useEffect(() => {
    const onToast = (ev: Event) => {
      const toast = (ev as CustomEvent<ArcadeToast>).detail;
      if (!toast) return;
      setToasts((t) => [...t.slice(-3), toast]);
      window.setTimeout(() => {
        setToasts((t) => t.filter((x) => x.id !== toast.id));
      }, 4500);
    };
    window.addEventListener("arcade-toast", onToast);
    return () => window.removeEventListener("arcade-toast", onToast);
  }, []);

  if (toasts.length === 0) return null;
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-72 flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto rounded-2xl border p-3 shadow-2xl backdrop-blur ${
            t.kind === "achievement"
              ? "border-amber-200/30 bg-[#171106]/95"
              : t.kind === "quest"
                ? "border-violet-300/30 bg-[#120e1f]/95"
                : "border-emerald-300/30 bg-[#06120c]/95"
          }`}
        >
          <p className="text-sm font-bold text-white">{t.title}</p>
          {t.detail && <p className="mt-0.5 text-xs text-white/55">{t.detail}</p>}
        </div>
      ))}
    </div>
  );
}
