import { DuelClient } from "@/components/poker/DuelClient";

export const metadata = {
  title: "Snake Duels",
  description: "Keeper-vs-keeper Texas Hold'em. Stake a snake, send a challenge link — winner takes both.",
};

export default function DuelsPage() {
  return (
    <main className="min-h-dvh bg-[#04120a]">
      <DuelClient />
    </main>
  );
}
