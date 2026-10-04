"use client";

// Small CSS poker-chip stack with an amount label, ported from the original
// chipStackHTML (up to 5 chips, scaled by pot size).

const DENOMS: Array<{ value: number; color: string; edge: string; label: string }> = [
  { value: 500, color: "#7c3aed", edge: "#ffffff", label: "500" }, // purple
  { value: 100, color: "#23272e", edge: "#ffffff", label: "100" }, // black
  { value: 25, color: "#15803d", edge: "#ffffff", label: "25" }, // green
  { value: 5, color: "#b91c1c", edge: "#ffffff", label: "5" }, // red
  { value: 1, color: "#f1f5f9", edge: "#94a3b8", label: "1" }, // white
];

/** Greedy denomination breakdown, capped at 5 chips like the original. */
function breakdown(amount: number): typeof DENOMS {
  const chips: typeof DENOMS = [];
  let rest = Math.max(0, Math.floor(amount));
  for (const d of DENOMS) {
    while (rest >= d.value && chips.length < 5) {
      chips.push(d);
      rest -= d.value;
    }
    if (chips.length >= 5) break;
  }
  return chips;
}

export function ChipStack({ amount, className = "" }: { amount: number; className?: string }) {
  if (amount <= 0) return null;
  const chips = breakdown(amount);
  return (
    <span className={`inline-flex items-end gap-1.5 ${className}`}>
      <span className="relative block h-11 w-8" aria-hidden="true">
        {chips.map((chip, i) => (
          <span
            key={i}
            className="absolute left-1/2 flex h-7 w-7 -translate-x-1/2 items-center justify-center rounded-full border-2 border-dashed shadow-[0_1px_2px_rgba(0,0,0,0.4)]"
            style={{
              bottom: `${i * 4}px`,
              backgroundColor: chip.color,
              borderColor: chip.edge,
            }}
          >
            <span
              className="text-[7px] font-bold leading-none"
              style={{ color: chip.value === 1 ? "#334155" : "#ffffff" }}
            >
              {chip.label}
            </span>
          </span>
        ))}
      </span>
      <span className="text-xs font-semibold tabular-nums text-emerald-50 [text-shadow:0_1px_2px_rgba(0,0,0,0.7)]">
        {Math.floor(amount).toLocaleString("en-US")}
      </span>
    </span>
  );
}
