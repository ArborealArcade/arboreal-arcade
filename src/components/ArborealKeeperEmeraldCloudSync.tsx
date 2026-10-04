"use client";

import { useEffect, useRef } from "react";
import {
  EMERALD_KEEPER_SAVE_KEY,
  sanitizeEmeraldKeeperSave,
  type EmeraldKeeperSave,
} from "@/lib/arboreal-keeper-emerald-engine";

const CLOUD_ENDPOINT = "/api/hatchery/arboreal-keeper/emerald-save";
const SAVE_EVENT = "arboreal-keeper-emerald-save-updated";
const LOAD_EVENT = "arboreal-keeper-emerald-cloud-loaded";
const STATUS_EVENT = "arboreal-keeper-cloud-status";

type CloudStatus = "loading" | "synced" | "local-only" | "error";

function localSave() {
  try {
    const raw = window.localStorage.getItem(EMERALD_KEEPER_SAVE_KEY);
    if (!raw) return null;
    return sanitizeEmeraldKeeperSave(JSON.parse(raw));
  } catch {
    return null;
  }
}

function timestamp(value: EmeraldKeeperSave | null) {
  return Math.max(0, Number(value?.updatedAt ?? 0) || 0);
}

function emitStatus(status: CloudStatus) {
  window.dispatchEvent(
    new CustomEvent(STATUS_EVENT, {
      detail: { status },
    }),
  );
}

async function upload(save: EmeraldKeeperSave) {
  const response = await fetch(CLOUD_ENDPOINT, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(save),
    cache: "no-store",
    keepalive: true,
  });
  if (response.status === 401) return "local-only" as const;
  if (!response.ok) throw new Error("Cloud save failed.");
  return "synced" as const;
}

export function ArborealKeeperEmeraldCloudSync() {
  const pending = useRef<EmeraldKeeperSave | null>(null);
  const timer = useRef<number | null>(null);
  const lastObservedAt = useRef(0);

  useEffect(() => {
    let cancelled = false;
    emitStatus("loading");

    async function hydrate() {
      const local = localSave();
      lastObservedAt.current = timestamp(local);

      try {
        const response = await fetch(CLOUD_ENDPOINT, { cache: "no-store" });
        if (response.status === 401) {
          if (!cancelled) emitStatus("local-only");
          return;
        }
        if (!response.ok) throw new Error("Cloud load failed.");

        const data = (await response.json()) as {
          save?: unknown;
          updatedAt?: number | string | null;
        };
        const cloud = data.save ? sanitizeEmeraldKeeperSave(data.save) : null;
        if (cloud && !cloud.updatedAt && data.updatedAt) {
          const parsed = typeof data.updatedAt === "number"
            ? data.updatedAt
            : Date.parse(String(data.updatedAt));
          if (Number.isFinite(parsed)) cloud.updatedAt = parsed;
        }

        if (cloud && timestamp(cloud) > timestamp(local)) {
          lastObservedAt.current = timestamp(cloud);
          window.localStorage.setItem(EMERALD_KEEPER_SAVE_KEY, JSON.stringify(cloud));
          window.dispatchEvent(new CustomEvent(LOAD_EVENT, { detail: { save: cloud } }));
        } else if (local && timestamp(local) > timestamp(cloud)) {
          const result = await upload(local);
          if (!cancelled) emitStatus(result);
          return;
        }

        if (!cancelled) emitStatus("synced");
      } catch {
        if (!cancelled) emitStatus("error");
      }
    }

    void hydrate();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    function queueSave(event: Event) {
      const detail = (event as CustomEvent<{ save?: unknown }>).detail;
      if (!detail?.save) return;
      const next = sanitizeEmeraldKeeperSave(detail.save);
      lastObservedAt.current = Math.max(lastObservedAt.current, timestamp(next));
      pending.current = next;
      if (timer.current !== null) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(async () => {
        const queued = pending.current;
        timer.current = null;
        if (!queued) return;
        try {
          emitStatus(await upload(queued));
        } catch {
          emitStatus("error");
        }
      }, 900);
    }

    // Some older Arboreal Keeper writers persist directly to localStorage and
    // do not emit SAVE_EVENT. Watch the save timestamp so those changes still
    // reach cloud sync and the shared facility bridge in the same tab.
    const localWatch = window.setInterval(() => {
      const current = localSave();
      const currentAt = timestamp(current);
      if (!current || currentAt <= lastObservedAt.current) return;
      lastObservedAt.current = currentAt;
      window.dispatchEvent(new CustomEvent(SAVE_EVENT, { detail: { save: current } }));
    }, 1_000);

    window.addEventListener(SAVE_EVENT, queueSave);
    return () => {
      window.removeEventListener(SAVE_EVENT, queueSave);
      window.clearInterval(localWatch);
      if (timer.current !== null) window.clearTimeout(timer.current);
    };
  }, []);

  return null;
}
