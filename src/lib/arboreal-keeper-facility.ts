import {
  enclosureSupportsAnimal,
  normalizeKeeperEnclosureId,
  type KeeperEnclosureId,
} from "@/lib/arboreal-keeper-enclosures";
import type { KeeperLifeStage, KeeperSpeciesId } from "@/lib/arboreal-keeper-species";

export type KeeperRoomPurpose =
  | "nursery"
  | "growout"
  | "adult"
  | "breeding"
  | "quarantine"
  | "display"
  | "general";

export type KeeperFacilityRoom = {
  id: string;
  name: string;
  purpose: KeeperRoomPurpose;
  enclosureSlots: number;
  createdAt: number;
};

export type KeeperFacilityEnclosure = {
  id: string;
  roomId: string;
  enclosureId: KeeperEnclosureId;
  label: string;
  occupantId: string | null;
  occupantSpeciesId: KeeperSpeciesId | null;
  createdAt: number;
};

export type KeeperFacilitySave = {
  rooms: KeeperFacilityRoom[];
  enclosures: KeeperFacilityEnclosure[];
  updatedAt: number;
};

export type KeeperHousingAnimal = {
  id: string;
  speciesId: KeeperSpeciesId;
  lifeStage: KeeperLifeStage | "unknown";
};

export type LegacyEmeraldHousingUnitInput = {
  id: string;
  enclosureId: unknown;
  occupantId: string | null;
};

export const ARBOREAL_KEEPER_FACILITY_SAVE_KEY = "arboreal_keeper_facility_v1";
export const ARBOREAL_KEEPER_FACILITY_EVENT = "arboreal-keeper-facility-updated";

export const KEEPER_ROOM_PURPOSES: Array<{ id: KeeperRoomPurpose; label: string }> = [
  { id: "nursery", label: "Nursery" },
  { id: "growout", label: "Grow-Out Room" },
  { id: "adult", label: "Adult Room" },
  { id: "breeding", label: "Breeding Room" },
  { id: "quarantine", label: "Quarantine" },
  { id: "display", label: "Display Room" },
  { id: "general", label: "General Room" },
];

export const EMPTY_KEEPER_FACILITY_SAVE: KeeperFacilitySave = {
  rooms: [
    {
      id: "room-nursery",
      name: "Nursery",
      purpose: "nursery",
      enclosureSlots: 12,
      createdAt: 1,
    },
    {
      id: "room-main",
      name: "Main Animal Room",
      purpose: "general",
      enclosureSlots: 12,
      createdAt: 2,
    },
  ],
  enclosures: [],
  updatedAt: 0,
};

function cloneEmptyFacility(): KeeperFacilitySave {
  return {
    rooms: EMPTY_KEEPER_FACILITY_SAVE.rooms.map((room) => ({ ...room })),
    enclosures: [],
    updatedAt: 0,
  };
}

function normalizeSpeciesId(value: unknown): KeeperSpeciesId | null {
  if (
    value === "green_tree_python" ||
    value === "northern_emerald_tree_boa" ||
    value === "amazon_basin_emerald_tree_boa"
  ) return value;
  return null;
}

function normalizeRoomPurpose(value: unknown): KeeperRoomPurpose {
  const found = KEEPER_ROOM_PURPOSES.find((purpose) => purpose.id === value);
  return found?.id ?? "general";
}

