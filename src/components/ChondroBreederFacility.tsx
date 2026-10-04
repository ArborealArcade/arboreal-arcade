"use client";

import { useEffect, useMemo, useState } from "react";
import { ChondroSnakeIcon } from "@/components/ChondroSnakeIcon";

type Space = { user_id: string; space_name: string; tagline: string; theme: string; layout: string; program_focus: string };
type Snake = {
  id?: string; name?: string; sex?: string; lifeStage?: string; classification?: string; locality?: string; subspecies?: string;
  highBlack?: number; highWhite?: number; blueStripe?: number; yellowRetention?: number; blotches?: number; geneticsTested?: boolean;
  phenotypeScore?: number; generation?: number;
};
type Showcase = { snake_id: string; snake: Snake };
type Facility = {
  userId: string;
  initials: string;
  profile: { username?: string | null; display_name?: string | null; avatar_url?: string | null } | null;
  space: Space | null;
  animals: Showcase[];
};
type Payload = { authenticated: boolean; userId: string; own: Facility; friends: Facility[] };

const themes: Record<string, { label: string; shell: string; accent: string }> = {
  canopy: { label: "Canopy", shell: "border-emerald-300/15 bg-emerald-300/[.035]", accent: "text-emerald-100/70" },
  moss: { label: "Moss", shell: "border-lime-300/15 bg-lime-300/[.025]", accent: "text-lime-100/70" },
  mist: { label: "Mist", shell: "border-slate-200/15 bg-slate-200/[.025]", accent: "text-slate-100/70" },
  ember: { label: "Ember", shell: "border-orange-300/15 bg-orange-300/[.025]", accent: "text-orange-100/70" },
  ocean: { label: "Ocean", shell: "border-sky-300/15 bg-sky-300/[.025]", accent: "text-sky-100/70" },
  night: { label: "Night", shell: "border-violet-300/15 bg-violet-300/[.025]", accent: "text-violet-100/70" },
};

function grade(score = 0) {
  if (score >= 95) return "A+";
  if (score >= 90) return "A";
  if (score >= 85) return "A-";
  if (score >= 80) return "B+";
  if (score >= 74) return "B";
  if (score >= 68) return "B-";
  if (score >= 62) return "C+";
  return "C";
}

function stats(animals: Showcase[]) {
  const snakes = animals.map((item) => item.snake);
  const graded = snakes.filter((s) => Number(s.phenotypeScore ?? 0) > 0 && s.locality && s.locality !== "Mixed Locality" && s.locality !== "Designer");
  const bestPhenotype = graded.length ? graded.reduce((best, s) => Number(s.phenotypeScore) > Number(best.phenotypeScore) ? s : best) : null;
  const tested = snakes.filter((s) => s.geneticsTested);
  let strongest = 0;
  for (const s of tested) strongest = Math.max(strongest, Number(s.highBlack ?? 0), Number(s.highWhite ?? 0), Number(s.blueStripe ?? 0), Number(s.yellowRetention ?? 0), Number(s.blotches ?? 0));
  const maxGeneration = snakes.length ? Math.max(...snakes.map((s) => Number(s.generation ?? 1))) : 0;
  return { count: snakes.length, bestPhenotype, strongest, maxGeneration };
}

function AnimalCard({ snake }: { snake: Snake }) {
  const traits = {
    highBlack: Number(snake.highBlack ?? 0), highWhite: Number(snake.highWhite ?? 0), blueStripe: Number(snake.blueStripe ?? 0),
    yellowRetention: Number(snake.yellowRetention ?? 0), blotches: Number(snake.blotches ?? 0),
  };
  return (
    <article className="rounded-3xl border border-white/[.06] bg-black/10 p-4">
      {snake.subspecies ? <ChondroSnakeIcon subspecies={snake.subspecies as "Morelia azurea azurea" | "Morelia azurea pulcher" | "Morelia azurea utaraensis" | "Morelia viridis"} name={snake.name || "Snake"} traits={traits} compact /> : null}
      <div className="mt-3 font-semibold text-white/75">{snake.name || "Unnamed snake"}</div>
      <div className="mt-1 text-[10px] text-white/30">{snake.sex} · {snake.lifeStage} · {snake.locality} · Gen {snake.generation ?? 1}</div>
      <div className="mt-3 text-[10px] text-white/35">{snake.geneticsTested ? `HB ${traits.highBlack}% · HW ${traits.highWhite}% · Blue ${traits.blueStripe}% · Yellow ${traits.yellowRetention}%` : "Genetics untested · percentages hidden"}</div>
    </article>
  );
}

