import Image from "next/image";

function Pitcher({ left, top, scale = 1 }: { left: string; top: string; scale?: number }) {
  return (
    <div className="absolute" style={{ left, top, transform: `scale(${scale})` }}>
      <div className="h-10 w-6 rounded-b-[45%] rounded-t-[32%] border border-rose-200/15 bg-gradient-to-b from-rose-900/75 to-amber-950/80 shadow-[inset_0_0_10px_rgba(0,0,0,.35)]" />
      <div className="absolute -left-1 -top-1 h-2.5 w-8 -rotate-6 rounded-full border border-rose-200/20 bg-rose-950" />
      <div className="absolute left-2.5 -top-7 h-7 w-[2px] bg-emerald-700/55" />
    </div>
  );
}

export function ArborealPlanetMark({ className = "" }: { className?: string }) {
  return (
    <div className={`relative shrink-0 overflow-hidden rounded-xl shadow-[0_0_30px_rgba(52,211,153,.10)] ${className}`} aria-label="Arboreal Planet logo mark">
      <Image src="/branding/arboreal-planet-app-icon.webp" alt="" fill sizes="40px" className="object-cover" priority />
    </div>
  );
}

export function SnakeStocksBrandBanner({ compact = false }: { compact?: boolean }) {
  return (
    <div
      role="img"
      aria-label="Snake Stocks jungle banner with mascot, market chart, locality signs and Arboreal Planet branding"
      className={`relative w-full overflow-hidden border border-emerald-300/15 bg-[#020805] shadow-[0_28px_90px_rgba(0,0,0,.32)] ${compact ? "rounded-[26px]" : "sm:rounded-[30px]"}`}
      style={{ aspectRatio: "1983 / 793" }}
    >
      <img
        src="/branding/snake-stocks-hero.webp?v=3"
        alt="Snake Stocks — Track, Compare, Discover"
        className="absolute inset-0 block h-full w-full object-cover"
      />
      <div className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-white/[.03]" />
    </div>
  );
}

export function ArborealsByBunnBadge() {
  return (
    <div className="relative overflow-hidden rounded-3xl border border-white/[.07] bg-black/20 p-5">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_70%,rgba(57,230,125,.09),transparent_35%)]" />
      <div className="relative flex items-center gap-4">
        <div className="relative h-20 w-20 shrink-0">
          <div className="absolute inset-0 rounded-full border border-emerald-300/15" />
          <div className="absolute left-3 top-7 h-7 w-14 rounded-full border-[7px] border-emerald-400/65" />
          <Pitcher left="2%" top="30%" scale={.55} /><Pitcher left="76%" top="30%" scale={.55} />
        </div>
        <div><div className="font-serif text-xl font-black tracking-[.04em] text-white/85">ARBOREALS</div><div className="text-xs font-black tracking-[.18em] text-white/55">BY BUNN</div><div className="mt-1 text-[9px] uppercase tracking-[.15em] text-emerald-300/45">Founding breeder brand</div></div>
      </div>
    </div>
  );
}

