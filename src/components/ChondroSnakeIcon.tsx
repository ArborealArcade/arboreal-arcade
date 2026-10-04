import { chondroSpecificSpriteCandidatesFor, type ChondroClassification, type ChondroLifeStage, type ChondroNeonateColor, type ChondroSubspecies } from "@/lib/chondro-sprite-registry";

type TraitKey = "highBlack" | "highWhite" | "blueStripe" | "yellowRetention" | "blotches";
type PortraitTraits = Partial<Record<TraitKey, number>> & { blue?: number };

export function ChondroSnakeIcon({
  subspecies,
  name,
  compact = false,
  tiny = false,
  mini = false,
  large = false,
  lifeStage,
  neonateColor,
  locality,
  classification,
  ancestry,
  localityAncestry,
  phenotypeScore,
  spriteSeed,
}: {
  subspecies: ChondroSubspecies;
  name: string;
  traits?: PortraitTraits;
  compact?: boolean;
  tiny?: boolean;
  /** 80px square thumbnail (receipt rows, haul banner). Badges hidden. */
  mini?: boolean;
  /** Taller full-width art for the mobile shop carousel so the snake spreads across the card. */
  large?: boolean;
  lifeStage?: ChondroLifeStage;
  neonateColor?: ChondroNeonateColor;
  locality?: string;
  classification?: ChondroClassification;
  ancestry?: Partial<Record<ChondroSubspecies, number>>;
  localityAncestry?: Partial<Record<string, number>>;
  phenotypeScore?: number;
  spriteSeed?: string;
}) {
  const rawCandidates = chondroSpecificSpriteCandidatesFor({
    subspecies,
    locality,
    lifeStage,
    neonateColor,
    classification,
    ancestry,
    localityAncestry,
    phenotypeScore,
    variantSeed: spriteSeed ?? name,
  });
  const isSubadult = lifeStage === "Subadult";
  const versionedCandidates = rawCandidates.map(
    (src) => `${src}?v=2026-09-26-sprite-wave-v8`,
  );
  const versionedSrc = versionedCandidates[0] ?? null;

  const advanceSprite = (image: HTMLImageElement) => {
    const currentIndex = Number(image.dataset.spriteIndex ?? "0");
    const nextIndex = currentIndex + 1;
    const nextSrc = versionedCandidates[nextIndex];
    if (nextSrc) {
      image.dataset.spriteIndex = String(nextIndex);
      image.src = nextSrc;
      return;
    }
    image.style.display = "none";
    const fallback = image.nextElementSibling as HTMLElement | null;
    if (fallback) fallback.style.display = "grid";
  };

  const recoverIfVisuallyEmpty = (image: HTMLImageElement) => {
    try {
      const width = Math.max(1, Math.min(48, image.naturalWidth || 1));
      const height = Math.max(1, Math.min(48, image.naturalHeight || 1));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) return;
      context.clearRect(0, 0, width, height);
      context.drawImage(image, 0, 0, width, height);
      const pixels = context.getImageData(0, 0, width, height).data;
      let visiblePixels = 0;
      let meaningfulPixels = 0;
      const totalPixels = width * height;

      for (let index = 0; index < pixels.length; index += 4) {
        const red = pixels[index];
        const green = pixels[index + 1];
        const blue = pixels[index + 2];
        const alpha = pixels[index + 3];

        if (alpha <= 12) continue;
        visiblePixels += 1;

        // Some recently uploaded Keeper WebPs decode successfully but contain
        // only an opaque/near-black canvas. Count a pixel as meaningful when
        // it carries enough visible color/light to plausibly belong to sprite
        // artwork instead of an empty black payload.
        const brightest = Math.max(red, green, blue);
        const darkest = Math.min(red, green, blue);
        if (brightest > 18 || brightest - darkest > 10) meaningfulPixels += 1;
      }

      const visibleRatio = visiblePixels / totalPixels;
      const meaningfulRatio = meaningfulPixels / totalPixels;
      if (visibleRatio < 0.005 || meaningfulRatio < 0.005) advanceSprite(image);
    } catch {
      // Same-origin Keeper sprites should be readable. If a browser blocks
      // canvas inspection, keep the successfully-loaded image rather than
      // incorrectly hiding valid art.
    }
  };

  return (
    <div className={`relative overflow-hidden rounded-2xl border border-white/[.06] bg-black/20 ${mini ? "h-20 w-20" : tiny ? "h-44 w-full" : large ? "h-60 w-full" : compact ? "h-40 min-w-40 sm:h-48 sm:min-w-48" : "h-56 w-full sm:h-72"}`}>
      {versionedSrc ? (
        <img
          key={versionedSrc}
          src={versionedSrc}
          data-sprite-index="0"
          onLoad={(event) => recoverIfVisuallyEmpty(event.currentTarget)}
          onError={(event) => advanceSprite(event.currentTarget)}
          alt={`${name} illustrated virtual game portrait`}
          loading="lazy"
          decoding="async"
          className={`h-full w-full object-contain ${tiny ? "p-1" : "p-1 sm:p-2"} ${isSubadult ? "scale-[0.86]" : ""}`}
        />
      ) : null}
      <div
        className={`absolute inset-0 place-items-center text-center ${mini ? "p-2" : "p-6"}`}
        style={{ display: versionedSrc ? "none" : "grid" }}
      >
        <div>
          <svg viewBox="0 0 64 64" className={`mx-auto text-emerald-100/25 ${mini ? "h-8 w-8" : "h-14 w-14"}`} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
            <path d="M32 12c-9 0-16 6-16 14 0 5 3 9 7 11-4 2-7 6-7 11 0 8 7 14 16 14s16-6 16-14c0-5-3-9-7-11 4-2 7-6 7-11 0-8-7-14-16-14z" />
            <circle cx="32" cy="18" r="1.6" fill="currentColor" stroke="none" />
          </svg>
          <div className={`font-black uppercase text-emerald-100/55 ${mini ? "mt-1 text-[8px] tracking-[.14em]" : "mt-3 text-[10px] tracking-[.18em]"}`}>Sprite pending</div>
          {!mini ? (
            <>
              <div className="mt-2 text-xs font-semibold text-white/45">{locality ?? classification ?? subspecies}</div>
              <div className="mt-1 text-[10px] text-white/30">Artwork for this animal is on the way</div>
            </>
          ) : null}
        </div>
      </div>
      {!mini ? (
        <div className="pointer-events-none absolute left-2 top-2 rounded-full border border-emerald-100/20 bg-[#06100c]/85 px-2.5 py-1 text-[8px] font-black uppercase tracking-[.16em] text-emerald-100/75 shadow-lg backdrop-blur-sm">
          Virtual
        </div>
      ) : null}
      {!mini && lifeStage && lifeStage !== "Adult" ? (
        <div className={`pointer-events-none absolute right-2 top-2 rounded-full border px-2.5 py-1 text-[8px] font-black uppercase tracking-[.12em] shadow-lg backdrop-blur-sm ${neonateColor === "Red" ? "border-red-200/20 bg-red-950/75 text-red-100/80" : "border-amber-100/20 bg-amber-950/75 text-amber-100/80"}`}>
          {lifeStage ?? "Juvenile"}
        </div>
      ) : null}
    </div>
  );
}
