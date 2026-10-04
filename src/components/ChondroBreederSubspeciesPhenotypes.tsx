"use client";

import { useEffect, useState } from "react";

type Subspecies =
  | "Morelia azurea azurea"
  | "Morelia azurea pulcher"
  | "Morelia azurea utaraensis"
  | "Morelia viridis";

type Snake = {
  id?: string;
  name?: string;
  subspecies?: Subspecies;
  locality?: string;
  classification?: string;
  phenotypeScore?: number;
  generation?: number;
  parentIds?: string[];
  ancestry?: Partial<Record<Subspecies, number>>;
};

type Clutch = { dam?: Snake; sire?: Snake; offspring?: Snake[] };
type GameSave = {
  colony?: Snake[];
  clutch?: Clutch | null;
  clutchHistory?: Array<Clutch & { holdbackIds?: string[] }>;
  [key: string]: unknown;
};

const LOCAL_SAVE_KEY = "arboreal_chondro_breeder_v2";

const shortName: Record<Subspecies, string> = {
  "Morelia azurea azurea": "M. a. azurea",
  "Morelia azurea pulcher": "M. a. pulcher",
  "Morelia azurea utaraensis": "M. a. utaraensis",
  "Morelia viridis": "M. viridis",
};

const localitySubspecies: Record<string, Subspecies> = {
  Biak: "Morelia azurea azurea",
  Numfor: "Morelia azurea azurea",
  Manokwari: "Morelia azurea pulcher",
  Sorong: "Morelia azurea pulcher",
  Timika: "Morelia azurea pulcher",
  Cyclops: "Morelia azurea utaraensis",
  Jayapura: "Morelia azurea utaraensis",
  Lereh: "Morelia azurea utaraensis",
  Wamena: "Morelia azurea utaraensis",
  Aru: "Morelia viridis",
  Merauke: "Morelia viridis",
};

function parseSave(value: unknown): GameSave | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as GameSave;
}

function hashNumber(value: string) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0);
}

function clamp(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

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

function subspeciesPurity(snake: Snake) {
  if (!snake.subspecies || snake.classification !== "Pure") return 0;
  const ancestry = snake.ancestry?.[snake.subspecies];
  return typeof ancestry === "number" ? ancestry : 100;
}

function qualifies(snake: Snake) {
  return Boolean(snake.subspecies && snake.classification === "Pure" && subspeciesPurity(snake) >= 99.9);
}

function allSnakes(save: GameSave) {
  const found = new Map<string, Snake>();
  const add = (snake?: Snake) => {
    if (!snake) return;
    const key = snake.id || `${snake.name || "snake"}-${found.size}`;
    if (!found.has(key)) found.set(key, snake);
  };
  for (const snake of save.colony ?? []) add(snake);
  if (save.clutch) {
    add(save.clutch.dam);
    add(save.clutch.sire);
    for (const snake of save.clutch.offspring ?? []) add(snake);
  }
  for (const record of save.clutchHistory ?? []) {
    add(record.dam);
    add(record.sire);
    for (const snake of record.offspring ?? []) add(snake);
  }
  return [...found.values()];
}

function migratePhenotypes(save: GameSave) {
  const copy = JSON.parse(JSON.stringify(save)) as GameSave;
  const snakes = allSnakes(copy);
  const byId = new Map(snakes.filter((snake) => snake.id).map((snake) => [snake.id as string, snake]));
  let changed = false;

  for (let pass = 0; pass < 4; pass++) {
    for (const snake of snakes) {
      if (!qualifies(snake) || Number(snake.phenotypeScore ?? 0) > 0) continue;
      const parents = (snake.parentIds ?? []).map((id) => byId.get(id)).filter((parent): parent is Snake => Boolean(parent));
      const sameSubspeciesParents = parents.filter(
        (parent) => parent.subspecies === snake.subspecies && qualifies(parent) && Number(parent.phenotypeScore ?? 0) > 0,
      );

      if (sameSubspeciesParents.length >= 2) {
        const midpoint = sameSubspeciesParents.slice(0, 2).reduce((sum, parent) => sum + Number(parent.phenotypeScore ?? 0), 0) / 2;
        const hash = hashNumber(snake.id || snake.name || "offspring");
        const variation = (hash % 13) - 6;
        const breakthrough = hash % 40 === 0 ? 4 + (hash % 7) : 0;
        snake.phenotypeScore = clamp(midpoint + variation + breakthrough);
        changed = true;
      } else if ((snake.generation ?? 1) <= 1) {
        snake.phenotypeScore = 66 + (hashNumber(snake.id || snake.name || "foundation") % 30);
        changed = true;
      }
    }
  }

  return { save: copy, changed };
}

function replaceLegacyCopy(root: ParentNode) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  while (walker.nextNode()) nodes.push(walker.currentNode as Text);

  for (const node of nodes) {
    let text = node.nodeValue || "";
    const original = text;
    for (const [locality, subspecies] of Object.entries(localitySubspecies)) {
      text = text.replace(
        new RegExp(`(A\\+\\+|A\\+|A-|A|B\\+|B-|B|C\\+|C) ${locality} phenotype`, "g"),
        `$1 ${shortName[subspecies]} phenotype`,
      );
    }
    text = text
      .replace("Pure locality is its own chase.", "Subspecies phenotype is its own chase.")
      .replace(
        "Same-locality pure pairings preserve a named phenotype grade. Mixing localities creates a Pure · Mixed Locality animal with no named-locality grade.",
        "Pure pairings within the same subspecies preserve a subspecies phenotype grade. Locality names remain pedigree information; mixing locality labels within one subspecies stays Pure and is not a hybrid.",
      )
      .replace("locality breeders can choose to work completely by appearance and pedigree", "subspecies breeders can work completely by appearance and pedigree")
      .replace("locality grade", "subspecies phenotype grade")
      .replace("best locality grade", "best subspecies phenotype")
      .replace("A+ pure named-locality phenotype", "A+ pure-subspecies phenotype")
      .replace("100% named-locality line", "100% pure-subspecies line");
    if (text !== original) node.nodeValue = text;
  }
}