function FacilityView({ facility }: { facility: Facility }) {
  const space = facility.space;
  const theme = themes[space?.theme ?? "canopy"] ?? themes.canopy;
  const summary = stats(facility.animals);
  const layout = space?.layout ?? "gallery";
  const grid = layout === "compact" ? "grid gap-3 sm:grid-cols-2 xl:grid-cols-4" : layout === "spotlight" ? "grid gap-4 lg:grid-cols-2" : "grid gap-4 md:grid-cols-2 xl:grid-cols-3";
  return (
    <div className={`rounded-[30px] border p-6 ${theme.shell}`}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className={`text-[10px] font-black uppercase tracking-[.16em] ${theme.accent}`}>{facility.initials} breeder space</div>
          <h3 className="mt-2 text-3xl font-semibold">{space?.space_name ?? `${facility.initials} Chondro Room`}</h3>
          <p className="mt-2 max-w-2xl text-sm text-white/40">{space?.tagline || "A growing chondro breeding program."}</p>
          <div className="mt-2 text-[10px] uppercase tracking-[.12em] text-white/25">Focus: {space?.program_focus ?? "mixed"} · Theme: {theme.label} · Layout: {layout}</div>
        </div>
        <div className="rounded-2xl border border-white/[.07] bg-black/10 px-4 py-3 text-right">
          <div className="text-[9px] uppercase text-white/25">Showcase</div><div className="mt-1 text-xl font-semibold text-white/70">{summary.count} animals</div>
        </div>
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-white/[.06] p-4"><div className="text-[9px] uppercase text-white/25">Best phenotype</div><div className="mt-2 font-semibold text-amber-100/70">{summary.bestPhenotype ? `${grade(Number(summary.bestPhenotype.phenotypeScore))} ${summary.bestPhenotype.locality}` : "Not yet"}</div></div>
        <div className="rounded-2xl border border-white/[.06] p-4"><div className="text-[9px] uppercase text-white/25">Strongest tested trait</div><div className="mt-2 font-semibold text-sky-100/70">{summary.strongest ? `${summary.strongest}%` : "No tested showcase"}</div></div>
        <div className="rounded-2xl border border-white/[.06] p-4"><div className="text-[9px] uppercase text-white/25">Highest generation</div><div className="mt-2 font-semibold text-emerald-100/70">{summary.maxGeneration ? `Gen ${summary.maxGeneration}` : "Foundation"}</div></div>
      </div>
      <div className={`mt-5 ${grid}`}>{facility.animals.map((item) => <AnimalCard key={item.snake_id} snake={item.snake} />)}{!facility.animals.length ? <div className="rounded-2xl border border-dashed border-white/[.08] p-6 text-sm text-white/30">No animals have been placed in this showcase yet.</div> : null}</div>
    </div>
  );
}

