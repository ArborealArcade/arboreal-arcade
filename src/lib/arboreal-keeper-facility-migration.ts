import { enclosureSupportsAnimal, type KeeperEnclosureId } from "@/lib/arboreal-keeper-enclosures";
import type { KeeperFacilityEnclosure, KeeperFacilitySave, KeeperHousingAnimal } from "@/lib/arboreal-keeper-facility";

export type LegacyGtpEnclosurePool = Record<string, number> | undefined;

function count(pool: LegacyGtpEnclosurePool, ...keys: string[]) {
  for (const key of keys) {
    const value = Math.floor(Number(pool?.[key] ?? 0));
    if (Number.isFinite(value) && value > 0) return value;
  }
  return 0;
}

function mirroredEnclosure(
  id: string,
  enclosureId: KeeperEnclosureId,
  roomId: string,
): KeeperFacilityEnclosure {
  return {
    id,
    roomId,
    enclosureId,
    label: enclosureId === "chondro-dojo-bin" ? "Chondro Dojo 2 Stack" : "PVC Enclosure",
    occupantId: null,
    occupantSpeciesId: null,
    createdAt: 0,
  };
}

function canUse(enclosure: KeeperFacilityEnclosure, animal: KeeperHousingAnimal) {
  return animal.lifeStage !== "unknown" && enclosureSupportsAnimal(enclosure.enclosureId, animal.speciesId, animal.lifeStage);
}

/**
 * Converts the original aggregate GTP enclosure inventory into stable individual
 * enclosure instances for the shared facility view. The legacy save remains the
 * authority for purchases/capacity until the gameplay engine migration is done.
 * A Chondro Dojo 2 Stack represents two individually occupied snake spaces.
 */
export function mirrorLegacyGtpHousingIntoFacility(
  save: KeeperFacilitySave,
  pool: LegacyGtpEnclosurePool,
  animals: KeeperHousingAnimal[],
): KeeperFacilitySave {
  const dojoSets = count(pool, "Chondro Dojo Bin", "Chondro Dojo 2 Stack");
  const pvcCount = count(pool, "PVC Arboreal", "PVC Enclosure");
  const previous = new Map(
    save.enclosures
      .filter((enclosure) => enclosure.id.startsWith("gtp:"))
      .map((enclosure) => [enclosure.id, enclosure]),
  );

  const desired: KeeperFacilityEnclosure[] = [];
  for (let setIndex = 0; setIndex < dojoSets; setIndex += 1) {
    for (let cell = 0; cell < 2; cell += 1) {
      const id = `gtp:dojo:${setIndex}:${cell}`;
      desired.push({ ...mirroredEnclosure(id, "chondro-dojo-bin", "room-nursery"), createdAt: previous.get(id)?.createdAt ?? 0 });
    }
  }
  for (let index = 0; index < pvcCount; index += 1) {
    const id = `gtp:pvc:${index}`;
    desired.push({ ...mirroredEnclosure(id, "pvc-arboreal-medium", "room-main"), createdAt: previous.get(id)?.createdAt ?? 0 });
  }

  const animalById = new Map(animals.map((animal) => [animal.id, animal]));
  const assigned = new Set<string>();

  // Preserve existing stable assignments whenever the same enclosure still exists
  // and remains compatible with the animal's current life stage.
  for (const enclosure of desired) {
    const old = previous.get(enclosure.id);
    if (!old?.occupantId) continue;
    const animal = animalById.get(old.occupantId);
    if (!animal || assigned.has(animal.id) || !canUse(enclosure, animal)) continue;
    enclosure.occupantId = animal.id;
    enclosure.occupantSpeciesId = "green_tree_python";
    assigned.add(animal.id);
  }

  const unassigned = animals.filter((animal) => !assigned.has(animal.id));
  const stagePriority = { adult: 0, neonate: 1, subadult: 2, unknown: 3 } as const;
  unassigned.sort((a, b) => stagePriority[a.lifeStage] - stagePriority[b.lifeStage] || a.id.localeCompare(b.id));

  for (const animal of unassigned) {
    const compatibleEmpty = desired.filter((enclosure) => !enclosure.occupantId && canUse(enclosure, animal));
    if (!compatibleEmpty.length) continue;
    // Chondros of ANY life stage can live in a Chondro Dojo — adults are not
    // forced into PVC. Prefer the Dojo, fall back to any compatible enclosure.
    const target = compatibleEmpty.find((enclosure) => enclosure.enclosureId === "chondro-dojo-bin") ?? compatibleEmpty[0];
    if (!target) continue;
    target.occupantId = animal.id;
    target.occupantSpeciesId = "green_tree_python";
    assigned.add(animal.id);
  }

  const nonGtp = save.enclosures.filter((enclosure) => !enclosure.id.startsWith("gtp:"));
  const nurseryNeeded = desired.filter((enclosure) => enclosure.roomId === "room-nursery").length
    + nonGtp.filter((enclosure) => enclosure.roomId === "room-nursery").length;
  const mainNeeded = desired.filter((enclosure) => enclosure.roomId === "room-main").length
    + nonGtp.filter((enclosure) => enclosure.roomId === "room-main").length;

  return {
    ...save,
    rooms: save.rooms.map((room) => {
      if (room.id === "room-nursery" && nurseryNeeded > room.enclosureSlots) {
        return { ...room, enclosureSlots: Math.min(60, Math.max(room.enclosureSlots, nurseryNeeded)) };
      }
      if (room.id === "room-main" && mainNeeded > room.enclosureSlots) {
        return { ...room, enclosureSlots: Math.min(60, Math.max(room.enclosureSlots, mainNeeded)) };
      }
      return room;
    }),
    enclosures: [...nonGtp, ...desired],
    updatedAt: Date.now(),
  };
}
