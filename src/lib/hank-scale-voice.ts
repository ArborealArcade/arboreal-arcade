// Hank Scale / "Snake Hill" shopkeeper voice lines for the Arboreal Keeper game.
// Tiny client-side player: one line at a time, never overlapping, with a
// persisted mute toggle. Missing audio files fail silently (a 404 just
// rejects the play() promise) so lines can be wired before their MP3 lands.

const BASE = "/hatchery/game/voice/snake-hill";
const HALLOWEEN_BASE = "/hatchery/game/voice/snake-hill-halloween";
const MUTE_KEY = "hank-scale-voice-muted";

// Line number -> audio file. All 28 lines have MP3s in place.
const LINE_FILES: Record<number, string> = {
  1: "line-01.mp3", // greeting
  2: "line-02.mp3", // animals tab
  3: "line-03.mp3", // housing tip
  4: "line-04.mp3", // neonate tip
  5: "line-05.mp3", // breeding tip
  6: "line-06.mp3", // player market tip
  7: "line-07.mp3", // holdback tip
  8: "line-08.mp3", // sign-off
  9: "line-09.mp3", // purchase success
  10: "line-10.mp3", // not enough funds
  11: "line-11.mp3", // fresh stock
  12: "line-12.mp3", // enclosure praise
  13: "line-13.mp3", // accessories
  14: "line-14.mp3", // breeding how-to
  15: "line-15.mp3", // idle browse
  16: "line-16.mp3", // farewell
  17: "line-17.mp3", // returning player welcome
  18: "line-18.mp3", // already sold
  19: "line-19.mp3", // no housing available
  20: "line-20.mp3", // player market empty
  21: "line-21.mp3", // collection milestone
  22: "line-22.mp3", // "I sell snakes and snake accessories."
  23: "line-23.mp3", // two-tap confirm: "Tap it again if you're sure, son."
  24: "line-24.mp3", // proceeds claimed: "Money on the counter — much obliged!"
  25: "line-25.mp3", // Canopy Hunter: catch success
  26: "line-26.mp3", // Canopy Hunter: catch failed
  27: "line-27.mp3", // blackjack: win
  28: "line-28.mp3", // blackjack: loss
};

let current: HTMLAudioElement | null = null;

export function isHankScaleMuted(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

export function setHankScaleMuted(muted: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
  } catch {
    // storage unavailable — play state just won't persist
  }
  if (muted) {
    try {
      current?.pause();
    } catch {
      // ignore
    }
    current = null;
  }
  window.dispatchEvent(new CustomEvent("hank-scale-mute-changed"));
}

/** Play a Hank Scale voice line by number (1-28). Stops any line already playing. */
export function playHankScaleLine(n: number): void {
  const file = LINE_FILES[n];
  if (!file) return;
  playHankScaleSrc(`${BASE}/${file}`);
}

// Halloween shop lines (snake-hill-halloween/halloween-1..6.mp3), matching
// the HANK_TIPS order in ArborealKeeperReptiShopHalloween.tsx. Only the
// Halloween shop plays these; the default shop keeps the 28 original lines.
const HALLOWEEN_LINE_FILES: Record<number, string> = {
  1: "halloween-1.mp3", // haunted shop greeting
  2: "halloween-2.mp3", // night owls tip
  3: "halloween-3.mp3", // black-cat morph tip
  4: "halloween-4.mp3", // pumpkin enclosures tip
  5: "halloween-5.mp3", // player market tip
  6: "halloween-6.mp3", // holdbacks tip
};

/** Play a Halloween Hank Scale voice line by number (1-6). Stops any line already playing. */
export function playHankScaleHalloweenLine(n: number): void {
  const file = HALLOWEEN_LINE_FILES[n];
  if (!file) return;
  playHankScaleSrc(`${HALLOWEEN_BASE}/${file}`);
}

/** Play any Hank Scale audio file by public path (e.g. site section intros). */
export function playHankScaleAudio(src: string): void {
  playHankScaleSrc(src);
}

function playHankScaleSrc(src: string): void {
  if (typeof window === "undefined" || isHankScaleMuted()) return;
  try {
    current?.pause();
    const audio = new Audio(src);
    current = audio;
    audio.play().catch(() => {
      // autoplay blocked or file missing — stay silent
    });
  } catch {
    // Audio unavailable — stay silent
  }
}

const STOCK_ROTATED_KEY = "hank-scale-stock-rotated";


/** Stop any Hank Scale voice line currently playing (e.g. when leaving the game). */
export function stopHankScaleVoice(): void {
  try {
    current?.pause();
  } catch {
    // ignore
  }
  current = null;
}

/** Flag that shop stock rotated since the player last opened the animals tab. */
export function markStockRotated(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STOCK_ROTATED_KEY, "1");
  } catch {
    // storage unavailable
  }
}

/** Returns true once when stock rotated since the last animals-tab visit. */
export function consumeStockRotated(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (window.localStorage.getItem(STOCK_ROTATED_KEY) === "1") {
      window.localStorage.removeItem(STOCK_ROTATED_KEY);
      return true;
    }
  } catch {
    // storage unavailable
  }
  return false;
}
