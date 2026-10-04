// Claims unclaimed player-market proceeds for the Arboreal Keeper home screen.
// Kept in its own module so the home-status component only needs short edits.
// Positional args: claiming, pendingSaleCount, pendingProceeds, money,
// setClaiming, setClaimMessage, setMarket, onOpenMarket.
import { playHankScaleLine } from "./hank-scale-voice";
type MarketCounts = {
  pendingProceeds?: number;
  pendingSaleCount?: number;
};

export async function claimMarketProceeds(
  claiming: boolean,
  pendingSaleCount: number,
  pendingProceeds: number,
  money: (value: number) => string,
  setClaiming: (value: boolean) => void,
  setClaimMessage: (value: string) => void,
  setMarket: (update: (previous: MarketCounts) => { pendingProceeds: number; pendingSaleCount: number }) => void,
  onOpenMarket: () => void,
): Promise<void> {
  if (claiming) return;
  if (Number(pendingSaleCount ?? 0) <= 0) {
    onOpenMarket();
    return;
  }
  setClaiming(true);
  setClaimMessage("");
  try {
    const response = await fetch("/api/hatchery/chondro-breeder/player-market", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "claim-proceeds" }),
      cache: "no-store",
    });
    if (!response.ok) throw new Error("claim failed");
    const claimed = money(Number(pendingProceeds ?? 0));
    setMarket((previous) => ({ ...previous, pendingProceeds: 0, pendingSaleCount: 0 }));
    setClaimMessage(`Claimed ${claimed} — added to your game cash.`);
    playHankScaleLine(24);
    window.dispatchEvent(new Event("arboreal-chondro-breeder-save-change"));
  } catch {
    setClaimMessage("Could not claim sales right now — try again.");
  } finally {
    setClaiming(false);
  }
}
