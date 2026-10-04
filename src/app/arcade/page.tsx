import Image from "next/image";
import GameCard from "./GameCard";
import { ArcadeHub, TokenChip } from "@/components/arcade/ArcadeHub";
import { ArcadeToasts } from "@/components/arcade/ArcadeToasts";
import { DailyTrivia } from "@/components/arcade/DailyTrivia";
import { DailyBlackjack } from "@/components/arcade/DailyBlackjack";
import { RedeemCodeCard } from "@/components/arcade/RedeemCodeCard";


const keeperSteps = [
  { title: "1 · BUILD", text: "Start with limited facility capacity, compatible enclosures and an operating budget." },
  { title: "2 · KEEP", text: "House animals individually by default while sharing compatible enclosure models across species." },
  { title: "3 · BREED", text: "Run egg-laying or live-bearing breeding programs according to the biology of each species." },
  { title: "4 · EXPAND", text: "Raise offspring, keep holdbacks, build lines, expand rooms and unlock rarer species and equipment." },
];

const achievements = ["First Offspring", "First Clutch", "First Litter", "Three Generations", "Lineage Keeper", "Facility Builder"];

const sorterSteps = [
  { title: "1 · MEET", text: "Ten wild specimens step up to the sorting chamber, each hiding clues in its scales, crown and origin." },
  { title: "2 · PROBE", text: "Probe each serpent's scales, crown and homeland — but every probe shrinks your swift-call bonus." },
  { title: "3 · SORT", text: "Call its House: Azurea, Pulcher, Utaraensis or Viridis. Call early and blind for up to +75." },
  { title: "4 · NAME", text: "Name the serpent's home valley for a +50 homeland bonus, then earn your rank up to Chondro Master." },
];

const triviaSteps = [
  { title: "1 · PLAY", text: "Ten questions per round drawn from green tree pythons, snake biology, husbandry and Arboreal Planet lore." },
  { title: "2 · BEAT THE CLOCK", text: "Fifteen seconds per question — faster correct answers score more, and streaks multiply your points." },
  { title: "3 · LIFELINE", text: "One 50/50 lifeline per round knocks out two wrong answers when a question has you cornered." },
  { title: "4 · RANK UP", text: "Climb from Hatchling to Chondro Master and chase your persisted best score." },
];

const pokerSteps = [
  { title: "1 · BUY IN", text: "Take a seat at the den with lifesap — the house currency for card games, persisted on your account." },
  { title: "2 · THREE TABLES", text: "Coil Hold'em against five AI snake pros, Canopy Blackjack, and Serpent Draw video poker." },
  { title: "3 · HATCHLING STAKES", text: "Wager one of your snakes against the house in Den blackjack — or challenge another keeper to a Snake Duel. Winner takes both snakes." },
  { title: "4 · WEEKLY TOKENS", text: "Stakes tokens refresh weekly, so every keeper gets a regular shot at the table." },
];

