"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ArborealKeeperLoadingScreen } from "@/components/ArborealKeeperLoadingScreen";

// Legacy local key is preserved during migration so existing players keep their saves.
const LOCAL_SAVE_KEY = "arboreal_chondro_breeder_v2";
const MIN_LOADING_SCREEN_MS = 950;

function sanitizeLocalSave(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const state = { ...(value as Record<string, unknown>) };
  const colony = Array.isArray(state.colony) ? state.colony : [];
  state.started = typeof state.started === "boolean" ? state.started : colony.length > 0;
  state.cash = Number.isFinite(Number(state.cash)) ? Number(state.cash) : 30000;
  state.colony = colony;
  state.tested = Array.isArray(state.tested) ? state.tested : [];
  state.damId = typeof state.damId === "string" ? state.damId : "";
  state.sireId = typeof state.sireId === "string" ? state.sireId : "";
  if (!state.clutch || typeof state.clutch !== "object" || Array.isArray(state.clutch) || !Array.isArray((state.clutch as Record<string, unknown>).offspring)) state.clutch = null;
  state.clutchHistory = Array.isArray(state.clutchHistory)
    ? state.clutchHistory.filter((record) => record && typeof record === "object" && !Array.isArray(record) && Array.isArray((record as Record<string, unknown>).offspring))
    : [];
  state.holdbacks = Array.isArray(state.holdbacks) ? state.holdbacks : [];
  state.season = Math.max(1, Number.isFinite(Number(state.season)) ? Math.floor(Number(state.season)) : 1);
  state.sales = Array.isArray(state.sales) ? state.sales : [];
  state.transfers = Array.isArray(state.transfers) ? state.transfers : [];
  const enclosures = state.enclosures && typeof state.enclosures === "object" && !Array.isArray(state.enclosures)
    ? state.enclosures as Record<string, unknown>
    : {};
  state.enclosures = {
    "Chondro Dojo Bin": Math.max(0, Number(enclosures["Chondro Dojo Bin"] ?? 0) || 0),
    "PVC Arboreal": Math.max(0, Number(enclosures["PVC Arboreal"] ?? 0) || 0),
  };
  state.purchasedStoreIds = Array.isArray(state.purchasedStoreIds) ? state.purchasedStoreIds : [];
  return state;
}

export function ChondroSaveRecoveryGate({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState("Loading save file…");

  useEffect(() => {
    let cancelled = false;
    const minimumDisplay = new Promise<void>((resolve) => {
      window.setTimeout(resolve, MIN_LOADING_SCREEN_MS);
    });
    const fallback = window.setTimeout(() => {
      if (!cancelled) setReady(true);
    }, 8000);

    async function repair() {
      try {
        const raw = window.localStorage.getItem(LOCAL_SAVE_KEY);
        if (raw) {
          const cleaned = sanitizeLocalSave(JSON.parse(raw));
          if (cleaned) window.localStorage.setItem(LOCAL_SAVE_KEY, JSON.stringify(cleaned));
        }
      } catch {
        // If local storage is unreadable, continue and let the cloud save restore the game.
      }

      try {
        const response = await fetch("/api/hatchery/arboreal-keeper/repair-save", { method: "POST", cache: "no-store" });
        if (response.ok) setMessage("Preparing your facility…");
      } catch {
        // Continue into the game even if cloud repair is temporarily unavailable.
      } finally {
        await minimumDisplay;
        window.clearTimeout(fallback);
        if (!cancelled) setReady(true);
      }
    }

    void repair();
    return () => {
      cancelled = true;
      window.clearTimeout(fallback);
    };
  }, []);

  if (!ready) {
    return <ArborealKeeperLoadingScreen message={message} />;
  }

  return <>{children}</>;
}