export function ChondroBreederFacility() {
  const [data, setData] = useState<Payload | null>(null);
  const [status, setStatus] = useState("");
  const [editing, setEditing] = useState(false);
  const [openFriend, setOpenFriend] = useState<string | null>(null);
  const [form, setForm] = useState({ spaceName: "My Chondro Room", tagline: "", theme: "canopy", layout: "gallery", programFocus: "mixed" });

  async function load() {
    const response = await fetch("/api/hatchery/chondro-breeder/facility", { cache: "no-store" });
    const payload = await response.json() as Payload;
    if (!response.ok) { setStatus("Sign in to customize and visit breeder spaces."); return; }
    setData(payload);
    const space = payload.own.space;
    if (space) setForm({ spaceName: space.space_name, tagline: space.tagline, theme: space.theme, layout: space.layout, programFocus: space.program_focus });
  }

  useEffect(() => { void load(); }, []);

  async function save() {
    setStatus("Saving breeder space…");
    const response = await fetch("/api/hatchery/chondro-breeder/facility", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    const result = await response.json();
    if (!response.ok) { setStatus(result.error ?? "Your breeder space could not be saved."); return; }
    setStatus("Breeder space saved.");
    setEditing(false);
    await load();
  }

  const ownStats = useMemo(() => data ? stats(data.own.animals) : null, [data]);
  if (!data) return <section className="mx-auto max-w-7xl px-5 pb-10 sm:px-6"><div className="panel rounded-[28px] p-6 text-sm text-white/35">{status || "Loading breeder spaces…"}</div></section>;

  return (
    <section className="mx-auto max-w-7xl px-5 pb-16 sm:px-6">
      <details className="group mt-5" open>
        <summary className="panel flex cursor-pointer list-none items-center justify-between gap-4 rounded-2xl px-5 py-4 [&::-webkit-details-marker]:hidden">
          <div><div className="text-sm font-bold text-white/75">Your breeder facility</div><div className="mt-1 text-[10px] text-white/30">Customize your room · visit friend facilities · display achievements</div></div>
          <span className="grid h-8 w-8 place-items-center rounded-full border border-white/[.08] text-lg text-white/45 transition group-open:rotate-45">+</span>
        </summary>
        <div className="mt-3 space-y-5">
          <FacilityView facility={data.own} />
          <div className="panel rounded-[28px] p-6">
            <div className="flex flex-wrap items-center justify-between gap-3"><div><div className="section-kicker">Space customization</div><h3 className="mt-2 text-2xl font-semibold">Make the facility yours.</h3><p className="mt-2 text-sm text-white/35">Your showcased animals stay separate from private notes and records.</p></div><button onClick={() => setEditing((v) => !v)} className="rounded-xl border border-white/[.08] px-4 py-2 text-xs font-bold text-white/55">{editing ? "Close editor" : "Customize space"}</button></div>
            {editing ? <div className="mt-5 grid gap-4 md:grid-cols-2">
              <label className="text-xs text-white/40">Facility name<input value={form.spaceName} onChange={(e) => setForm({ ...form, spaceName: e.target.value.slice(0, 60) })} className="mt-2 h-11 w-full rounded-xl border border-white/[.08] bg-black/25 px-3 text-sm text-white/75" /></label>
              <label className="text-xs text-white/40">Tagline<input value={form.tagline} onChange={(e) => setForm({ ...form, tagline: e.target.value.slice(0, 140) })} className="mt-2 h-11 w-full rounded-xl border border-white/[.08] bg-black/25 px-3 text-sm text-white/75" /></label>
              <label className="text-xs text-white/40">Theme<select value={form.theme} onChange={(e) => setForm({ ...form, theme: e.target.value })} className="mt-2 h-11 w-full rounded-xl border border-white/[.08] bg-black/30 px-3 text-sm">{Object.entries(themes).map(([value, theme]) => <option key={value} value={value}>{theme.label}</option>)}</select></label>
              <label className="text-xs text-white/40">Animal layout<select value={form.layout} onChange={(e) => setForm({ ...form, layout: e.target.value })} className="mt-2 h-11 w-full rounded-xl border border-white/[.08] bg-black/30 px-3 text-sm"><option value="gallery">Gallery</option><option value="spotlight">Spotlight</option><option value="compact">Compact</option></select></label>
              <label className="text-xs text-white/40">Program focus<select value={form.programFocus} onChange={(e) => setForm({ ...form, programFocus: e.target.value })} className="mt-2 h-11 w-full rounded-xl border border-white/[.08] bg-black/30 px-3 text-sm"><option value="locality">Pure locality</option><option value="traits">Trait development</option><option value="mixed">Mixed program</option><option value="designer">Designer / hybrid</option></select></label>
              <div className="flex items-end"><button onClick={() => void save()} className="h-11 rounded-xl bg-amber-200 px-5 text-xs font-black text-[#17130a]">Save customization</button></div>
            </div> : null}
            {status ? <div role="status" className="mt-4 text-xs text-amber-100/65">{status}</div> : null}
            {ownStats ? <div className="mt-4 text-[10px] text-white/25">Your space currently displays {ownStats.count} showcase animal{ownStats.count === 1 ? "" : "s"}.</div> : null}
          </div>
          <div className="panel rounded-[28px] p-6">
            <div className="section-kicker">Visit friends</div><h3 className="mt-2 text-2xl font-semibold">Walk through another breeder&apos;s program.</h3><p className="mt-2 text-sm text-white/35">Only accepted breeder friends appear here.</p>
            <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{data.friends.map((friend) => <div key={friend.userId} className="rounded-2xl border border-white/[.06] p-4"><div className="font-semibold text-white/70">{friend.space?.space_name ?? `${friend.initials} Chondro Room`}</div><div className="mt-1 text-[10px] text-white/30">{friend.profile?.display_name ?? `Breeder ${friend.initials}`} · {friend.initials} · {friend.animals.length} showcased</div><button onClick={() => setOpenFriend(openFriend === friend.userId ? null : friend.userId)} className="mt-3 rounded-xl border border-emerald-300/15 bg-emerald-300/[.04] px-3 py-2 text-xs font-bold text-emerald-100/65">{openFriend === friend.userId ? "Leave facility" : "Visit facility"}</button></div>)}{!data.friends.length ? <div className="rounded-2xl border border-dashed border-white/[.08] p-5 text-sm text-white/30 md:col-span-2 xl:col-span-3">Add and accept breeder friends to visit their customized spaces.</div> : null}</div>
          </div>
          {openFriend ? (() => { const friend = data.friends.find((f) => f.userId === openFriend); return friend ? <FacilityView facility={friend} /> : null; })() : null}
        </div>
      </details>
    </section>
  );
}