export default function ArcadePage() {
  return (
    <main className="bg-black">
      {/* Page header: Arboreal Arcade logo on black */}
      <section className="border-b border-white/[.06] bg-black">
        <div className="mx-auto max-w-2xl px-5 py-5 sm:py-8">
          <Image
            src="/branding/arboreal-arcade-logo.webp"
            alt="Arboreal Arcade"
            width={1536}
            height={1024}
            priority
            sizes="(max-width: 672px) 100vw, 672px"
            className="block h-auto w-full"
          />
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 pb-4 pt-6 sm:px-6">
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-full border border-amber-200/15 bg-amber-200/[.05] px-4 py-2 text-[10px] font-bold uppercase tracking-[.16em] text-amber-100/65">Virtual animals only</div>
          <TokenChip />
        </div>
        <h1 className="mt-3 max-w-3xl text-3xl font-semibold tracking-[-.03em] text-white sm:text-4xl">Keeper games built around long-term progression.</h1>
        <p className="mt-3 max-w-2xl text-sm leading-7 text-white/55">Arboreal Planet&apos;s Arcade is home to Arboreal Keeper — a Green Tree Python breeding and keeper game built around animals, locality projects, lineages, enclosures, offspring and long-term progression. Every arcade game pays out <span className="font-bold text-amber-100">🪙 arcade tokens</span>, spendable in the Keeper on expedition permits, extra trips and cash.</p>
      </section>

      {/* One compact card per game — details collapse underneath */}
      <section className="mx-auto max-w-7xl px-5 py-8 sm:px-6">
        <div className="section-kicker">Games</div>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <GameCard
            href="/arcade/arboreal-keeper"
            imageSrc="/hatchery/game/arboreal-keeper-ad-hero.webp"
            imageAlt="Bunn holding a red green tree python neonate — Arboreal Keeper"
            kicker="Featured game"
            title="Arboreal Keeper"
            description="Build a Green Tree Python program around breeding, locality projects, housing, offspring, market decisions and records — start small and grow your keeper program over time."
            steps={keeperSteps}
          />
          <GameCard
            href="/arcade/snake-sorting"
            imageSrc="/arcade/snake-sorting/snake-sorter-logo.webp"
            imageAlt="Snake Sorter — The Sorting Ceremony"
            kicker="New game"
            title="Snake Sorter"
            description="The Sorting Ceremony: you are the Sorting Hat. Probe each serpent's scales, crown and homeland, call its House among the four chondro taxa — and name its valley for a bonus. Or sort serpent photos straight into house piles."
            steps={sorterSteps}
          />
          <GameCard
            href="/arcade/reptile-trivia"
            imageSrc="/arcade/reptile-trivia/reptile-trivia-logo.webp"
            imageAlt="Reptile Trivia — green tree python coiled around a golden question mark"
            kicker="New game"
            title="Reptile Trivia"
            description="Ten-question rounds on green tree pythons, snake biology, husbandry and Arboreal Planet lore. Beat the clock, ride your streak, and climb from Hatchling to Chondro Master."
            steps={triviaSteps}
          />
          <GameCard
            href="/arcade/snake-poker"
            imageSrc="/arcade/snake-poker/snake-poker-card.jpg"
            imageAlt="Red green tree python coiled on a mossy branch — Snake Poker"
            kicker="New game"
            title="Snake Poker"
            description="The Snake-Poker Den: six-seat Texas Hold'em against five AI snake pros, Canopy Blackjack and Serpent Draw video poker — plus Hatchling Stakes, where keepers wager snakes against the house or duel each other."
            steps={pokerSteps}
          />
        </div>
      </section>

      {/* Daily challenges — seeded, identical for every keeper */}
      <section className="mx-auto max-w-7xl px-5 py-8 sm:px-6">
        <div className="section-kicker">Daily challenges</div>
        <h2 className="mt-3 text-2xl font-semibold text-white">Fresh every day, same for everyone.</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-white/50">One seeded trivia round and one seeded blackjack shoe per day. Finishing them counts toward your daily quests.</p>
        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <DailyTrivia />
          <DailyBlackjack />
        </div>
      </section>

      {/* Arcade meta-system: wallet, quests, leaderboards, trophies */}
      <section className="mx-auto max-w-7xl px-5 py-8 sm:px-6">
        <div className="section-kicker">Arcade meta</div>
        <h2 className="mt-3 text-2xl font-semibold text-white">Your arcade, your progress.</h2>
        <div className="mt-5">
          <ArcadeHub />
        </div>
      </section>

      {/* Event codes — owner-run events hand out codes for keeper rewards */}
      <section className="mx-auto max-w-7xl px-5 py-8 sm:px-6">
        <div className="section-kicker">Event codes</div>
        <h2 className="mt-3 text-2xl font-semibold text-white">Special drops for special days.</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-white/50">When an event is running, codes go out to the community — each keeper can claim one once.</p>
        <div className="mt-5 max-w-2xl">
          <RedeemCodeCard />
        </div>
      </section>

      <section className="border-t border-white/[.06] bg-black/[.12]">
        <div className="mx-auto max-w-7xl px-5 py-14 sm:px-6">
          <div className="section-kicker">Keeper achievements</div>
          <h2 className="mt-3 text-2xl font-semibold">Achievements track long-term progress.</h2>
          <div className="mt-5 flex flex-wrap gap-2">{achievements.map((item) => <span key={item} className="rounded-full border border-amber-200/10 bg-amber-200/[.025] px-3 py-2 text-[11px] font-semibold text-amber-100/45">{item}</span>)}</div>
          <p className="mt-5 text-xs leading-5 text-white/28">Game rarity, virtual prices and progression are game systems only and do not represent real biological rarity or market value.</p>
        </div>
      </section>
      <ArcadeToasts />
    </main>
  );
}
