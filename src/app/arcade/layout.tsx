import type { Metadata } from "next";
import { ArcadeWalletSync } from "@/components/arcade/ArcadeWalletSync";

export const metadata: Metadata = {
  title: "Reptile Games & Arboreal Keeper Arcade",
  description: "Play Arboreal Keeper, Reptile Trivia, Snake Sorter and other reptile-themed games in the Arboreal Planet Arcade.",
  openGraph: { title: "Reptile Games & Arboreal Keeper Arcade | Arboreal Planet", description: "Play Arboreal Keeper, Reptile Trivia, Snake Sorter and other reptile-themed games in the Arboreal Planet Arcade." },
  twitter: { title: "Reptile Games & Arboreal Keeper Arcade | Arboreal Planet", description: "Play Arboreal Keeper, Reptile Trivia, Snake Sorter and other reptile-themed games in the Arboreal Planet Arcade." },
};

export default function SectionLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ArcadeWalletSync />
      {children}
    </>
  );
}
