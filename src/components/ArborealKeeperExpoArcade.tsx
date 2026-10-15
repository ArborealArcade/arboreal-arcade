"use client";

import { useEffect, useRef, useState, useCallback } from "react";

const COLS = 20;
const ROWS = 16;
const CELL = 22;
const TICK_MS = 130;
const SCORE_KEY = "arboreal-expo-snake-highscore";

type Pt = { x: number; y: number };

export function ExpoArcadeDialog({ onClose }: { onClose: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [score, setScore] = useState(0);
  const [high, setHigh] = useState(() => {
    try {
      return Number(window.localStorage.getItem(SCORE_KEY) ?? 0) || 0;
    } catch {
      return 0;
    }
  });
  const [gameOver, setGameOver] = useState(false);
  const [started, setStarted] = useState(false);
  const stateRef = useRef<{
    snake: Pt[];
    dir: Pt;
    pending: Pt[];
    food: Pt;
    score: number;
    alive: boolean;
  } | null>(null);

  const reset = useCallback(() => {
    const cx = Math.floor(COLS / 2), cy = Math.floor(ROWS / 2);
    stateRef.current = {
      snake: [{ x: cx, y: cy }, { x: cx - 1, y: cy }, { x: cx - 2, y: cy }],
      dir: { x: 1, y: 0 },
      pending: [],
      food: spawnFood([{ x: cx, y: cy }]),
      score: 0,
      alive: true,
    };
    setScore(0);
    setGameOver(false);
    setStarted(true);
  }, []);

  function spawnFood(snake: Pt[]): Pt {
    for (let i = 0; i < 200; i++) {
      const p = { x: Math.floor(Math.random() * COLS), y: Math.floor(Math.random() * ROWS) };
      if (!snake.some((s) => s.x === p.x && s.y === p.y)) return p;
    }
    return { x: 0, y: 0 };
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const c: CanvasRenderingContext2D = ctx;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = COLS * CELL * dpr;
    canvas.height = ROWS * CELL * dpr;
    canvas.style.width = COLS * CELL + "px";
    canvas.style.height = ROWS * CELL + "px";
    c.setTransform(dpr, 0, 0, dpr, 0, 0);

    let last = performance.now();
    let acc = 0;
    let raf = 0;
    let running = true;

    function tick() {
      const st = stateRef.current;
      if (!st || !st.alive) return;
      if (st.pending.length) st.dir = st.pending.shift()!;
      const head = { x: st.snake[0].x + st.dir.x, y: st.snake[0].y + st.dir.y };
      // Wall or self collision
      if (
        head.x < 0 || head.x >= COLS || head.y < 0 || head.y >= ROWS ||
        st.snake.some((s) => s.x === head.x && s.y === head.y)
      ) {
        st.alive = false;
        setGameOver(true);
        setHigh((h) => {
          const nh = Math.max(h, st.score);
          try { window.localStorage.setItem(SCORE_KEY, String(nh)); } catch {}
          return nh;
        });
        return;
      }
      st.snake.unshift(head);
      if (head.x === st.food.x && head.y === st.food.y) {
        st.score += 10;
        setScore(st.score);
        st.food = spawnFood(st.snake);
      } else {
        st.snake.pop();
      }
    }

    function draw() {
      c.fillStyle = "#020617";
      c.fillRect(0, 0, COLS * CELL, ROWS * CELL);
      // grid
      c.strokeStyle = "#0f172a";
      c.lineWidth = 1;
      for (let x = 0; x <= COLS; x++) { c.beginPath(); c.moveTo(x * CELL, 0); c.lineTo(x * CELL, ROWS * CELL); c.stroke(); }
      for (let y = 0; y <= ROWS; y++) { c.beginPath(); c.moveTo(0, y * CELL); c.lineTo(COLS * CELL, y * CELL); c.stroke(); }

      const st = stateRef.current;
      if (!st) {
        c.fillStyle = "#22d3ee";
        c.font = "bold 18px system-ui";
        c.textAlign = "center";
        c.fillText("INSERT COIN — press Start", (COLS * CELL) / 2, (ROWS * CELL) / 2);
        return;
      }
      // food (mouse)
      c.fillStyle = "#f472b6";
      c.beginPath();
      c.arc(st.food.x * CELL + CELL / 2, st.food.y * CELL + CELL / 2, CELL / 2 - 4, 0, Math.PI * 2);
      c.fill();
      // snake
      st.snake.forEach((s, i) => {
        const t = 1 - i / st.snake.length;
        c.fillStyle = i === 0 ? "#4ade80" : `rgba(34,197,94,${0.35 + t * 0.55})`;
        c.beginPath();
        c.roundRect(s.x * CELL + 2, s.y * CELL + 2, CELL - 4, CELL - 4, 6);
        c.fill();
        if (i === 0) {
          c.fillStyle = "#052e16";
          const ex = s.x * CELL + CELL / 2, ey = s.y * CELL + CELL / 2;
          c.beginPath();
          c.arc(ex - 4, ey - 3, 2.2, 0, Math.PI * 2);
          c.arc(ex + 4, ey - 3, 2.2, 0, Math.PI * 2);
          c.fill();
        }
      });
    }

    function loop(now: number) {
      if (!running) return;
      acc += now - last;
      last = now;
      while (acc >= TICK_MS) { acc -= TICK_MS; if (started) tick(); }
      draw();
      raf = requestAnimationFrame(loop);
    }
    raf = requestAnimationFrame(loop);

    function onKey(e: KeyboardEvent) {
      const st = stateRef.current;
      if (!st || !started || gameOver) return;
      const k = e.key.toLowerCase();
      const cur = st.pending.length ? st.pending[st.pending.length - 1] : st.dir;
      let nd: Pt | null = null;
      if ((k === "arrowup" || k === "w") && cur.y !== 1) nd = { x: 0, y: -1 };
      else if ((k === "arrowdown" || k === "s") && cur.y !== -1) nd = { x: 0, y: 1 };
      else if ((k === "arrowleft" || k === "a") && cur.x !== 1) nd = { x: -1, y: 0 };
      else if ((k === "arrowright" || k === "d") && cur.x !== -1) nd = { x: 1, y: 0 };
      if (nd && st.pending.length < 3) { st.pending.push(nd); e.preventDefault(); }
    }
    window.addEventListener("keydown", onKey);
    return () => { running = false; cancelAnimationFrame(raf); window.removeEventListener("keydown", onKey); };
  }, [started, gameOver]);

  // Touch swipe controls
  const touchRef = useRef<Pt | null>(null);
  function onTouchStart(e: React.TouchEvent) {
    touchRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }
  function onTouchEnd(e: React.TouchEvent) {
    const st = stateRef.current;
    const start = touchRef.current;
    touchRef.current = null;
    if (!st || !started || gameOver || !start) return;
    const dx = e.changedTouches[0].clientX - start.x;
    const dy = e.changedTouches[0].clientY - start.y;
    if (Math.hypot(dx, dy) < 24) return;
    const cur = st.pending.length ? st.pending[st.pending.length - 1] : st.dir;
    let nd: Pt | null = null;
    if (Math.abs(dx) > Math.abs(dy)) nd = dx > 0 ? { x: 1, y: 0 } : { x: -1, y: 0 };
    else nd = dy > 0 ? { x: 0, y: 1 } : { x: 0, y: -1 };
    if (nd && (nd.x !== -cur.x || nd.y !== -cur.y) && st.pending.length < 3) st.pending.push(nd);
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/80 p-3 backdrop-blur-sm">
      <div className="w-full max-w-[520px] overflow-hidden rounded-[26px] border border-cyan-300/25 bg-[#0a0a1a] shadow-2xl">
        <div className="flex items-center justify-between border-b border-cyan-300/15 p-4">
          <div>
            <div className="text-[9px] font-black uppercase tracking-[.18em] text-cyan-300/70">🕹️ Expo arcade corner</div>
            <h2 className="text-lg font-bold text-white">SNAKE!</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-9 w-9 place-items-center rounded-full border border-white/10 bg-white/[.04] text-white/60 hover:text-white"
            aria-label="Close arcade"
          >
            ✕
          </button>
        </div>
        <div className="flex flex-col items-center p-4">
          <div className="mb-3 flex w-full items-center justify-between text-sm">
            <span className="text-white/50">Score: <span className="font-black text-cyan-200">{score}</span></span>
            <span className="text-white/50">Best: <span className="font-black text-amber-200">{high}</span></span>
          </div>
          <div
            className="touch-none overflow-hidden rounded-2xl border border-cyan-300/20"
            onTouchStart={onTouchStart}
            onTouchEnd={onTouchEnd}
          >
            <canvas ref={canvasRef} className="block max-w-full" />
          </div>
          <div className="mt-4 flex gap-2">
            {!started || gameOver ? (
              <button
                type="button"
                onClick={reset}
                className="rounded-xl bg-cyan-400/20 px-6 py-2.5 text-xs font-bold text-cyan-100 hover:bg-cyan-400/30"
              >
                {gameOver ? "↻ Play again" : "▶ Start"}
              </button>
            ) : null}
          </div>
          <p className="mt-3 text-center text-[11px] text-white/35">
            Arrows / WASD or swipe to steer. Eat the pink mice. Don&apos;t hit the walls.
            {score >= 100 ? " 🎉 New personal best pace!" : ""}
          </p>
        </div>
      </div>
    </div>
  );
}
