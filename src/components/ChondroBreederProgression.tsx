"use client";

import { useEffect, useMemo, useState } from "react";

type Snake = {
  id?: string;
  generation?: number;
  classification?: string;
  locality?: string;
  subspecies?: string;
  ancestry?: Record<string, number>;
  localityAncestry?: Record<string, number>;
  phenotypeScore?: number;
  geneticsTested?: boolean;
  highBlack?: number;
  highWhite?: number;
  blueStripe?: number;
  yellowRetention?: number;
  blotches?: number;
  neonateColor?: string;
};

type ClutchRecord = {
  offspring?: Snake[];
  dam?: Snake;
  sire?: Snake;
};

type GameSave = {
  colony?: Snake[];
  clutchHistory?: ClutchRecord[];
  sales?: Array<{ value?: number }>;
};

type Achievement = {
  id: string;
  title: string;
  description: string;
  points: number;
  unlocked: boolean;
  icon: string;
};

const LOCAL_SAVE_KEY = "arboreal_chondro_breeder_v2";

function parseSave(value: unknown): GameSave | null {
  if (!value || typeof value !== "object") return null;
  return value as GameSave;
}

function allRecordedSnakes(save: GameSave | null) {
  if (!save) return [] as Snake[];
  const found = new Map<string, Snake>();
  const add = (snake?: Snake) => {
    if (!snake) return;
    const key = snake.id || `anonymous-${found.size}`;
    if (!found.has(key)) found.set(key, snake);
  };
  for (const snake of save.colony ?? []) add(snake);
  for (const record of save.clutchHistory ?? []) {
    add(record.dam);
    add(record.sire);
    for (const snake of record.offspring ?? []) add(snake);
  }
  return [...found.values()];
}

function strongestTrait(snake: Snake) {
  return Math.max(
    snake.highBlack ?? 0,
    snake.highWhite ?? 0,
    snake.blueStripe ?? 0,
    snake.yellowRetention ?? 0,
    snake.blotches ?? 0,
  );
}

function isPlayerProduced(snake: Snake) {
  return (snake.generation ?? 1) > 1;
}

function isPureSubspecies(snake: Snake) {
  if (!snake.subspecies || snake.classification !== "Pure") return false;
  const purity = snake.ancestry?.[snake.subspecies];
  return typeof purity === "number" ? purity >= 99.9 : true;
}

function reputationName(points: number) {
  if (points >= 1400) return "Master Breeder";
  if (points >= 1000) return "Elite Breeder";
  if (points >= 600) return "Proven Breeder";
  if (points >= 300) return "Established Breeder";
  if (points >= 100) return "Emerging Breeder";
  return "New Breeder";
}

function nextReputation(points: number) {
  const tiers = [100, 300, 600, 1000, 1400];
  return tiers.find((tier) => tier > points) ?? null;
}

