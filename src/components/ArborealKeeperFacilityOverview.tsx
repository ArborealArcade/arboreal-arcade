"use client";

import { useEffect, useMemo, useState } from "react";
import { ARBOREAL_KEEPER_ENCLOSURES } from "@/lib/arboreal-keeper-enclosures";
import {
  ARBOREAL_KEEPER_FACILITY_EVENT,
  ARBOREAL_KEEPER_FACILITY_SAVE_KEY,
  EMPTY_KEEPER_FACILITY_SAVE,
  enclosureCountInRoom,
  roomPurposeLabel,
  sanitizeKeeperFacilitySave,
  type KeeperFacilitySave,
} from "@/lib/arboreal-keeper-facility";
import { ARBOREAL_KEEPER_SPECIES_BY_ID } from "@/lib/arboreal-keeper-species";

function readFacility() {
  try {
    const raw = window.localStorage.getItem(ARBOREAL_KEEPER_FACILITY_SAVE_KEY);
    return raw ? sanitizeKeeperFacilitySave(JSON.parse(raw)) : sanitizeKeeperFacilitySave(EMPTY_KEEPER_FACILITY_SAVE);
  } catch {
    return sanitizeKeeperFacilitySave(EMPTY_KEEPER_FACILITY_SAVE);
  }
}

export function ArborealKeeperFacilityOverview() {
  const [save, setSave] = useState<KeeperFacilitySave>(EMPTY_KEEPER_FACILITY_SAVE);
  const [selectedRoomId, setSelectedRoomId] = useState("room-main");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const sync = () => {
      const next = readFacility();
      setSave(next);
      setSelectedRoomId((current) => next.rooms.some((room) => room.id === current) ? current : next.rooms[0]?.id ?? "room-main");
      setHydrated(true);
    };
    sync();
    window.addEventListener(ARBOREAL_KEEPER_FACILITY_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(ARBOREAL_KEEPER_FACILITY_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const selectedRoom = save.rooms.find((room) => room.id === selectedRoomId) ?? save.rooms[0] ?? null;
  const roomEnclosures = selectedRoom ? save.enclosures.filter((enclosure) => enclosure.roomId === selectedRoom.id) : [];
  const assigned = useMemo(() => save.enclosures.filter((enclosure) => enclosure.occupantId).length, [save.enclosures]);

  if (!hydrated || !selectedRoom) return null;

  return (
    <section className="mx-auto mb-6 max-w-7xl px-4 sm:px-6">
      <div className="overflow-hidden rounded-[28px] border border-emerald-300/10 bg-[#05100b] shadow-[0_24px_70px_rgba(0,0,0,.2)]">
        <div className="border-b border-white/[.055] p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-[9px] font-black uppercase tracking-[.18em] text-emerald-200/48">Shared Facility</div>
              <h2 className="mt-2 text-xl font-semibold tracking-[-.035em] text-white/88">Rooms and individual enclosures</h2>
              <p className="mt-2 max-w-3xl text-xs leading-5 text-white/42">Green Tree Python and Emerald Tree Boa housing now feeds one facility map. Rooms organize the collection; compatibility is enforced by enclosure type and life stage.</p>
            </div>
            <div className="flex gap-2 text-[9px] font-black uppercase tracking-[.1em]">
              <span className="rounded-full border border-white/[.06] bg-black/20 px-3 py-1.5 text-white/40">{save.rooms.length} rooms</span>
              <span className="rounded-full border border-white/[.06] bg-black/20 px-3 py-1.5 text-white/40">{save.enclosures.length} enclosures</span>
              <span className="rounded-full border border-emerald-300/10 bg-emerald-300/[.035] px-3 py-1.5 text-emerald-100/55">{assigned} assigned</span>
            </div>
          </div>
        </div>

        <div className="grid lg:grid-cols-[260px_1fr]">
          <div className="border-b border-white/[.055] p-3 lg:border-b-0 lg:border-r sm:p-4">
            <div className="space-y-2">
              {save.rooms.map((room) => {
                const count = enclosureCountInRoom(save, room.id);
                const selected = room.id === selectedRoom.id;
                return (
                  <button
                    key={room.id}
                    type="button"
                    onClick={() => setSelectedRoomId(room.id)}
                    className={`w-full rounded-2xl border px-3 py-3 text-left transition ${selected ? "border-emerald-300/15 bg-emerald-300/[.06]" : "border-white/[.05] bg-black/15 hover:bg-white/[.025]"}`}
                  >
                    <div className="text-xs font-semibold text-white/72">{room.name}</div>
                    <div className="mt-1 text-[9px] uppercase tracking-[.08em] text-white/28">{roomPurposeLabel(room.purpose)} · {count}/{room.enclosureSlots}</div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="p-4 sm:p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-white/76">{selectedRoom.name}</div>
                <div className="mt-1 text-[10px] text-white/30">{roomPurposeLabel(selectedRoom.purpose)} · {roomEnclosures.length} installed</div>
              </div>
            </div>

            <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {roomEnclosures.map((enclosure) => {
                const definition = ARBOREAL_KEEPER_ENCLOSURES.find((candidate) => candidate.id === enclosure.enclosureId);
                const species = enclosure.occupantSpeciesId ? ARBOREAL_KEEPER_SPECIES_BY_ID[enclosure.occupantSpeciesId] : null;
                return (
                  <div key={enclosure.id} className="rounded-2xl border border-white/[.055] bg-black/15 p-3">
                    <div className="text-xs font-semibold text-white/68">{definition?.displayName ?? enclosure.label}</div>
                    <div className="mt-2 text-[10px] leading-5 text-white/36">
                      {enclosure.occupantId ? (
                        <>
                          <div className="text-emerald-100/60">Occupied · individual housing</div>
                          <div>{species?.displayName ?? "Animal"}</div>
                        </>
                      ) : (
                        <div>Open individual enclosure</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {!roomEnclosures.length ? (
              <div className="mt-4 rounded-2xl border border-dashed border-white/[.07] p-6 text-center text-xs text-white/32">No enclosures are assigned to this room yet.</div>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
