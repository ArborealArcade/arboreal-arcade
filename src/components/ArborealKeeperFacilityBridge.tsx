"use client";

import { useEffect } from "react";
import { keeperAnimalFromGtp, type LegacyGtpAnimalInput } from "@/lib/arboreal-keeper-animal-model";
import {
  ARBOREAL_KEEPER_SAVE_EVENT,
  LEGACY_CHONDRO_LOCAL_SAVE_KEY,
  LEGACY_CHONDRO_SAVE_EVENT,
} from "@/lib/arboreal-keeper-compat";
import {
  ARBOREAL_KEEPER_FACILITY_EVENT,
  ARBOREAL_KEEPER_FACILITY_SAVE_KEY,
  mirrorEmeraldHousingIntoFacility,
  sanitizeKeeperFacilitySave,
} from "@/lib/arboreal-keeper-facility";
import { mirrorLegacyGtpHousingIntoFacility } from "@/lib/arboreal-keeper-facility-migration";
import {
  EMERALD_KEEPER_SAVE_KEY,
  sanitizeEmeraldKeeperSave,
} from "@/lib/arboreal-keeper-emerald-engine";
import type { KeeperSpeciesId } from "@/lib/arboreal-keeper-species";

const EMERALD_SAVE_EVENT = "arboreal-keeper-emerald-save-updated";
const EMERALD_CLOUD_EVENT = "arboreal-keeper-emerald-cloud-loaded";

type LegacyGtpSave = {
  colony?: LegacyGtpAnimalInput[];
  enclosures?: Record<string, number>;
};

function readJson(key: string) {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function ArborealKeeperFacilityBridge() {
  useEffect(() => {
    const sync = () => {
      const emerald = sanitizeEmeraldKeeperSave(readJson(EMERALD_KEEPER_SAVE_KEY));
      const legacyGtp = (readJson(LEGACY_CHONDRO_LOCAL_SAVE_KEY) ?? {}) as LegacyGtpSave;
      const current = sanitizeKeeperFacilitySave(readJson(ARBOREAL_KEEPER_FACILITY_SAVE_KEY));
      const speciesByAnimalId = new Map<string, KeeperSpeciesId>(
        emerald.animals.map((animal) => [animal.id, animal.speciesId]),
      );

      const withEmeralds = mirrorEmeraldHousingIntoFacility(current, emerald.housingUnits, speciesByAnimalId);
      const gtpAnimals = (legacyGtp.colony ?? []).map((animal) => {
        const record = keeperAnimalFromGtp(animal);
        return {
          id: record.id,
          speciesId: record.speciesId,
          lifeStage: record.lifeStage,
        };
      });
      const next = mirrorLegacyGtpHousingIntoFacility(withEmeralds, legacyGtp.enclosures, gtpAnimals);

      const currentComparable = JSON.stringify({ ...current, updatedAt: 0 });
      const nextComparable = JSON.stringify({ ...next, updatedAt: 0 });
      if (currentComparable === nextComparable) return;

      try {
        window.localStorage.setItem(ARBOREAL_KEEPER_FACILITY_SAVE_KEY, JSON.stringify(next));
        window.dispatchEvent(new Event(ARBOREAL_KEEPER_FACILITY_EVENT));
      } catch {
        // Species programs remain playable even if facility persistence is unavailable.
      }
    };

    sync();
    window.addEventListener(ARBOREAL_KEEPER_SAVE_EVENT, sync);
    window.addEventListener(LEGACY_CHONDRO_SAVE_EVENT, sync);
    window.addEventListener(EMERALD_SAVE_EVENT, sync);
    window.addEventListener(EMERALD_CLOUD_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(ARBOREAL_KEEPER_SAVE_EVENT, sync);
      window.removeEventListener(LEGACY_CHONDRO_SAVE_EVENT, sync);
      window.removeEventListener(EMERALD_SAVE_EVENT, sync);
      window.removeEventListener(EMERALD_CLOUD_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  return null;
}
