/* The Sorting Hat — Snake Sorting's animated host.
 *
 * A single component that gives the Hat a physical presence: it idles with a
 * gentle sway, tips its brim when the keeper calls it right, droops when
 * they're wrong, and leans in thoughtfully during probes. Pure CSS animation
 * over the existing hat art — no new assets needed.
 */

export type HatMood = "idle" | "happy" | "sad" | "thinking" | "celebrate";

const MOOD_ANIMATION: Record<HatMood, string> = {
  idle: "hat-idle 4s ease-in-out infinite",
  happy: "hat-happy 0.9s ease-in-out 2",
  sad: "hat-sad 1.4s ease-in-out 1",
  thinking: "hat-thinking 2.6s ease-in-out infinite",
  celebrate: "hat-celebrate 1.1s ease-in-out 3",
};

const MOOD_LABEL: Record<HatMood, string> = {
  idle: "The Sorting Hat watches",
  happy: "The Sorting Hat tips its brim",
  sad: "The Sorting Hat droops",
  thinking: "The Sorting Hat ponders",
  celebrate: "The Sorting Hat celebrates",
};

export function SortingHat({
  mood = "idle",
  size = "md",
  asset,
}: {
  mood?: HatMood;
  size?: "sm" | "md" | "lg";
  asset: string;
}) {
  const sizeClass =
    size === "sm"
      ? "h-14 w-14"
      : size === "lg"
        ? "h-28 w-28"
        : "h-20 w-20";
  // Swap the sprite for the sad mood only: the sad sprite has a half-closed
  // eye and drooping brim. Happy/celebrate use the base sprite with CSS
  // motion (brim tip, bounce).
  const moodAsset =
    mood === "sad"
      ? asset.replace("sorting-hat-v2.webp", "sorting-hat-sad.webp")
      : asset;
  return (
    <>
      <style>{`
@keyframes hat-idle {
  0%, 100% { transform: rotate(-2deg) translateY(0); }
  50% { transform: rotate(2deg) translateY(-4px); }
}
@keyframes hat-happy {
  0%, 100% { transform: rotate(0deg) translateY(0); }
  30% { transform: rotate(-8deg) translateY(-8px); }
  60% { transform: rotate(6deg) translateY(-2px); }
}
@keyframes hat-sad {
  0% { transform: rotate(0deg) translateY(0); }
  100% { transform: rotate(4deg) translateY(6px); }
}
@keyframes hat-thinking {
  0%, 100% { transform: rotate(-8deg) translateY(0); }
  50% { transform: rotate(-4deg) translateY(-3px); }
}
@keyframes hat-celebrate {
  0%, 100% { transform: rotate(0deg) translateY(0) scale(1); }
  25% { transform: rotate(-10deg) translateY(-12px) scale(1.06); }
  50% { transform: rotate(10deg) translateY(-6px) scale(1.03); }
  75% { transform: rotate(-6deg) translateY(-10px) scale(1.05); }
}
      `}</style>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={moodAsset}
        alt={MOOD_LABEL[mood]}
        className={`${sizeClass} shrink-0 rounded-full border border-amber-200/30 object-cover shadow-[0_0_30px_rgba(251,191,36,.3)]`}
        style={{ animation: MOOD_ANIMATION[mood] }}
        draggable={false}
      />
    </>
  );
}
