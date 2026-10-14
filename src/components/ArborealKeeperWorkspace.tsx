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

  // Lock the game view on touch devices: no pinch-zoom, no panning.
  // (Viewport meta handles most browsers; this catches iOS Safari gestures.)
  useEffect(() => {
    const preventPinch = (e: TouchEvent) => {
      if (e.touches.length > 1) e.preventDefault();
    };
    const preventGesture = (e: Event) => e.preventDefault();
    document.addEventListener("touchmove", preventPinch, { passive: false });
    document.addEventListener("gesturestart", preventGesture);
    document.addEventListener("gesturechange", preventGesture);
    return () => {
      document.removeEventListener("touchmove", preventPinch);
      document.removeEventListener("gesturestart", preventGesture);
      document.removeEventListener("gesturechange", preventGesture);
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
