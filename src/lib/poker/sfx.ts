// WebAudio SFX for the snake-poker arcade games, ported from the
// self-contained snake-poker HTML game (tone/noise/sfx/unlockAudio/toggleSound).
// All sounds are synthesized with oscillators and filtered noise buffers —
// there are no audio files to load. Safe to import during SSR: every entry
// point no-ops when `window` is unavailable.

export type SfxName =
  | "deal"
  | "flip"
  | "chip"
  | "win"
  | "lose"
  | "click"
  | "shuffle"
  | "draw"
  | "hold"
  | "double"
  | "royal";

const MUTE_STORAGE_KEY = "snake-poker-sfx-muted";

interface ArcadeAudioState {
  ctx: AudioContext | null;
  muted: boolean;
  unlocked: boolean;
  lastDeal: number;
}

const arcadeAudio: ArcadeAudioState = {
  ctx: null,
  muted: false,
  unlocked: false,
  lastDeal: 0,
};

let mutedLoaded = false;

function readPersistedMuted(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(MUTE_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function ensureMutedLoaded(): void {
  if (mutedLoaded) return;
  arcadeAudio.muted = readPersistedMuted();
  mutedLoaded = true;
}

/** Create/resume the shared AudioContext. Call from a user gesture. */
export function unlockAudio(): void {
  if (typeof window === "undefined") return;
  if (arcadeAudio.unlocked) return;
  const w = window as unknown as {
    AudioContext?: typeof AudioContext;
    webkitAudioContext?: typeof AudioContext;
  };
  const AC = w.AudioContext || w.webkitAudioContext;
  if (!AC) return;
  try {
    arcadeAudio.ctx = new AC();
    void arcadeAudio.ctx.resume();
    arcadeAudio.unlocked = true;
  } catch {
    // Arcade sound unavailable; playSfx stays silent.
  }
}

function tone(
  freq: number,
  duration: number,
  type: OscillatorType = "sine",
  gain = 0.035,
  delaySec = 0,
): void {
  const c = arcadeAudio.ctx;
  if (!c || arcadeAudio.muted) return;
  const o = c.createOscillator();
  const g = c.createGain();
  const t = c.currentTime + delaySec;
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
  o.connect(g);
  g.connect(c.destination);
  o.start(t);
  o.stop(t + duration + 0.02);
}

function noise(duration = 0.07, gain = 0.025, high = 900): void {
  const c = arcadeAudio.ctx;
  if (!c || arcadeAudio.muted) return;
  const len = Math.max(1, Math.floor(c.sampleRate * duration));
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = c.createBufferSource();
  const f = c.createBiquadFilter();
  const g = c.createGain();
  src.buffer = buf;
  f.type = "bandpass";
  f.frequency.value = high;
  g.gain.value = gain;
  src.connect(f);
  f.connect(g);
  g.connect(c.destination);
  src.start();
}

function dealSound(): void {
  // Throttled like the original: rapid multi-card deals don't stack the noise.
  const now = performance.now();
  if (now - arcadeAudio.lastDeal < 72) return;
  arcadeAudio.lastDeal = now;
  noise(0.085, 0.018, 1150);
  tone(170, 0.055, "triangle", 0.012);
}

/**
 * Play a named sound effect. No-op until unlockAudio() has run (and on the
 * server). `amount` only shapes the "win" jingle tiers, as in the original.
 */
export function playSfx(name: SfxName, amount = 0): void {
  if (typeof window === "undefined") return;
  ensureMutedLoaded();
  if (!arcadeAudio.unlocked || arcadeAudio.muted) return;
  switch (name) {
    case "deal":
    case "draw":
      dealSound();
      break;
    case "flip":
      noise(0.05, 0.012, 1600);
      tone(240, 0.04, "triangle", 0.01);
      break;
    case "chip":
      tone(720, 0.055, "square", 0.018);
      tone(980, 0.045, "square", 0.012, 0.025);
      break;
    case "click":
      tone(310, 0.045, "triangle", 0.016);
      break;
    case "shuffle":
      // Card riffle: three staggered noise bursts over soft ticks.
      for (let i = 0; i < 3; i++) {
        window.setTimeout(() => noise(0.05, 0.02, 2200), i * 80);
        tone(1500 - i * 250, 0.03, "triangle", 0.01, i * 0.08);
      }
      break;
    case "hold":
      tone(540, 0.06, "sine", 0.025);
      tone(720, 0.06, "sine", 0.018, 0.045);
      break;
    case "double":
      // Rising-stakes gamble jingle (the original "allin" figure).
      tone(210, 0.13, "sawtooth", 0.026);
      tone(310, 0.13, "sawtooth", 0.025, 0.12);
      tone(420, 0.2, "sawtooth", 0.022, 0.24);
      break;
    case "lose":
      tone(115, 0.24, "sine", 0.055);
      tone(82, 0.34, "sine", 0.035, 0.08);
      break;
    case "royal":
      // Original "natural" fanfare, used for royal flushes and blackjacks.
      [523, 659, 784, 1047].forEach((f, i) =>
        tone(f, 0.22, "triangle", 0.035, i * 0.09),
      );
      break;
    case "win": {
      const notes =
        amount >= 1000
          ? [392, 523, 659, 784]
          : amount >= 250
            ? [392, 494, 587]
            : [392, 494, 659];
      notes.forEach((f, i) => tone(f, 0.18, "triangle", 0.03, i * 0.08));
      break;
    }
  }
}

/** Mute/unmute arcade SFX; persists to localStorage. */
export function setSfxMuted(m: boolean): void {
  ensureMutedLoaded();
  arcadeAudio.muted = m;
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(MUTE_STORAGE_KEY, m ? "1" : "0");
    } catch {
      // Storage unavailable; the in-memory flag still applies.
    }
  }
  // The original toggleSound played a click when unmuting.
  if (!m) {
    unlockAudio();
    playSfx("click");
  }
}

export function isSfxMuted(): boolean {
  ensureMutedLoaded();
  return arcadeAudio.muted;
}
