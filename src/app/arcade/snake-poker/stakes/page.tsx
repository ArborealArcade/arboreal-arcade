import { StakesClient } from "@/components/poker/StakesClient";

export const metadata = {
  title: "Hatchling Stakes",
  description: "Wager one of your snakes against the house in a single hand of Den blackjack — winner takes both.",
};

export default function StakesPage() {
  return (
    <main className="min-h-dvh bg-[#04120a]">
      <StakesClient />
    </main>
  );
}
