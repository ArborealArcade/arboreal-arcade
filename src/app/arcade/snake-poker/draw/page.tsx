import { DrawPoker } from "@/components/poker/DrawPoker";

export const metadata = {
  title: "Serpent Draw",
  description: "Jacks-or-Better video poker on the 9/6 paytable, with double-or-nothing.",
};

export default function DrawPage() {
  return (
    <main className="min-h-dvh bg-[#04120a]">
      <DrawPoker />
    </main>
  );
}
