/**
 * Expo purchase helper: adds a purchased expo animal to the Keeper save.
 * Operates on the local save directly (the game re-reads on mount).
 */

import { CHONDRO_LOCAL_SAVE_KEY, CHONDRO_SAVE_CHANGE_EVENT, readLocalSaveState } from "./chondro-save";
import { animalHousingCapacity } from "./chondro-facility-limits";
import type { ExpoAnimal } from "./expo-data";

export type ExpoPurchaseResult =
  | { ok: true; animalName: string; price: number }
  | { ok: false; reason: "no-cash" | "no-space" | "no-save" };

function uid(): string {
  return `expo-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Build a colony Snake record from an expo animal. Uses the game's Snake
 * shape with sensible defaults for expo-bought animals.
 */
function expoAnimalToSnake(animal: ExpoAnimal): Record<string, unknown> {
  const neonateColor = Math.random() < 0.5 ? "Red" : "Yellow";
  return {
    id: uid(),
    name: animal.name,
    sex: animal.sex === "male" ? "Male" : "Female",
    source: "Expo Purchase",
    subspecies: "Morelia azurea azurea",
    locality: animal.locality,
    neonateColor,
    lifeStage: animal.lifeStage === "neonate" ? "Neonate" : animal.lifeStage === "subadult" ? "Subadult" : "Adult",
    highBlack: Math.round(Math.random() * 40),
    highWhite: Math.round(Math.random() * 40),
    blueStripe: Math.round(Math.random() * 60),
    yellowRetention: Math.round(Math.random() * 60),
    blotches: Math.round(Math.random() * 30),
    geneticsTested: false,
    phenotypeScore: Math.round(55 + Math.random() * 35),
    localityAncestry: { [animal.locality]: 100 },
    body: "Morelia azurea azurea",
    tail: "Morelia azurea azurea",
    eyes: "Morelia azurea azurea",
    head: "Morelia azurea azurea",
    pattern: animal.locality,
    color: animal.locality,
    nidoStatus: "Unknown",
    condition: "Good",
    classification: animal.morph === "Wild type" ? "Pure" : "Designer",
    generation: 1,
    parentIds: [],
    ancestry: { "Morelia azurea azurea": 100 },
    notes: `Purchased at the Weekend Expo${animal.exclusive ? " (expo exclusive)" : ""}. ${animal.blurb}`,
    breederInitials: null,
  };
}

export function expoPurchase(animal: ExpoAnimal, price: number): ExpoPurchaseResult {
  if (typeof window === "undefined") return { ok: false, reason: "no-save" };
  const save = readLocalSaveState();
  if (!save || typeof save.cash !== "number") return { ok: false, reason: "no-save" };

  const cash = save.cash as number;
  if (cash < price) return { ok: false, reason: "no-cash" };

  const colony = Array.isArray(save.colony) ? save.colony : [];
  const enclosures = (save.enclosures as Record<string, number> | null) ?? null;
  const openSlots = Math.max(0, animalHousingCapacity(enclosures) - colony.length);
  if (openSlots <= 0) return { ok: false, reason: "no-space" };

  const next = {
    ...save,
    cash: cash - price,
    colony: [...colony, expoAnimalToSnake(animal)],
  };
  try {
    window.localStorage.setItem(CHONDRO_LOCAL_SAVE_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent(CHONDRO_SAVE_CHANGE_EVENT));
  } catch {
    return { ok: false, reason: "no-save" };
  }
  return { ok: true, animalName: animal.name, price };
}

/** Read current cash for expo UI. */
export function expoCash(): number {
  const save = readLocalSaveState();
  return save && typeof save.cash === "number" ? (save.cash as number) : 0;
}

/** Read open housing slots for expo UI. */
export function expoOpenSlots(): number {
  const save = readLocalSaveState();
  if (!save) return 0;
  const colony = Array.isArray(save.colony) ? save.colony : [];
  const enclosures = (save.enclosures as Record<string, number> | null) ?? null;
  return Math.max(0, animalHousingCapacity(enclosures) - colony.length);
}