function addMissingBadges(save: GameSave) {
  const snakes = allSnakes(save).filter((snake) => qualifies(snake) && Number(snake.phenotypeScore ?? 0) > 0 && snake.subspecies);
  const containers = document.querySelectorAll<HTMLElement>("article, [role='dialog'], button");

  for (const snake of snakes) {
    const id = snake.id || "";
    const candidates = [...containers].filter((node) => {
      const text = node.textContent || "";
      return id ? text.includes(id) : Boolean(snake.name && text.includes(snake.name));
    });
    for (const node of candidates) {
      if (node.querySelector(`[data-subspecies-phenotype="${CSS.escape(id || snake.name || "snake")}"]`)) continue;
      const legacyBadge = [...node.querySelectorAll<HTMLElement>("span")].find((span) => / phenotype$/.test(span.textContent?.trim() || ""));
      if (legacyBadge) continue;
      const badge = document.createElement("span");
      badge.dataset.subspeciesPhenotype = id || snake.name || "snake";
      badge.className = "ml-2 inline-flex rounded-full border border-amber-200/15 bg-amber-200/[.04] px-3 py-1 text-[10px] font-bold text-amber-100/70";
      badge.textContent = `${grade(Number(snake.phenotypeScore))} ${shortName[snake.subspecies as Subspecies]} phenotype`;
      const heading = node.querySelector<HTMLElement>(".font-semibold, .text-xl");
      if (heading?.parentElement) heading.parentElement.appendChild(badge);
    }
  }
}

const traitLabels: Record<string, string> = {
  highBlack: "High Black",
  highWhite: "High White",
  blueStripe: "Blue",
  yellowRetention: "Yellow Retention",
  blotches: "Blotches",
};

const preferredTraitsByTaxon: Record<Subspecies, string[]> = {
  "Morelia azurea azurea": ["highBlack", "yellowRetention"],
  "Morelia azurea pulcher": ["yellowRetention", "blueStripe"],
  "Morelia azurea utaraensis": ["blueStripe", "highWhite"],
  "Morelia viridis": ["highWhite", "highBlack"],
};

