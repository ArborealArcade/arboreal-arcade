import { ArcadeToasts } from "@/components/arcade/ArcadeToasts";
import { SnakeSorting } from "@/components/SnakeSorting";

export const metadata = {
  title: "The Sorting Ceremony",
  description:
    "You are the Sorting Hat. Probe each serpent's scales, crown and homeland, then call its House — and name its valley.",
};

export default function SnakeSortingPage() {
  return (
    <main className="min-h-dvh bg-[#030805]">
      <SnakeSorting />
          <ArcadeToasts />
    </main>
  );
}
