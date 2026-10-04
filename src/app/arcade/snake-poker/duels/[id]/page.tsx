import { DuelClient } from "@/components/poker/DuelClient";

export const metadata = {
  title: "Snake Duel Challenge",
  description: "You've been challenged to a keeper-vs-keeper Texas Hold'em duel. Stake a snake — winner takes both.",
};

export default async function DuelChallengePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <main className="min-h-dvh bg-[#04120a]">
      <DuelClient duelId={id} />
    </main>
  );
}
