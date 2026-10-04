import { BlackjackTable } from "@/components/poker/BlackjackTable";

export const metadata = {
  title: "Canopy Blackjack",
  description: "Four-deck blackjack against the house. Dealer stands on all 17s, blackjack pays 3:2.",
};

export default function BlackjackPage() {
  return (
    <main className="min-h-dvh bg-[#04120a]">
      <BlackjackTable />
    </main>
  );
}
