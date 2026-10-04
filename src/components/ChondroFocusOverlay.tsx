"use client";

import { useEffect, useRef } from "react";
import type { ReactNode } from "react";

type FocusOverlayProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  eyebrow?: string;
  children: ReactNode;
  mode?: "drawer" | "modal";
};

const focusableSelector = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

export function ChondroFocusOverlay({ open, onClose, title, eyebrow, children, mode = "drawer" }: FocusOverlayProps) {
  const panelRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.style.overflow = "hidden";

    const panel = panelRef.current;
    const initialFocus = panel?.querySelector<HTMLElement>(focusableSelector);
    window.requestAnimationFrame(() => (initialFocus ?? panel)?.focus());

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !panelRef.current) return;

      const focusable = Array.from(panelRef.current.querySelectorAll<HTMLElement>(focusableSelector)).filter(
        (element) => !element.hasAttribute("disabled") && element.getAttribute("aria-hidden") !== "true",
      );
      if (!focusable.length) {
        event.preventDefault();
        panelRef.current.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
      previouslyFocused?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  const shell = mode === "drawer"
    ? "ml-auto h-full w-full max-w-[620px] border-l border-white/[.08] bg-[#07110d] shadow-[-24px_0_80px_rgba(0,0,0,.42)] sm:w-[min(620px,92vw)]"
    : "mx-auto my-auto max-h-[90vh] w-[min(940px,calc(100vw-24px))] overflow-hidden rounded-[28px] border border-white/[.09] bg-[#07110d] shadow-[0_30px_100px_rgba(0,0,0,.55)]";

  return (
    <div className={`fixed inset-0 z-[90] flex ${mode === "drawer" ? "justify-end" : "items-center justify-center p-3"}`} role="presentation">
      <div aria-hidden="true" onMouseDown={onClose} className="absolute inset-0 bg-black/70 backdrop-blur-[3px]" />
      <section
        ref={panelRef}
        tabIndex={-1}
        className={`relative flex flex-col outline-none ${shell}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="chondro-focus-title"
      >
        <div className="flex items-start justify-between gap-4 border-b border-white/[.07] px-5 py-4 sm:px-6 sm:py-5">
          <div className="min-w-0">
            {eyebrow ? <div className="section-kicker">{eyebrow}</div> : null}
            <h2 id="chondro-focus-title" className="mt-2 truncate text-2xl font-semibold tracking-[-.035em] text-white">{title}</h2>
          </div>
          <button type="button" onClick={onClose} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/[.08] bg-white/[.025] text-lg text-white/55 transition hover:border-white/[.15] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/50" aria-label="Close">×</button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-5 sm:p-6">{children}</div>
      </section>
    </div>
  );
}
