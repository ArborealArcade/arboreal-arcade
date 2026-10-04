"use client";

import { useEffect } from "react";
import { ensureWalletSync, resyncArcadeWallet } from "@/lib/arcade";

/**
 * Keeps the arcade token wallet synced to the signed-in account: handshake
 * on mount, reconcile whenever the tab regains focus so a balance changed
 * on another device shows up here. Renders nothing.
 */
export function ArcadeWalletSync() {
  useEffect(() => {
    void ensureWalletSync();
    const onFocus = () => resyncArcadeWallet();
    const onVisibility = () => {
      if (document.visibilityState === "visible") resyncArcadeWallet();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);
  return null;
}