const taxonNotes: Record<Subspecies, string> = {
  "Morelia azurea azurea":
    "Island form from Biak and Numfor. Biak neonates hatch red or yellow — locality is never judged from color alone.",
  "Morelia azurea pulcher":
    "Western New Guinea form. Breeders prize clean yellow retention and blue tones in this taxon.",
  "Morelia azurea utaraensis":
    "Northern New Guinea form, including the Jayapura animals the store rotates. Blue striping and high white are the signature traits.",
  "Morelia viridis":
    "Southern form from the Aru Islands and Merauke. High white and high black lines are the classic look.",
};

const traitGuide: Array<{ key: string; label: string; detail: string }> = [
  { key: "highBlack", label: "High Black", detail: "Dark dorsal markings and black scaling. A signature trait of azurea and viridis lines." },
  { key: "highWhite", label: "High White", detail: "White or pale lateral and dorsal markings. Prized in utaraensis and viridis." },
  { key: "blueStripe", label: "Blue", detail: "Blue tones along the dorsum and vertebral stripe. The utaraensis hallmark." },
  { key: "yellowRetention", label: "Yellow Retention", detail: "How much juvenile yellow persists into adulthood. Key for pulcher and azurea projects." },
  { key: "blotches", label: "Blotches", detail: "Bold dorsal blotching pattern. Scored on every animal." },
];

const gradeScale: Array<{ grade: string; detail: string }> = [
  { grade: "A+", detail: "95+ — Elite. Foundation stock for a serious project." },
  { grade: "A", detail: "90–94 — Exceptional." },
  { grade: "A-", detail: "85–89 — Excellent." },
  { grade: "B+", detail: "80–84 — Strong." },
  { grade: "B", detail: "74–79 — Good." },
  { grade: "B-", detail: "68–73 — Fair." },
  { grade: "C+", detail: "62–67 — Modest." },
  { grade: "C", detail: "Below 62 — Pet quality." },
];

