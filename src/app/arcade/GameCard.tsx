"use client";

import { useId, useState } from "react";
import Image from "next/image";
import Link from "next/link";

export interface GameStep {
  title: string;
  text: string;
}

interface GameCardProps {
  href: string;
  imageSrc: string;
  imageAlt: string;
  kicker: string;
  title: string;
  description: string;
  steps: GameStep[];
}

/**
 * Compact game row: art thumbnail, title and Play stay visible; the long
 * description and feature steps collapse underneath so one game never eats
 * a whole phone screen.
 */
export default function GameCard({
  href,
  imageSrc,
  imageAlt,
  kicker,
  title,
  description,
  steps,
}: GameCardProps) {
  const [open, setOpen] = useState(false);
  const detailsId = useId();

  return (
    <div className="panel overflow-hidden rounded-[26px]">
      <div className="flex items-center gap-4 p-4 sm:p-5">
        <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-2xl bg-black/30">
          <Image
            src={imageSrc}
            alt={imageAlt}
            fill
            sizes="80px"
            className="object-cover object-top"
          />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-bold uppercase tracking-[.2em] text-amber-100/55">{kicker}</div>
          <h2 className="mt-1 truncate text-xl font-semibold tracking-[-.02em]">{title}</h2>
        </div>
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-controls={detailsId}
          className="flex shrink-0 items-center gap-1.5 rounded-xl border border-white/[.09] px-3 py-2 text-xs font-bold text-white/60 transition hover:bg-white/[.04]"
        >
          Details
          <svg
            viewBox="0 0 16 16"
            aria-hidden="true"
            className={`h-3.5 w-3.5 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          >
            <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      <div className="px-4 pb-4 sm:px-5 sm:pb-5">
        <Link
          href={href}
          className="block w-full rounded-xl bg-amber-200 px-5 py-3 text-center text-sm font-bold text-[#17130a] transition hover:bg-amber-100 active:scale-[.99]"
        >
          Play now
        </Link>
      </div>

      {open ? (
        <div id={detailsId} className="border-t border-white/[.06] p-4 sm:p-5">
          <p className="text-sm leading-6 text-white/55">{description}</p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            {steps.map((step) => (
              <div key={step.title} className="rounded-2xl border border-white/[.06] bg-white/[.02] p-3.5">
                <div className="text-[10px] font-bold tracking-[.16em] text-emerald-300/55">{step.title}</div>
                <p className="mt-2 text-xs leading-5 text-white/45">{step.text}</p>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
