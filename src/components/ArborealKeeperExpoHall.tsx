"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { EXPO_VENDORS } from "@/lib/expo-data";

export type ExpoInteractable =
  | { kind: "vendor"; vendorId: string }
  | { kind: "auction" }
  | { kind: "rumor" }
  | { kind: "arcade" }
  | { kind: "exit" };

type Props = {
  onInteract: (target: ExpoInteractable) => void;
  onExit: () => void;
};

// World layout (world units = px at 1x)
const WORLD_W = 1600;
const WORLD_H = 1000;
const WALL = 40;

type Booth = {
  vendorId: string;
  x: number; y: number; w: number; h: number;
  color: string; name: string;
};

const BOOTHS: Booth[] = [
  { vendorId: "marvs-morphs", x: 180, y: 170, w: 220, h: 130, color: "#b91c1c", name: "Marv's Morphs" },
  { vendorId: "sunny-scales", x: 560, y: 170, w: 220, h: 130, color: "#f59e0b", name: "Sunny Scales" },
  { vendorId: "old-petes", x: 940, y: 170, w: 220, h: 130, color: "#7c3aed", name: "Old Pete's" },
  { vendorId: "chaos-constrictors", x: 180, y: 470, w: 220, h: 130, color: "#06b6d4", name: "Chaos Constrictors" },
  { vendorId: "pureline", x: 560, y: 470, w: 220, h: 130, color: "#10b981", name: "Pureline Reptiles" },
  { vendorId: "white-wizard-serpents", x: 940, y: 470, w: 220, h: 130, color: "#1e3a8a", name: "White Wizard Serpents" },
];

// Auction stage (right side), rumor NPC spot, arcade cabinet (corner), exit (bottom)
const AUCTION = { x: 1260, y: 200, w: 220, h: 160 };
const ARCADE = { x: 1330, y: 740, w: 90, h: 110 };
const RUMOR_NPC = { x: 1150, y: 640 };
const EXIT = { x: 730, y: 930, w: 140, h: 40 };

const PLAYER_R = 16;
const PLAYER_SPEED = 260;

type Keys = Record<string, boolean>;

function rectsOverlap(ax: number, ay: number, ar: number, b: { x: number; y: number; w: number; h: number }): boolean {
  const bx1 = b.x - ar, bx2 = b.x + b.w + ar;
  const by1 = b.y - ar, by2 = b.y + b.h + ar;
  return ax > bx1 && ax < bx2 && ay > by1 && ay < by2;
}

function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(ax - bx, ay - by);
}