export function ChondroBreederSubspeciesPhenotypes() {
  const [save, setSave] = useState<GameSave | null>(null);

  useEffect(() => {
    let cancelled = false;
    let lastSerialized = "";

    async function sync() {
      let current: GameSave | null = null;
      try {
        current = parseSave(JSON.parse(window.localStorage.getItem(LOCAL_SAVE_KEY) || "null"));
      } catch {}

      try {
        const response = await fetch("/api/hatchery/chondro-breeder/save", { cache: "no-store" });
        if (response.ok) {
          const data = await response.json();
          current = parseSave(data.save?.state) ?? current;
        }
      } catch {}

      if (!current || cancelled) return;
      const migrated = migratePhenotypes(current);
      const serialized = JSON.stringify(migrated.save);
      if (serialized !== lastSerialized) {
        lastSerialized = serialized;
        setSave(migrated.save);
      }
      if (!migrated.changed) return;

      try {
        window.localStorage.setItem(LOCAL_SAVE_KEY, serialized);
      } catch {}
      try {
        await fetch("/api/hatchery/chondro-breeder/save", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: serialized,
        });
      } catch {}
    }

    void sync();
    const timer = window.setInterval(() => void sync(), 4000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    const enhance = () => {
      replaceLegacyCopy(document.body);
      if (save) addMissingBadges(save);
    };
    enhance();
    const observer = new MutationObserver(enhance);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [save]);

  const taxa = (Object.keys(shortName) as Subspecies[]).map((taxon) => ({
    taxon,
    short: shortName[taxon],
    localities: Object.entries(localitySubspecies)
      .filter(([, value]) => value === taxon)
      .map(([locality]) => locality)
      .sort(),
    preferred: preferredTraitsByTaxon[taxon],
    note: taxonNotes[taxon],
  }));

  return (
    <div className="mx-auto max-w-5xl px-5 pt-5 sm:px-6">
      <section className="overflow-hidden rounded-[26px] border border-emerald-300/15 bg-[radial-gradient(circle_at_top_left,rgba(52,211,153,.08),transparent_40%),#07110d] p-5 sm:p-6">
        <div className="text-[10px] font-black uppercase tracking-[.16em] text-emerald-100/55">Field Guide</div>
        <h2 className="mt-2 text-2xl font-bold text-white/90">Green Tree Python Complex</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-white/45">
          Taxonomy follows Natusch et al. 2020. The old “Morelia viridis” is now four taxa: three subspecies of{" "}
          <em className="text-white/70">Morelia azurea</em> plus <em className="text-white/70">Morelia viridis</em> in the strict sense.
          Pure means both parents belong to the same subspecies — locality crosses within one subspecies (for example Numfor × Biak)
          still count as pure <em className="text-white/70">Morelia azurea azurea</em>.
        </p>
      </section>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {taxa.map(({ taxon, short, localities, preferred, note }) => (
          <article key={taxon} className="rounded-[24px] border border-white/[.06] bg-white/[.02] p-5">
            <div className="text-[10px] font-black uppercase tracking-[.14em] text-emerald-100/50">{short}</div>
            <h3 className="mt-1 text-lg font-bold italic text-white/90">{taxon}</h3>
            <p className="mt-2 text-xs leading-5 text-white/45">{note}</p>
            <div className="mt-3">
              <div className="text-[9px] font-black uppercase tracking-[.14em] text-white/30">Localities in game</div>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {localities.map((locality) => (
                  <span key={locality} className="rounded-full border border-white/[.08] bg-black/20 px-2.5 py-1 text-[11px] text-white/60">
                    {locality}
                  </span>
                ))}
              </div>
            </div>
            <div className="mt-3">
              <div className="text-[9px] font-black uppercase tracking-[.14em] text-white/30">Prized traits</div>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {preferred.map((trait) => (
                  <span key={trait} className="rounded-full border border-emerald-300/20 bg-emerald-300/[.06] px-2.5 py-1 text-[11px] text-emerald-100/75">
                    {traitLabels[trait] ?? trait}
                  </span>
                ))}
              </div>
            </div>
          </article>
        ))}
      </div>

      <section className="mt-4 rounded-[24px] border border-white/[.06] bg-white/[.02] p-5">
        <h3 className="text-base font-bold text-white/85">Phenotype traits</h3>
        <p className="mt-1 text-xs leading-5 text-white/40">
          Every animal is scored 0–100 on each trait. The phenotype score on a snake card is the average of its trait scores,
          graded on the scale below.
        </p>
        <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
          {traitGuide.map((trait) => (
            <div key={trait.key} className="rounded-2xl border border-white/[.05] bg-black/15 p-3.5">
              <div className="text-sm font-semibold text-white/80">{trait.label}</div>
              <div className="mt-1 text-xs leading-5 text-white/40">{trait.detail}</div>
            </div>
          ))}
        </div>
        <h4 className="mt-5 text-sm font-bold text-white/80">Grade scale</h4>
        <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
          {gradeScale.map((row) => (
            <div key={row.grade} className="flex items-center gap-3 rounded-xl border border-white/[.05] bg-black/15 px-3.5 py-2">
              <span className="w-8 text-sm font-black text-emerald-100/80">{row.grade}</span>
              <span className="text-xs text-white/45">{row.detail}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-4 rounded-[24px] border border-amber-300/15 bg-[radial-gradient(circle_at_top_left,rgba(251,191,36,.07),transparent_40%),#100c06] p-5">
        <h3 className="text-base font-bold text-white/85">Breeding rules of thumb</h3>
        <ul className="mt-2 space-y-2 text-xs leading-5 text-white/45">
          <li className="flex gap-2"><span className="text-amber-200/70">•</span><span>Breed within a subspecies to keep offspring pure. Same-subspecies locality crosses (Jayapura × Lereh, Biak × Numfor) are still pure.</span></li>
          <li className="flex gap-2"><span className="text-amber-200/70">•</span><span>Crossing subspecies produces hybrids — the game tracks classification honestly, and hybrids grade on the same trait scale.</span></li>
          <li className="flex gap-2"><span className="text-amber-200/70">•</span><span>Never judge locality from color. Biak neonates hatch red or yellow, and adult color shifts with mood, temperature, and age.</span></li>
          <li className="flex gap-2"><span className="text-amber-200/70">•</span><span>Pair adults in Excellent condition, and rest females after a clutch — recovery time protects future breeding success.</span></li>
        </ul>
      </section>
    </div>
  );
}
