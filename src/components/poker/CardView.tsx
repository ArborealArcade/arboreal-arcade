"use client";

import type { CSSProperties } from "react";

/** Supabase Storage bucket holding the AI court-card art and card back. */
export const CARD_ART_BASE_URL =
  "https://ykaqnxajszwgeqkmaora.supabase.co/storage/v1/object/public/arcade-card-art";

export type CardSuit = "S" | "H" | "D" | "C";
export type CardSize = "sm" | "md" | "lg" | "fluid";

const SUIT_META: Record<CardSuit, { name: string; glyph: string; color: string }> = {
  S: { name: "Spades", glyph: "♠", color: "#171816" },
  H: { name: "Hearts", glyph: "♥", color: "#b3132b" },
  D: { name: "Diamonds", glyph: "♦", color: "#b3132b" },
  C: { name: "Clubs", glyph: "♣", color: "#171816" },
};

const RANK_LABELS: Record<number, string> = { 11: "J", 12: "Q", 13: "K", 14: "A" };
const RANK_NAMES: Record<number, string> = {
  14: "Ace",
  13: "King",
  12: "Queen",
  11: "Jack",
  10: "Ten",
  9: "Nine",
  8: "Eight",
  7: "Seven",
  6: "Six",
  5: "Five",
  4: "Four",
  3: "Three",
  2: "Two",
};
const COURT_FILES: Record<number, string> = { 11: "jack", 12: "queen", 13: "king" };
const SUIT_FILES: Record<CardSuit, string> = {
  S: "spades",
  H: "hearts",
  D: "diamonds",
  C: "clubs",
};

// Pip positions ported verbatim from the original pipLayout: [left%, top%].
const PIP_LAYOUTS: Record<number, Array<[number, number]>> = {
  2: [[50, 22], [50, 78]],
  3: [[50, 18], [50, 50], [50, 82]],
  4: [[28, 24], [72, 24], [28, 76], [72, 76]],
  5: [[28, 21], [72, 21], [50, 50], [28, 79], [72, 79]],
  6: [[28, 18], [72, 18], [28, 50], [72, 50], [28, 82], [72, 82]],
  7: [[28, 15], [72, 15], [50, 33], [28, 50], [72, 50], [28, 84], [72, 84]],
  8: [[28, 14], [72, 14], [50, 31], [28, 42], [72, 42], [50, 61], [28, 84], [72, 84]],
  9: [[28, 13], [72, 13], [28, 35], [72, 35], [50, 50], [28, 65], [72, 65], [28, 87], [72, 87]],
  10: [[28, 11], [72, 11], [50, 25], [28, 34], [72, 34], [28, 66], [72, 66], [50, 75], [28, 89], [72, 89]],
};

const SIZE_CLASSES: Record<
  CardSize,
  { card: string; index: string; pip: string; ace: string; radius: string }
> = {
  sm: { card: "w-11 h-[62px]", index: "text-[9px]", pip: "text-[11px]", ace: "text-2xl", radius: "rounded-md" },
  md: { card: "w-[72px] h-[102px]", index: "text-xs", pip: "text-[17px]", ace: "text-4xl", radius: "rounded-lg" },
  lg: { card: "w-[104px] h-[148px]", index: "text-sm", pip: "text-2xl", ace: "text-6xl", radius: "rounded-xl" },
  // Fluid: fills its wrapper's width at a 5:7 ratio; pips scale with the card
  // via container-query units so a full row always fits small screens.
  // NOTE: the card's own radius must NOT use cqw — an element can't query
  // itself, so cqw here resolves against an ancestor/viewport and turns the
  // card into a pill. Children (pips/indices) may use cqw; the card uses px.
  fluid: {
    card: "w-full aspect-[5/7] @container",
    index: "text-[13cqw]",
    pip: "text-[22cqw]",
    ace: "text-[55cqw]",
    radius: "rounded-[10px]",
  },
};

export function rankText(rank: number): string {
  return RANK_LABELS[rank] ?? String(rank);
}

export function courtArtUrl(rank: number, suit: CardSuit): string {
  return `${CARD_ART_BASE_URL}/${COURT_FILES[rank]}-${SUIT_FILES[suit]}.jpg`;
}

