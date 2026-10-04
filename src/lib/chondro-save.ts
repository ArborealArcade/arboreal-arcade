/**
 * Shared loader for the Arboreal Keeper (chondro breeder) game save.
 *
 * Signed-in players get their cloud save when one exists. Everyone else —
 * including guests who bought animals in the store — falls back to the local
 * save in localStorage. Previously each game screen fetched the cloud save API
 * directly, which returns 401 for guests, so signed-out players saw $0 cash,
 * an empty colony, and empty breeding selectors even though their progress
 * was sitting in localStorage.
 */

export const CHONDRO_LOCAL_SAVE_KEY = "arboreal_chondro_breeder_v2";
export const CHONDRO_SAVE_CHANGE_EVENT = "arboreal-chondro-breeder-save-change";

export type ChondroSaveLoadResult = {
  /** True when the state came from the authenticated cloud save. */
  authenticated: boolean;
  /** The save state object, or null when no save exists anywhere. */
  state: Record<string, unknown> | null;
};

function readLocalSaveState(): Record<string, unknown> | null {
  try {
    const raw = window.localStorage.getItem(CHONDRO_LOCAL_SAVE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // Corrupt local data: treat as no save rather than crashing the screen.
  }
  return null;
}

export async function loadChondroSaveState(): Promise<ChondroSaveLoadResult> {
  try {
    const response = await fetch("/api/hatchery/chondro-breeder/save", { cache: "no-store" });
    if (response.ok) {
      const data = await response.json();
      const state = data?.save?.state;
      if (state && typeof state === "object" && !Array.isArray(state)) {
        return { authenticated: true, state: state as Record<string, unknown> };
      }
      // Signed in but no cloud save yet: the player's progress may still be local.
    }
  } catch {
    // Network failure: fall through to the local save.
  }
  return { authenticated: false, state: readLocalSaveState() };
}

export function notifyChondroSaveChanged(): void {
  try {
    window.dispatchEvent(new Event(CHONDRO_SAVE_CHANGE_EVENT));
  } catch {
    // Non-browser environment: nothing to notify.
  }
}
