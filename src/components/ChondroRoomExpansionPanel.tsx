"use client";

import { useEffect, useMemo, useState } from "react";
import { loadChondroSaveState } from "@/lib/chondro-save";
import { ROOM_EXPANSIONS, roomCapacityFromSave, type FacilityRoomState } from "@/lib/chondro-facility-limits";

type Save = {
  cash: number;
  season: number;
  careerReputation?: number;
  facilityRooms?: FacilityRoomState;
  facilityConstruction?: { roomId: string; completesAt: number } | null;
  [key: string]: unknown;
};

const money = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
const duration = (ms: number) => {
  const hours = Math.max(0, Math.ceil(ms / 3_600_000));
  return hours < 24 ? `${hours}h` : `${Math.ceil(hours / 24)}d`;
};

async function patchProgression(patch: Record<string, unknown>) {
  const response = await fetch("/api/hatchery/chondro-breeder/progression", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ patch }),
  });
  if (!response.ok) throw new Error("progression save failed");
  return response.json();
}

export function ChondroRoomExpansionPanel() {
  const [save, setSave] = useState<Save | null>(null);
  const [now, setNow] = useState(Date.now());
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const { state } = await loadChondroSaveState();
      if (state) setSave(state as Save);
    } catch {}
  }

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!save?.facilityConstruction || busy) return;
    if (save.facilityConstruction.completesAt > now) return;
    const room = ROOM_EXPANSIONS.find((item) => item.id === save.facilityConstruction?.roomId);
    if (!room) return;
    const rooms: FacilityRoomState = { ...(save.facilityRooms ?? { "starter-room": 1 }) };
    rooms[room.id] = (rooms[room.id] ?? 0) + 1;
    setBusy(true);
    void patchProgression({ facilityRooms: rooms, facilityConstruction: null })
      .then(() => {
        setStatus(`${room.name} is ready.`);
        window.dispatchEvent(new Event("chondro-room-capacity-updated"));
        window.dispatchEvent(new Event("chondro-progression-updated"));
        return load();
      })
      .finally(() => setBusy(false));
  }, [save, now, busy]);

  const rooms = useMemo<FacilityRoomState>(() => save?.facilityRooms ?? { "starter-room": 1 }, [save?.facilityRooms]);
  const totalCapacity = useMemo(() => roomCapacityFromSave({ facilityRooms: rooms }), [rooms]);
  const reputation = Number(save?.careerReputation ?? 0);

  async function startConstruction(roomId: string) {
    if (!save || save.facilityConstruction || busy) return;
    const room = ROOM_EXPANSIONS.find((item) => item.id === roomId);
    if (!room || room.id === "starter-room") return;
    const owned = rooms[room.id] ?? 0;
    if (owned >= room.maxOwned || save.cash < room.cost || reputation < room.reputationRequired) return;
    setBusy(true);
    setStatus("");
    try {
      await patchProgression({
        cash: save.cash - room.cost,
        facilityRooms: rooms,
        facilityConstruction: { roomId, completesAt: Date.now() + room.buildHours * 3_600_000 },
      });
      setStatus(`${room.name} construction started.`);
      await load();
    } catch {
      setStatus("Construction could not be started.");
    } finally {
      setBusy(false);
    }
  }

  if (!save) return <div className="rounded-2xl border border-white/[.06] p-4 text-xs text-white/35">Loading facility rooms…</div>;

  const construction = save.facilityConstruction;
  const activeRoom = construction ? ROOM_EXPANSIONS.find((item) => item.id === construction.roomId) : null;

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-emerald-300/10 bg-emerald-300/[.025] p-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="text-sm font-bold text-white/75">Property → rooms → enclosure slots → virtual animals</div>
          <span className="rounded-full border border-emerald-300/14 px-2 py-0.5 text-[7px] font-black uppercase tracking-[.1em] text-emerald-100/58">Game facility</span>
        </div>
        <div className="mt-1 text-[11px] leading-5 text-white/35">Rooms add physical enclosure slots inside Arboreal Keeper. A PVC enclosure uses one slot for one virtual snake, while a Chondro Dojo Pair uses that same one slot for two separate virtual snake enclosures.</div>
        <div className="mt-3 text-2xl font-semibold text-emerald-100/75">{totalCapacity} facility enclosure slots</div>
        <div className="mt-1 text-[10px] text-emerald-100/45">Dojo housing can turn each compatible slot into two virtual animal spaces.</div>
      </div>

      {activeRoom ? (
        <div className="rounded-2xl border border-amber-200/15 bg-amber-200/[.03] p-4">
          <div className="text-xs font-black uppercase tracking-[.12em] text-amber-100/65">Under construction</div>
          <div className="mt-2 text-lg font-semibold">{activeRoom.name}</div>
          <div className="mt-1 text-xs text-white/40">Ready in about {duration(construction!.completesAt - now)}. Construction continues while you are offline.</div>
        </div>
      ) : null}

      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        {ROOM_EXPANSIONS.map((room) => {
          const owned = rooms[room.id] ?? 0;
          const maxed = owned >= room.maxOwned;
          const locked = reputation < room.reputationRequired;
          return (
            <div key={room.id} className="rounded-2xl border border-white/[.06] bg-black/10 p-4">
              <div className="flex items-start justify-between gap-3">
                <div><div className="text-sm font-bold text-white/70">{room.name}</div><div className="mt-1 text-[10px] text-white/30">Owned {owned}/{room.maxOwned}</div></div>
                <div className="rounded-lg border border-emerald-300/10 px-2 py-1 text-[10px] font-bold text-emerald-100/60">+{room.capacity} slots</div>
              </div>
              <div className="mt-2 text-[10px] leading-4 text-white/35">{room.description}</div>
              {room.id !== "starter-room" ? (
                <button type="button" disabled={busy || !!construction || maxed || locked || save.cash < room.cost} onClick={() => void startConstruction(room.id)} className="mt-3 rounded-xl border border-white/[.08] px-3 py-2 text-[10px] font-black text-white/60 disabled:opacity-25">
                  {maxed ? "Max owned" : locked ? `Requires ${room.reputationRequired.toLocaleString()} rep` : `${money(room.cost)} · ${room.buildHours}h build`}
                </button>
              ) : <div className="mt-3 text-[10px] font-bold text-emerald-100/50">Starting room</div>}
            </div>
          );
        })}
      </div>
      {status ? <div role="status" className="text-xs text-emerald-100/65">{status}</div> : null}
    </div>
  );
}
