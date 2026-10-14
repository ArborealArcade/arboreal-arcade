import type { Viewport } from "next";
import { ArborealKeeperWorkspace } from "@/components/ArborealKeeperWorkspace";
import { ArborealKeeperSaveRecoveryGate } from "@/components/ArborealKeeperSaveRecoveryGate";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function ArborealKeeperPage() {
  return (
    <div style={{ touchAction: "pan-y", overscrollBehaviorY: "contain" }}>
      <ArborealKeeperSaveRecoveryGate>
        <ArborealKeeperWorkspace />
      </ArborealKeeperSaveRecoveryGate>
    </div>
  );
}