export function ChondroBreederProgression() {
  const [save, setSave] = useState<GameSave | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      fetch("/api/hatchery/chondro-breeder/save", { cache: "no-store" })
        .then(async (response) => {
          if (!response.ok) throw new Error("cloud save unavailable");
          const data = await response.json();
          return parseSave(data.save?.state);
        })
        .catch(() => {
          try {
            return parseSave(JSON.parse(window.localStorage.getItem(LOCAL_SAVE_KEY) || "null"));
          } catch {
            return null;
          }
        })
        .then((next) => {
          if (!cancelled) setSave(next);
        });
    };
    load();
    const timer = window.setInterval(load, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    const enhance = () => {
      const colonyHeading = [...document.querySelectorAll("h2")].find(
        (node) => node.textContent?.trim() === "Animals and project material",
      );
      const colonySection = colonyHeading?.closest("section");
      if (!colonySection) return;

      for (const article of colonySection.querySelectorAll<HTMLElement>("article.panel")) {
        const children = [...article.children] as HTMLElement[];
        if (children.length < 3) continue;

        let toggle = article.querySelector<HTMLButtonElement>("[data-chondro-animal-toggle]");
        if (!toggle) {
          toggle = document.createElement("button");
          toggle.type = "button";
          toggle.dataset.chondroAnimalToggle = "true";
          toggle.className = "mt-3 w-full rounded-xl border border-white/[.08] bg-white/[.025] px-3 py-2 text-left text-[10px] font-black uppercase tracking-[.12em] text-white/45 transition hover:border-emerald-300/20 hover:text-emerald-100/70";
          toggle.textContent = "Show animal details ▾";
          children[1].insertAdjacentElement("afterend", toggle);
          article.dataset.chondroExpanded = "false";
          toggle.addEventListener("click", () => {
            const expanded = article.dataset.chondroExpanded === "true";
            article.dataset.chondroExpanded = expanded ? "false" : "true";
            toggle!.textContent = expanded ? "Show animal details ▾" : "Hide animal details ▴";
            article.querySelectorAll<HTMLElement>("[data-chondro-animal-detail]").forEach((detail) => {
              detail.hidden = expanded;
            });
          });
        }

        const expanded = article.dataset.chondroExpanded === "true";
        for (const child of [...article.children] as HTMLElement[]) {
          if (child === article.children[0] || child === article.children[1] || child === toggle) continue;
          child.dataset.chondroAnimalDetail = "true";
          child.hidden = !expanded;
        }
      }
    };

    enhance();
    const observer = new MutationObserver(enhance);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  const achievements = useMemo(() => {
    const snakes = allRecordedSnakes(save);
    const produced = snakes.filter(isPlayerProduced);
    const testedProduced = produced.filter((snake) => snake.geneticsTested);
    const clutchCount = save?.clutchHistory?.length ?? 0;
    const bestTested = testedProduced.reduce((best, snake) => Math.max(best, strongestTrait(snake)), 0);
    const bestSale = (save?.sales ?? []).reduce((best, sale) => Math.max(best, sale.value ?? 0), 0);

    return [
      { id: "first-clutch", title: "First Clutch", description: "Complete your first clutch.", points: 100, unlocked: clutchCount >= 1, icon: "🥚" },
      { id: "five-clutches", title: "Program Taking Shape", description: "Complete 5 clutches.", points: 100, unlocked: clutchCount >= 5, icon: "🧬" },
      { id: "ten-clutches", title: "Established Program", description: "Complete 10 clutches.", points: 150, unlocked: clutchCount >= 10, icon: "🏅" },
      { id: "twenty-five-clutches", title: "Production House", description: "Complete 25 clutches.", points: 250, unlocked: clutchCount >= 25, icon: "🏆" },
      { id: "trait-50", title: "Trait Breakthrough", description: "Produce and genetically verify a 50%+ trait animal.", points: 100, unlocked: bestTested >= 50, icon: "⚡" },
      { id: "trait-75", title: "High Expression", description: "Produce and genetically verify a 75%+ trait animal.", points: 150, unlocked: bestTested >= 75, icon: "💎" },
      { id: "trait-90", title: "Extreme Expression", description: "Produce and genetically verify a 90%+ trait animal.", points: 250, unlocked: bestTested >= 90, icon: "👑" },
      { id: "a-plus", title: "A+ Subspecies Animal", description: "Produce an A+ pure-subspecies phenotype.", points: 250, unlocked: produced.some((snake) => isPureSubspecies(snake) && (snake.phenotypeScore ?? 0) >= 95), icon: "🌿" },
      { id: "third-generation", title: "Built a Line", description: "Reach generation 3 with a 100% pure-subspecies line.", points: 250, unlocked: produced.some((snake) => isPureSubspecies(snake) && (snake.generation ?? 1) >= 3), icon: "🌳" },
      { id: "designer", title: "Designer Project", description: "Produce your first hybrid or designer animal.", points: 150, unlocked: produced.some((snake) => snake.classification === "Hybrid" || snake.classification === "Designer"), icon: "🎨" },
      { id: "red-neonate", title: "Seeing Red", description: "Produce a red neonate in your own program.", points: 50, unlocked: produced.some((snake) => snake.neonateColor === "Red"), icon: "🔴" },
      { id: "five-figure-sale", title: "Five-Figure Animal", description: "Record a snake sale worth $10,000 or more.", points: 150, unlocked: bestSale >= 10000, icon: "💰" },
    ] satisfies Achievement[];
  }, [save]);

  const unlocked = achievements.filter((achievement) => achievement.unlocked);
  const reputation = unlocked.reduce((sum, achievement) => sum + achievement.points, 0);
  const next = nextReputation(reputation);

  return (
    <section className="mx-auto mt-6 max-w-7xl px-5 sm:px-6">
      <div className="overflow-hidden rounded-[28px] border border-amber-200/10 bg-amber-200/[.025]">
        <button type="button" onClick={() => setOpen((value) => !value)} className="flex w-full items-center justify-between gap-4 p-5 text-left sm:p-6">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[.16em] text-amber-100/45">Breeder progression</div>
            <div className="mt-2 text-xl font-semibold text-white/80">{reputationName(reputation)}</div>
            <div className="mt-1 text-xs text-white/34">{unlocked.length}/{achievements.length} achievements · {reputation} reputation{next ? ` · ${next - reputation} to next rank` : " · maximum rank"}</div>
          </div>
          <div className="rounded-full border border-white/[.08] px-3 py-2 text-xs font-bold text-white/45">{open ? "Collapse ▴" : "View trophies ▾"}</div>
        </button>

        {open ? (
          <div className="border-t border-white/[.06] p-5 sm:p-6">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {achievements.map((achievement) => (
                <article key={achievement.id} className={`rounded-2xl border p-4 ${achievement.unlocked ? "border-amber-200/18 bg-amber-200/[.035]" : "border-white/[.05] bg-black/10 opacity-55"}`}>
                  <div className="flex items-start gap-3">
                    <div className="text-2xl" aria-hidden="true">{achievement.unlocked ? achievement.icon : "🔒"}</div>
                    <div className="min-w-0">
                      <div className="font-semibold text-white/72">{achievement.title}</div>
                      <div className="mt-1 text-xs leading-5 text-white/34">{achievement.description}</div>
                      <div className={`mt-3 text-[10px] font-black uppercase tracking-[.12em] ${achievement.unlocked ? "text-amber-100/60" : "text-white/25"}`}>{achievement.unlocked ? `Unlocked · +${achievement.points} rep` : `Locked · ${achievement.points} rep`}</div>
                    </div>
                  </div>
                </article>
              ))}
            </div>
            <p className="mt-4 text-xs leading-5 text-white/28">Trait achievements only count player-produced animals after genetic testing, so trophies never reveal a hidden trait percentage before you choose to test it. Phenotype achievements follow subspecies purity; locality labels remain pedigree information and do not turn same-subspecies pairings into hybrids.</p>
          </div>
        ) : null}
      </div>
    </section>
  );
}
