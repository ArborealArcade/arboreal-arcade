import { ArcadeToasts } from "@/components/arcade/ArcadeToasts";
import { ReptileTrivia } from "@/components/ReptileTrivia";

export const metadata = {
  title: "Reptile Trivia",
  description:
    "A Reptile Trivia mini-game: ten questions per round across six difficulty modes, covering tree pythons, tree boas, monitors, vipers, geckos, snake biology, husbandry, and Arboreal Planet lore.",
};

export default function ReptileTriviaPage() {
  return (
    <main className="min-h-screen bg-[#04120c]">
      <ReptileTrivia />
          <ArcadeToasts />
    </main>
  );
}
