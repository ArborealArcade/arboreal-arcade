"use client";

import { useEffect } from "react";
import { ArborealKeeperEmeraldCloudSync } from "@/components/ArborealKeeperEmeraldCloudSync";
import { ArborealKeeperFacilityBridge } from "@/components/ArborealKeeperFacilityBridge";
import { ChondroBreederWorkspace } from "@/components/ChondroBreederWorkspace";
import { stopHankScaleVoice } from "@/lib/hank-scale-voice";

// Canonical Arboreal Keeper shell. Shared sync/facility bridges wrap the game;
// the shared Keeper hub itself is mounted inside the Home screen below its hero.
export function ArborealKeeperWorkspace() {
  useEffect(() => {
    return () => {
      stopHankScaleVoice();
    };
  }, []);

  return (
    <>
      <ArborealKeeperEmeraldCloudSync />
      <ArborealKeeperFacilityBridge />
      <ChondroBreederWorkspace />
    </>
  );
}
