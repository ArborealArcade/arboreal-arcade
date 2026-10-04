import { CoilTable } from "@/components/poker/CoilTable";

export const metadata = {
  title: "Coil — Serpent Hold'em",
  description: "Six-seat Texas Hold'em against five AI snake pros.",
};

export default function CoilPage() {
  return (
    <main className="min-h-dvh bg-[#04120a]">
      <CoilTable />
    </main>
  );
}
