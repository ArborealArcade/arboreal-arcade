import { ArborealKeeperWorkspace } from "@/components/ArborealKeeperWorkspace";
import { ArborealKeeperSaveRecoveryGate } from "@/components/ArborealKeeperSaveRecoveryGate";

export default function ArborealKeeperPage() {
  return (
    <ArborealKeeperSaveRecoveryGate>
      <ArborealKeeperWorkspace />
    </ArborealKeeperSaveRecoveryGate>
  );
}
