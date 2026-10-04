import Image from "next/image";

type Screen = "breeding" | "colony" | "market";

const screenArt: Record<Screen, { src: string; eyebrow: string; title: string; detail: string; alt: string }> = {
  breeding: {
    src: "/hatchery/game/fresh-eggs.webp",
    eyebrow: "Breeding program",
    title: "Build each pairing toward a real clutch.",
    detail: "Condition breeders, cycle the female, pair, separate, follow development and move into incubation.",
    alt: "Illustrated green tree python eggs in the Arboreal Planet game style",
  },
  colony: {
    src: "/hatchery/game/pvc-enclosure.webp",
    eyebrow: "Chondro Dojo housing",
    title: "Your colony lives in purpose-built arboreal enclosures.",
    detail: "Use the Colony screen for animal records, testing, care, capacity and enclosure management.",
    alt: "Illustrated PVC green tree python enclosure with white PVC perches",
  },
  market: {
    src: "/hatchery/game/neonates.webp",
    eyebrow: "Chondro exchange",
    title: "Buy, raise and move animals through the breeder economy.",
    detail: "The Store combines rotating game animals with player listings and the conservation fallback system.",
    alt: "Illustrated red and yellow green tree python neonates in the Arboreal Planet game style",
  },
};

export function ChondroBreederScreenArt({ screen }: { screen: Screen }) {
  const art = screenArt[screen];
  return (
    <section className="mx-auto max-w-7xl px-4 pt-4 sm:px-6 sm:pt-5">
      <div className="overflow-hidden rounded-[30px] border border-emerald-300/12 bg-[#06100c] shadow-[0_24px_70px_rgba(0,0,0,.24)]">
        <div className="grid lg:min-h-[280px] lg:grid-cols-[minmax(300px,42%)_1fr]">
          <div className="relative min-h-[220px] overflow-hidden border-b border-white/[.06] bg-black/35 sm:min-h-[260px] lg:min-h-full lg:border-b-0 lg:border-r">
            <Image
              src={art.src}
              alt={art.alt}
              fill
              sizes="(max-width: 1024px) 100vw, 42vw"
              className="object-cover"
              priority={screen === "breeding"}
            />
            <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,transparent_46%,rgba(3,8,6,.68)_100%)] lg:bg-[linear-gradient(90deg,transparent_58%,rgba(6,16,12,.78)_100%)]" />
          </div>
          <div className="relative flex items-center overflow-hidden p-5 sm:p-7 lg:p-9">
            <div className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-emerald-300/[.055] blur-3xl" />
            <div className="relative max-w-2xl">
              <div className="text-[9px] font-black uppercase tracking-[.19em] text-emerald-200/55">{art.eyebrow}</div>
              <h2 className="mt-3 text-2xl font-semibold tracking-[-.04em] text-white sm:text-3xl">{art.title}</h2>
              <p className="mt-3 max-w-xl text-sm leading-6 text-white/48 sm:text-[15px]">{art.detail}</p>
              <div className="mt-5 h-px w-20 bg-gradient-to-r from-emerald-300/45 to-transparent" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
