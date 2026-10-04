"use client";

import type { ReactNode } from "react";
import { ChondroTraitFocusPanel } from "@/components/ChondroTraitFocusPanel";
import { ChondroCollectionManager } from "@/components/ChondroCollectionManager";
import { ChondroAchievementsPanel } from "@/components/ChondroAchievementsPanel";
import { ChondroCareerSystemsPanel } from "@/components/ChondroCareerSystemsPanel";
import { ChondroBreederLines } from "@/components/ChondroBreederLines";
import { ChondroBreederSocial } from "@/components/ChondroBreederSocial";
import { ChondroProjectTagsPanel } from "@/components/ChondroProjectTagsPanel";
import { ChondroSeasonSummaryPanel } from "@/components/ChondroSeasonSummaryPanel";
import { ChondroShowsPanel } from "@/components/ChondroShowsPanel";
import { ChondroRoomExpansionPanel } from "@/components/ChondroRoomExpansionPanel";

export type BreederManagementSection = "colony" | "career" | "projects" | "community";

const meta: Record<BreederManagementSection, { eyebrow: string; title: string; detail: string }> = {
  colony: { eyebrow: "Colony", title: "Animals", detail: "Search, inspect and manage your active breeding animals without mixing in clutch, market or career systems." },
  career: { eyebrow: "Career", title: "Facility & progression", detail: "Rooms, show circuit, contracts, season results and achievements." },
  projects: { eyebrow: "Projects", title: "Breeding projects", detail: "Project tags, breeder lines and phenotype goals in one focused workspace." },
  community: { eyebrow: "Breeder network", title: "Community", detail: "Social features for the Arboreal Keeper player network." },
};

export function ChondroBreederManagementView({ section }: { section: BreederManagementSection }) {
  const active = meta[section];
  return (
    <section className="mx-auto max-w-7xl px-5 pt-5 sm:px-6">
      <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="section-kicker">{active.eyebrow}</div>
          <h2 className="mt-2 text-2xl font-semibold tracking-[-.03em] text-white sm:text-3xl">{active.title}</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-white/48">{active.detail}</p>
        </div>
      </div>

      {section === "colony" ? <ChondroCollectionManager /> : null}

      {section === "career" ? (
        <div className="grid gap-4 xl:grid-cols-2">
          <div className="space-y-4">
            <FocusCard title="Rooms & Facility Expansion" defaultOpen><ChondroRoomExpansionPanel /></FocusCard>
            <ChondroSeasonSummaryPanel />
          </div>
          <div className="space-y-4">
            <FocusCard title="Show Circuit" defaultOpen><ChondroShowsPanel /></FocusCard>
            <ChondroCareerSystemsPanel />
            <FocusCard title="Achievements & Titles"><ChondroAchievementsPanel /></FocusCard>
          </div>
        </div>
      ) : null}

      {section === "projects" ? (
        <div className="grid gap-4 xl:grid-cols-2">
          <div className="space-y-4">
            <FocusCard title="Animal Project Tags" defaultOpen><ChondroProjectTagsPanel /></FocusCard>
            <FocusCard title="Trait Focus"><ChondroTraitFocusPanel /></FocusCard>
          </div>
          <FocusCard title="Breeder Lines" defaultOpen><ChondroBreederLines /></FocusCard>
        </div>
      ) : null}

      {section === "community" ? <ChondroBreederSocial /> : null}
    </section>
  );
}

/** Compatibility wrapper for older imports. */
export function ChondroBreederCommandCenter() {
  return <ChondroBreederManagementView section="colony" />;
}

function FocusCard({ title, children, defaultOpen = false }: { title: string; children: ReactNode; defaultOpen?: boolean }) {
  return (
    <details open={defaultOpen} className="panel overflow-hidden rounded-3xl">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 text-sm font-bold text-white/72 [&::-webkit-details-marker]:hidden">
        <span>{title}</span>
        <span className="grid h-7 w-7 place-items-center rounded-full border border-white/[.08] text-sm text-white/38">+</span>
      </summary>
      <div className="border-t border-white/[.05] p-3 sm:p-4">{children}</div>
    </details>
  );
}
