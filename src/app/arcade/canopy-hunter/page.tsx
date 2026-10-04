import { redirect } from "next/navigation";

export const metadata = {
  title: "Canopy Hunter",
  description:
    "Canopy Hunter is now a special in-game event inside Arboreal Keeper.",
};

/**
 * The standalone expedition retired: Canopy Hunter now lives inside Arboreal
 * Keeper as a special event (free weekly expedition, extra trips for cash).
 * This route keeps old links working by sending players to the game.
 */
export default function CanopyHunterRetiredPage() {
  redirect("/arcade/arboreal-keeper");
}