export function sanitizeKeeperFacilitySave(value: unknown): KeeperFacilitySave {
  if (!value || typeof value !== "object" || Array.isArray(value)) return cloneEmptyFacility();
  const input = value as Partial<KeeperFacilitySave>;

  const rooms = Array.isArray(input.rooms)
    ? input.rooms
        .filter((room): room is KeeperFacilityRoom => Boolean(room && typeof room === "object" && !Array.isArray(room)))
        .map((room) => ({
          id: String(room.id ?? "").slice(0, 160),
          name: String(room.name ?? "Room").slice(0, 80),
          purpose: normalizeRoomPurpose(room.purpose),
          enclosureSlots: Math.max(1, Math.min(60, Math.round(Number(room.enclosureSlots ?? 8) || 8))),
          createdAt: Number.isFinite(Number(room.createdAt)) ? Number(room.createdAt) : 0,
        }))
        .filter((room) => room.id)
    : [];

  const normalizedRooms = rooms.length ? rooms : cloneEmptyFacility().rooms;
  const roomIds = new Set(normalizedRooms.map((room) => room.id));

  const enclosures = Array.isArray(input.enclosures)
    ? input.enclosures
        .filter((enclosure): enclosure is KeeperFacilityEnclosure => Boolean(enclosure && typeof enclosure === "object" && !Array.isArray(enclosure)))
        .map((enclosure) => {
          const enclosureId = normalizeKeeperEnclosureId(enclosure.enclosureId);
          return {
            id: String(enclosure.id ?? "").slice(0, 180),
            roomId: String(enclosure.roomId ?? "").slice(0, 160),
            enclosureId,
            label: String(enclosure.label ?? "Enclosure").slice(0, 80),
            occupantId: typeof enclosure.occupantId === "string" && enclosure.occupantId ? enclosure.occupantId.slice(0, 180) : null,
            occupantSpeciesId: normalizeSpeciesId(enclosure.occupantSpeciesId),
            createdAt: Number.isFinite(Number(enclosure.createdAt)) ? Number(enclosure.createdAt) : 0,
          };
        })
        .filter((enclosure): enclosure is KeeperFacilityEnclosure => Boolean(enclosure.id && enclosure.enclosureId && roomIds.has(enclosure.roomId)))
    : [];

  const seenOccupants = new Set<string>();
  const uniqueOccupancy = enclosures.map((enclosure) => {
    if (!enclosure.occupantId) return enclosure;
    if (seenOccupants.has(enclosure.occupantId)) {
      return { ...enclosure, occupantId: null, occupantSpeciesId: null };
    }
    seenOccupants.add(enclosure.occupantId);
    return enclosure;
  });

  return {
    rooms: normalizedRooms,
    enclosures: uniqueOccupancy,
    updatedAt: Number.isFinite(Number(input.updatedAt)) ? Number(input.updatedAt) : 0,
  };
}

export function roomPurposeLabel(purpose: KeeperRoomPurpose) {
  return KEEPER_ROOM_PURPOSES.find((item) => item.id === purpose)?.label ?? "Room";
}

export function enclosureCountInRoom(save: KeeperFacilitySave, roomId: string) {
  return save.enclosures.filter((enclosure) => enclosure.roomId === roomId).length;
}

export function openEnclosureSlotsInRoom(save: KeeperFacilitySave, roomId: string) {
  const room = save.rooms.find((candidate) => candidate.id === roomId);
  if (!room) return 0;
  return Math.max(0, room.enclosureSlots - enclosureCountInRoom(save, roomId));
}

export function facilityEnclosureForAnimal(save: KeeperFacilitySave, animalId: string) {
  return save.enclosures.find((enclosure) => enclosure.occupantId === animalId) ?? null;
}

export function enclosureCanHouseAnimal(enclosure: KeeperFacilityEnclosure, animal: KeeperHousingAnimal) {
  if (animal.lifeStage === "unknown") return false;
  if (enclosure.occupantId && enclosure.occupantId !== animal.id) return false;
  return enclosureSupportsAnimal(enclosure.enclosureId, animal.speciesId, animal.lifeStage);
}

export function assignAnimalToFacilityEnclosure(
  save: KeeperFacilitySave,
  animal: KeeperHousingAnimal,
  enclosureInstanceId: string,
): KeeperFacilitySave {
  const target = save.enclosures.find((enclosure) => enclosure.id === enclosureInstanceId);
  if (!target || !enclosureCanHouseAnimal(target, animal)) return save;

  return {
    ...save,
    enclosures: save.enclosures.map((enclosure) => {
      if (enclosure.id === enclosureInstanceId) {
        return { ...enclosure, occupantId: animal.id, occupantSpeciesId: animal.speciesId };
      }
      if (enclosure.occupantId === animal.id) {
        return { ...enclosure, occupantId: null, occupantSpeciesId: null };
      }
      return enclosure;
    }),
    updatedAt: Date.now(),
  };
}