export function ArborealKeeperExpoHall({ onInteract, onExit }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const onInteractRef = useRef(onInteract);
  const onExitRef = useRef(onExit);
  useEffect(() => {
    onInteractRef.current = onInteract;
    onExitRef.current = onExit;
  });

  const [nearby, setNearby] = useState<ExpoInteractable | null>(null);
  const [showTouchUI, setShowTouchUI] = useState(false);
  const nearbyRef = useRef<ExpoInteractable | null>(null);

  const interact = useCallback(() => {
    const t = nearbyRef.current;
    if (!t) return;
    if (t.kind === "exit") onExitRef.current();
    else onInteractRef.current(t);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const c: CanvasRenderingContext2D = ctx;
    const el: HTMLDivElement = wrap;
    const cv: HTMLCanvasElement = canvas;

    // Touch detection: show joystick on touch devices
    const isTouch = "ontouchstart" in window || navigator.maxTouchPoints > 0;
    setShowTouchUI(isTouch);

    let raf = 0;
    let running = true;

    // Player state
    const player = { x: 800, y: 860, vx: 0, vy: 0, dir: 0 };
    const keys: Keys = {};
    const joy = { active: false, dx: 0, dy: 0 };

    // Rumor NPC wanders slightly
    let npcT = 0;
    const npcBase = { ...RUMOR_NPC };

    const solids: Array<{ x: number; y: number; w: number; h: number }> = [
      ...BOOTHS.map((b) => ({ x: b.x, y: b.y, w: b.w, h: b.h })),
      { x: AUCTION.x, y: AUCTION.y, w: AUCTION.w, h: AUCTION.h },
      { x: ARCADE.x, y: ARCADE.y, w: ARCADE.w, h: ARCADE.h },
    ];

    function findNearby(): ExpoInteractable | null {
      const R = 90;
      for (const b of BOOTHS) {
        const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
        if (dist(player.x, player.y, cx, cy) < R + Math.max(b.w, b.h) / 2)
          return { kind: "vendor", vendorId: b.vendorId };
      }
      const acx = AUCTION.x + AUCTION.w / 2, acy = AUCTION.y + AUCTION.h / 2;
      if (dist(player.x, player.y, acx, acy) < R + 110) return { kind: "auction" };
      if (dist(player.x, player.y, npcBase.x, npcBase.y) < R) return { kind: "rumor" };
      const arx = ARCADE.x + ARCADE.w / 2, ary = ARCADE.y + ARCADE.h / 2;
      if (dist(player.x, player.y, arx, ary) < R) return { kind: "arcade" };
      const ex = EXIT.x + EXIT.w / 2, ey = EXIT.y + EXIT.h / 2;
      if (dist(player.x, player.y, ex, ey) < R) return { kind: "exit" };
      return null;
    }

    function step(dt: number) {
      // Input vector
      let ix = 0, iy = 0;
      if (keys["arrowup"] || keys["w"]) iy -= 1;
      if (keys["arrowdown"] || keys["s"]) iy += 1;
      if (keys["arrowleft"] || keys["a"]) ix -= 1;
      if (keys["arrowright"] || keys["d"]) ix += 1;
      if (joy.active) { ix += joy.dx; iy += joy.dy; }
      const len = Math.hypot(ix, iy);
      if (len > 1) { ix /= len; iy /= len; }

      const nx = player.x + ix * PLAYER_SPEED * dt;
      const ny = player.y + iy * PLAYER_SPEED * dt;

      // X axis collision
      let canX = nx > WALL + PLAYER_R && nx < WORLD_W - WALL - PLAYER_R;
      if (canX) for (const s of solids) if (rectsOverlap(nx, player.y, PLAYER_R, s)) { canX = false; break; }
      if (canX) player.x = nx;
      // Y axis collision
      let canY = ny > WALL + PLAYER_R && ny < WORLD_H - WALL - PLAYER_R;
      if (canY) for (const s of solids) if (rectsOverlap(player.x, ny, PLAYER_R, s)) { canY = false; break; }
      if (canY) player.y = ny;

      if (len > 0.1) player.dir = Math.atan2(iy, ix);

      npcT += dt;
      const nb = findNearby();
      const key = nb ? nb.kind + ("vendorId" in nb ? nb.vendorId : "") : null;
      const prevKey = nearbyRef.current ? nearbyRef.current.kind + ("vendorId" in (nearbyRef.current as { vendorId?: string }) ? (nearbyRef.current as { vendorId?: string }).vendorId ?? "" : "") : null;
      if (key !== prevKey) {
        nearbyRef.current = nb;
        setNearby(nb);
      }
    }

    function draw() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const cw = el.clientWidth;
      const ch = Math.min(window.innerHeight * 0.62, 620);
      if (cv.width !== cw * dpr || cv.height !== ch * dpr) {
        cv.width = cw * dpr;
        cv.height = ch * dpr;
        cv.style.width = cw + "px";
        cv.style.height = ch + "px";
      }
      c.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Camera follows player, clamped
      const camX = Math.max(0, Math.min(WORLD_W - cw, player.x - cw / 2));
      const camY = Math.max(0, Math.min(WORLD_H - ch, player.y - ch / 2));
      c.clearRect(0, 0, cw, ch);
      c.save();
      c.translate(-camX, -camY);

      // Floor: expo carpet
      c.fillStyle = "#0d1512";
      c.fillRect(0, 0, WORLD_W, WORLD_H);
      c.fillStyle = "#111b17";
      const tile = 80;
      for (let x = 0; x < WORLD_W; x += tile)
        for (let y = 0; y < WORLD_H; y += tile)
          if (((x + y) / tile) % 2 === 0) c.fillRect(x, y, tile, tile);
      // Aisle runner
      c.fillStyle = "#1a2b23";
      c.fillRect(WALL, 380, WORLD_W - WALL * 2, 60);

      // Walls
      c.fillStyle = "#1f2d27";
      c.fillRect(0, 0, WORLD_W, WALL);
      c.fillRect(0, WORLD_H - WALL, WORLD_W, WALL);
      c.fillRect(0, 0, WALL, WORLD_H);
      c.fillRect(WORLD_W - WALL, 0, WALL, WORLD_H);
      // Banner
      c.fillStyle = "#0a0f0d";
      c.fillRect(WALL, 8, WORLD_W - WALL * 2, 26);
      c.fillStyle = "#a7f3d0";
      c.font = "bold 15px system-ui";
      c.textAlign = "center";
      c.fillText("★ WEEKEND REPTILE EXPO ★", WORLD_W / 2, 27);

      // Booths
      for (const b of BOOTHS) {
        c.fillStyle = "#00000055";
        c.fillRect(b.x + 6, b.y + 8, b.w, b.h);
        c.fillStyle = "#f5f0e6";
        c.fillRect(b.x, b.y, b.w, b.h);
        c.fillStyle = b.color;
        c.fillRect(b.x, b.y, b.w, 26);
        c.fillStyle = "#fff";
        c.font = "bold 13px system-ui";
        c.fillText(b.name, b.x + b.w / 2, b.y + 18);
        // Table goods: little snake tubs
        c.fillStyle = "#d8cfc0";
        for (let i = 0; i < 3; i++) {
          c.fillRect(b.x + 20 + i * 62, b.y + 48, 48, 30);
          c.fillStyle = "#3f6212";
          c.beginPath();
          c.ellipse(b.x + 44 + i * 62, b.y + 63, 14, 7, 0.3, 0, Math.PI * 2);
          c.fill();
          c.fillStyle = "#d8cfc0";
        }
        // Vendor person behind table
        c.fillStyle = "#1c1917";
        c.beginPath();
        c.arc(b.x + b.w / 2, b.y + b.h + 22, 14, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = b.color;
        c.fillRect(b.x + b.w / 2 - 14, b.y + b.h + 22, 28, 26);
      }

      // Auction stage
      c.fillStyle = "#00000055";
      c.fillRect(AUCTION.x + 6, AUCTION.y + 8, AUCTION.w, AUCTION.h);
      c.fillStyle = "#451a03";
      c.fillRect(AUCTION.x, AUCTION.y, AUCTION.w, AUCTION.h);
      c.fillStyle = "#fbbf24";
      c.font = "bold 14px system-ui";
      c.fillText("🔨 AUCTION", AUCTION.x + AUCTION.w / 2, AUCTION.y + 26);
      c.fillStyle = "#92400e";
      c.fillRect(AUCTION.x + 30, AUCTION.y + 60, AUCTION.w - 60, 50);
      c.fillStyle = "#fde68a";
      c.font = "12px system-ui";
      c.fillText("next lot soon", AUCTION.x + AUCTION.w / 2, AUCTION.y + 90);

      // Arcade cabinet (corner)
      const cab = ARCADE;
      c.fillStyle = "#00000066";
      c.fillRect(cab.x + 5, cab.y + 6, cab.w, cab.h);
      c.fillStyle = "#312e81";
      c.fillRect(cab.x, cab.y, cab.w, cab.h);
      c.fillStyle = "#0ea5e9";
      c.fillRect(cab.x + 10, cab.y + 12, cab.w - 20, 44);
      c.fillStyle = "#22d3ee";
      c.font = "bold 10px system-ui";
      c.fillText("SNAKE!", cab.x + cab.w / 2, cab.y + 32);
      // animated marquee glow
      const glow = 0.5 + 0.5 * Math.sin(npcT * 4);
      c.fillStyle = `rgba(34,211,238,${0.25 + glow * 0.35})`;
      c.fillRect(cab.x + 10, cab.y + 12, cab.w - 20, 44);
      c.fillStyle = "#1e1b4b";
      c.fillRect(cab.x + 18, cab.y + 66, cab.w - 36, 10);
      c.fillStyle = "#f43f5e";
      c.beginPath();
      c.arc(cab.x + cab.w / 2, cab.y + 88, 6, 0, Math.PI * 2);
      c.fill();

      // Rumor NPC (wandering slightly)
      const npx = npcBase.x + Math.sin(npcT * 0.7) * 24;
      const npy = npcBase.y + Math.cos(npcT * 0.5) * 14;
      c.fillStyle = "#78350f";
      c.beginPath();
      c.arc(npx, npy, 15, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = "#fbbf24";
      c.fillRect(npx - 15, npy + 12, 30, 24);
      c.fillStyle = "#fff";
      c.font = "11px system-ui";
      c.fillText("???", npx, npy - 24);
      // "!" bubble when near
      const nb = nearbyRef.current;
      if (nb && nb.kind === "rumor") {
        c.fillStyle = "#fbbf24";
        c.beginPath();
        c.arc(npx + 20, npy - 26, 10, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = "#000";
        c.font = "bold 13px system-ui";
        c.fillText("!", npx + 20, npy - 21);
      }

      // Exit mat
      c.fillStyle = "#14532d";
      c.fillRect(EXIT.x, EXIT.y, EXIT.w, EXIT.h);
      c.fillStyle = "#bbf7d0";
      c.font = "bold 13px system-ui";
      c.fillText("EXIT →", EXIT.x + EXIT.w / 2, EXIT.y + 26);

      // Player (keeper with cap)
      const px = player.x, py = player.y;
      c.fillStyle = "#00000044";
      c.beginPath();
      c.ellipse(px, py + 14, 14, 6, 0, 0, Math.PI * 2);
      c.fill();
      // body
      c.fillStyle = "#166534";
      c.beginPath();
      c.arc(px, py, PLAYER_R, 0, Math.PI * 2);
      c.fill();
      // cap brim pointing in move dir
      c.fillStyle = "#14532d";
      c.beginPath();
      c.arc(px + Math.cos(player.dir) * 10, py + Math.sin(player.dir) * 10, 8, 0, Math.PI * 2);
      c.fill();
      // face
      c.fillStyle = "#fcd9a8";
      c.beginPath();
      c.arc(px + Math.cos(player.dir) * 5, py + Math.sin(player.dir) * 5, 7, 0, Math.PI * 2);
      c.fill();

      // Interaction ring on nearby target
      if (nb) {
        let tx = 0, ty = 0, tr = 0;
        if (nb.kind === "vendor") {
          const b = BOOTHS.find((x) => x.vendorId === (nb as { vendorId: string }).vendorId)!;
          tx = b.x + b.w / 2; ty = b.y + b.h / 2; tr = Math.max(b.w, b.h) / 2 + 14;
        } else if (nb.kind === "auction") { tx = AUCTION.x + AUCTION.w / 2; ty = AUCTION.y + AUCTION.h / 2; tr = 130; }
        else if (nb.kind === "rumor") { tx = npx; ty = npy; tr = 30; }
        else if (nb.kind === "arcade") { tx = cab.x + cab.w / 2; ty = cab.y + cab.h / 2; tr = 80; }
        else { tx = EXIT.x + EXIT.w / 2; ty = EXIT.y + EXIT.h / 2; tr = 90; }
        c.strokeStyle = "#a7f3d0";
        c.lineWidth = 3;
        c.setLineDash([8, 6]);
        c.beginPath();
        c.arc(tx, ty, tr, npcT * 1.5, npcT * 1.5 + Math.PI * 2);
        c.stroke();
        c.setLineDash([]);
      }

      c.restore();

      // Interaction hint (screen space)
      if (nb && !isTouch) {
        c.fillStyle = "rgba(0,0,0,.72)";
        const label = nb.kind === "vendor"
          ? `Visit ${BOOTHS.find((x) => x.vendorId === (nb as { vendorId: string }).vendorId)?.name ?? "Vendor"}`
          : nb.kind === "auction" ? "Join the auction"
          : nb.kind === "rumor" ? "Talk to the stranger"
          : nb.kind === "arcade" ? "Play the arcade cabinet"
          : "Leave the expo";
        c.font = "bold 13px system-ui";
        const w = c.measureText(label + "  [E]").width + 28;
        c.beginPath();
        c.roundRect(cw / 2 - w / 2, 14, w, 34, 17);
        c.fill();
        c.fillStyle = "#d1fae5";
        c.textAlign = "center";
        c.fillText(label + "  [E]", cw / 2, 36);
      }
    }

    let last = performance.now();
    function loop(now: number) {
      if (!running) return;
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      step(dt);
      draw();
      raf = requestAnimationFrame(loop);
    }
    raf = requestAnimationFrame(loop);

    function onKeyDown(e: KeyboardEvent) {
      const k = e.key.toLowerCase();
      if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(k)) e.preventDefault();
      keys[k] = true;
      if (k === "e" || k === "enter") interact();
    }
    function onKeyUp(e: KeyboardEvent) { keys[e.key.toLowerCase()] = false; }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    // Touch joystick
    const joyBase = document.getElementById("expo-joy-base");
    const joyKnob = document.getElementById("expo-joy-knob");
    let joyId: number | null = null;
    function joyStart(e: TouchEvent) {
      const t = e.changedTouches[0];
      joyId = t.identifier;
      joy.active = true;
      moveJoy(t.clientX, t.clientY);
    }
    function joyMove(e: TouchEvent) {
      for (const t of Array.from(e.changedTouches)) {
        if (t.identifier === joyId) moveJoy(t.clientX, t.clientY);
      }
    }
    function joyEnd(e: TouchEvent) {
      for (const t of Array.from(e.changedTouches)) {
        if (t.identifier === joyId) {
          joyId = null; joy.active = false; joy.dx = 0; joy.dy = 0;
          if (joyKnob) joyKnob.style.transform = "translate(0px,0px)";
        }
      }
    }
    function moveJoy(cx: number, cy: number) {
      if (!joyBase) return;
      const r = joyBase.getBoundingClientRect();
      const bx = r.left + r.width / 2, by = r.top + r.height / 2;
      let dx = (cx - bx) / (r.width / 2), dy = (cy - by) / (r.height / 2);
      const m = Math.hypot(dx, dy);
      if (m > 1) { dx /= m; dy /= m; }
      joy.dx = dx; joy.dy = dy;
      if (joyKnob) joyKnob.style.transform = `translate(${dx * 34}px,${dy * 34}px)`;
    }
    if (joyBase) {
      joyBase.addEventListener("touchstart", joyStart, { passive: true });
      window.addEventListener("touchmove", joyMove, { passive: true });
      window.addEventListener("touchend", joyEnd);
      window.addEventListener("touchcancel", joyEnd);
    }

    function onResize() { /* draw() resizes each frame */ }
    window.addEventListener("resize", onResize);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("resize", onResize);
      if (joyBase) joyBase.removeEventListener("touchstart", joyStart);
      window.removeEventListener("touchmove", joyMove);
      window.removeEventListener("touchend", joyEnd);
      window.removeEventListener("touchcancel", joyEnd);
    };
  }, [interact]);

  const nearbyLabel =
    nearby?.kind === "vendor"
      ? EXPO_VENDORS.find((v) => v.id === (nearby as { vendorId: string }).vendorId)?.name ?? "Vendor"
      : nearby?.kind === "auction" ? "Auction stage"
      : nearby?.kind === "rumor" ? "Mysterious stranger"
      : nearby?.kind === "arcade" ? "Arcade cabinet"
      : nearby?.kind === "exit" ? "Exit"
      : null;

  return (
    <div ref={wrapRef} className="relative w-full overflow-hidden rounded-[24px] border border-white/[.08] bg-black">
      <canvas ref={canvasRef} className="block w-full touch-none" />
      {/* Touch controls */}
      {showTouchUI ? (
        <>
          <div
            id="expo-joy-base"
            className="absolute bottom-5 left-5 grid h-28 w-28 place-items-center rounded-full border border-white/15 bg-black/45 backdrop-blur-sm"
          >
            <div id="expo-joy-knob" className="h-12 w-12 rounded-full bg-emerald-300/70 shadow-lg" />
          </div>
          <button
            type="button"
            onClick={interact}
            disabled={!nearby}
            className="absolute bottom-8 right-5 grid h-20 w-20 place-items-center rounded-full border border-emerald-200/30 bg-emerald-400/25 text-2xl backdrop-blur-sm transition disabled:opacity-30"
            aria-label={nearbyLabel ? `Interact: ${nearbyLabel}` : "Interact"}
          >
            ✋
          </button>
          {nearbyLabel ? (
            <div className="absolute left-1/2 top-3 -translate-x-1/2 rounded-full bg-black/70 px-4 py-2 text-xs font-bold text-emerald-100 backdrop-blur-sm">
              {nearbyLabel} — tap ✋
            </div>
          ) : null}
        </>
      ) : null}
      <div className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 text-[10px] uppercase tracking-[.18em] text-white/30">
        WASD / arrows to walk · E to interact
      </div>
    </div>
  );
}