export function SuitGlyph({ suit, className = "" }: { suit: CardSuit; className?: string }) {
  const meta = SUIT_META[suit];
  return (
    <span aria-hidden="true" className={className} style={{ color: meta.color }}>
      {meta.glyph}
    </span>
  );
}

function CardFace({
  rank,
  suit,
  size,
  className = "",
}: {
  rank: number;
  suit: CardSuit;
  size: CardSize;
  className?: string;
}) {
  const meta = SUIT_META[suit];
  const sz = SIZE_CLASSES[size];
  const isCourt = rank >= 11 && rank <= 13;
  const label = `${RANK_NAMES[rank] ?? rank} of ${meta.name}`;

  const artStyle: CSSProperties = isCourt
    ? {
        // Layered so the card still looks fine if the art 404s before upload.
        backgroundImage: `url("${courtArtUrl(rank, suit)}"), linear-gradient(135deg, #274a31 0%, #122b1a 100%)`,
        backgroundSize: "cover, cover",
        backgroundPosition: "center, center",
      }
    : {};

  const pipLayer = (() => {
    if (isCourt) return null;
    if (rank === 14) {
      return (
        <div className="absolute inset-0 flex items-center justify-center">
          <SuitGlyph suit={suit} className={`${sz.ace} leading-none`} />
        </div>
      );
    }
    const layout = PIP_LAYOUTS[rank];
    if (!layout) return null;
    return (
      <div className="absolute inset-0" aria-hidden="true">
        {layout.map(([left, top], i) => (
          <span
            key={i}
            className={`absolute -translate-x-1/2 -translate-y-1/2 ${sz.pip} leading-none ${top > 50 ? "rotate-180" : ""}`}
            style={{ left: `${left}%`, top: `${top}%` }}
          >
            <SuitGlyph suit={suit} />
          </span>
        ))}
      </div>
    );
  })();

  return (
    <div
      role="img"
      aria-label={label}
      className={`relative select-none bg-white shadow-[0_2px_8px_rgba(0,0,0,0.35)] ${sz.card} ${sz.radius} ${className}`}
    >
      {isCourt && (
        <div className={`absolute inset-0 ${sz.radius} overflow-hidden`} style={artStyle} aria-hidden="true" />
      )}
      {pipLayer}
      {/* Corner indices, over the art on courts like the original. */}
      <span
        className={`absolute left-[6%] top-[4%] flex flex-col items-center font-bold leading-none ${sz.index} ${
          isCourt ? "text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.9)]" : ""
        }`}
        style={isCourt ? undefined : { color: meta.color }}
      >
        {rankText(rank)}
        <SuitGlyph suit={suit} className={isCourt ? "[text-shadow:0_1px_3px_rgba(0,0,0,0.9)]" : ""} />
      </span>
      <span
        className={`absolute bottom-[4%] right-[6%] flex rotate-180 flex-col items-center font-bold leading-none ${sz.index} ${
          isCourt ? "text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.9)]" : ""
        }`}
        style={isCourt ? undefined : { color: meta.color }}
      >
        {rankText(rank)}
        <SuitGlyph suit={suit} className={isCourt ? "[text-shadow:0_1px_3px_rgba(0,0,0,0.9)]" : ""} />
      </span>
    </div>
  );
}

export function CardBack({ size = "md", className = "" }: { size?: CardSize; className?: string }) {
  const sz = SIZE_CLASSES[size];
  return (
    <div
      role="img"
      aria-label="Face-down card"
      className={`relative select-none shadow-[0_2px_8px_rgba(0,0,0,0.35)] ${sz.card} ${sz.radius} ${className}`}
      style={{
        // Layered so the back still looks fine if the art 404s before upload.
        backgroundImage: `url("${CARD_ART_BASE_URL}/card-back.jpg"), linear-gradient(135deg, #1d4d2c 0%, #0d2415 100%)`,
        backgroundSize: "cover, cover",
        backgroundPosition: "center, center",
      }}
    />
  );
}

export function CardView({
  rank,
  suit,
  faceDown = false,
  size = "md",
  className = "",
}: {
  rank: number;
  suit: CardSuit;
  faceDown?: boolean;
  size?: CardSize;
  className?: string;
}) {
  if (faceDown) return <CardBack size={size} className={className} />;
  return <CardFace rank={rank} suit={suit} size={size} className={className} />;
}