export function releaseAnimalFromFacility(save: KeeperFacilitySave, animalId: string): KeeperFacilitySave {
  let changed = false;
  const enclosures = save.enclosures.map((enclosure) => {
    if (enclosure.occupantId !== animalId) return enclosure;
    changed = true;
    return { ...enclosure, occupantId: null, occupantSpeciesId: null };
  });
  return changed ? { ...save, enclosures, updatedAt: Date.now() } : save;
}

export function addFacilityRoom(
  save: KeeperFacilitySave,
  room: Omit<KeeperFacilityRoom, "createdAt"> & { createdAt?: number },
): KeeperFacilitySave {
  if (!room.id || save.rooms.some((candidate) => candidate.id === room.id)) return save;
  return {
    ...save,
    rooms: [...save.rooms, { ...room, createdAt: room.createdAt ?? Date.now() }],
    updatedAt: Date.now(),
  };
}

export function addFacilityEnclosure(
  save: KeeperFacilitySave,
  enclosure: Omit<KeeperFacilityEnclosure, "occupantId" | "occupantSpeciesId" | "createdAt"> & {
    occupantId?: string | null;
    occupantSpeciesId?: KeeperSpeciesId | null;
    createdAt?: number;
  },
): KeeperFacilitySave {
  const room = save.rooms.find((candidate) => candidate.id === enclosure.roomId);
  if (!room || save.enclosures.some((candidate) => candidate.id === enclosure.id)) return save;
  if (openEnclosureSlotsInRoom(save, room.id) <= 0) return save;
  return {
    ...save,
    enclosures: [
      ...save.enclosures,
      {
        ...enclosure,
        occupantId: enclosure.occupantId ?? null,
        occupantSpeciesId: enclosure.occupantSpeciesId ?? null,
        createdAt: enclosure.createdAt ?? Date.now(),
      },
    ],
    updatedAt: Date.now(),
  };
}

export function mirrorEmeraldHousingIntoFacility(
  save: KeeperFacilitySave,
  housingUnits: LegacyEmeraldHousingUnitInput[],
  speciesByAnimalId: Map<string, KeeperSpeciesId>,
): KeeperFacilitySave {
  let next = save;
  const existingMirrorIds = new Set(housingUnits.map((unit) => `emerald:${unit.id}`));

  for (const unit of housingUnits) {
    const enclosureId = normalizeKeeperEnclosureId(unit.enclosureId);
    if (!enclosureId) continue;
    const id = `emerald:${unit.id}`;
    const preferredRoomId = enclosureId === "chondro-dojo-bin" ? "room-nursery" : "room-main";
    const occupantSpeciesId = unit.occupantId ? speciesByAnimalId.get(unit.occupantId) ?? null : null;
    const existing = next.enclosures.find((candidate) => candidate.id === id);

    if (existing) {
      next = {
        ...next,
        enclosures: next.enclosures.map((candidate) => candidate.id === id
          ? {
              ...candidate,
              enclosureId,
              occupantId: unit.occupantId,
              occupantSpeciesId,
            }
          : candidate),
      };
      continue;
    }

    next = addFacilityEnclosure(next, {
      id,
      roomId: preferredRoomId,
      enclosureId,
      label: enclosureId === "chondro-dojo-bin" ? "Chondro Dojo 2 Stack" : "PVC Enclosure",
      occupantId: unit.occupantId,
      occupantSpeciesId,
      createdAt: Date.now(),
    });
  }

  const enclosures = next.enclosures.filter((enclosure) => !enclosure.id.startsWith("emerald:") || existingMirrorIds.has(enclosure.id));
  return {
    ...next,
    enclosures,
    updatedAt: Date.now(),
  };
}
