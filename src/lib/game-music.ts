// Game music — one shared, looping MP3 player for in-game music (shop theme,
// expedition theme, future tracks) with a single persisted mute: the "always
// mute game music" switch. Hank's voice lines play at full volume on their
// own channel; every track here sits underneath them.
//
// Autoplay policies require a user gesture before audio can start, so a
// blocked first start retries once on the next pointer/key interaction.
// Missing audio files fail silently (a 404 just rejects the play() promise)
// so music can be wired before its MP3 lands.

export const SHOP_THEME_SRC = "/hatchery/game/music/hank-shop-theme.mp3";
export const SHOP_THEME_VOLUME = 0.18;
export const HALLOWEEN_THEME_SRC = "/hatchery/game/music/hank-halloween-theme.mp3";
export const HALLOWEEN_COSTUME_THEME_SRC =
  "/hatchery/game/music/hank-halloween-costume-theme.mp3";
export const CANOPY_THEME_SRC = "/hatchery/game/music/canopy-hunter-theme.mp3";
export const CANOPY_THEME_VOLUME = 0.5;

const FADE_MS = 1500;
const MUTE_KEY = "arboreal-game-music-muted";

let audio: HTMLAudioElement | null = null;
let currentSrc: string | null = null;
let fadeGen = 0;
let gestureRetryArmed = false;
let lastRequest: { src: string; volume: number } | null = null;

export function isGameMusicMuted(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

/** The one mute for all game music. Turning it off is up to each scene to resume its own track. */
export function setGameMusicMuted(muted: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
  } catch {
    // storage unavailable — mute state just won't persist
  }
  if (muted) stopGameMusic();
  window.dispatchEvent(new CustomEvent("game-music-mute-changed"));
}

function fadeTo(target: number, done?: () => void): void {
  if (!audio) return;
  const el = audio;
  const gen = ++fadeGen;
  const from = el.volume;
  const start = performance.now();
  const step = (now: number) => {
    if (gen !== fadeGen || audio !== el) return; // superseded
    const t = Math.min(1, (now - start) / FADE_MS);
    el.volume = from + (target - from) * t;
    if (t < 1) {
      requestAnimationFrame(step);
    } else if (done) {
      done();
    }
  };
  requestAnimationFrame(step);
}

function ensureAudio(): HTMLAudioElement | null {
  if (typeof window === "undefined") return null;
  if (!audio) {
    try {
      audio = new Audio();
    } catch {
      return null;
    }
    audio.loop = true;
    audio.preload = "auto";
    audio.volume = 0;
  }
  return audio;
}

/**
 * Play a looping music track, fading in. Calling with the track already
 * playing is a no-op; a different track switches seamlessly.
 */
export function playGameMusic(src: string, volume: number): void {
  if (typeof window === "undefined" || isGameMusicMuted()) return;
  const el = ensureAudio();
  if (!el) return;
  lastRequest = { src, volume };
  if (currentSrc !== src) {
    currentSrc = src;
    el.src = src;
    try {
      el.currentTime = 0;
    } catch {
      // not seekable yet — harmless
    }
  }
  if (!el.paused && el.volume >= volume * 0.99) return; // already playing
  const attempt = el.play();
  if (attempt && typeof attempt.catch === "function") {
    attempt.catch(() => {
      // Autoplay blocked — retry on the next user gesture.
      if (gestureRetryArmed) return;
      gestureRetryArmed = true;
      const retry = () => {
        gestureRetryArmed = false;
        window.removeEventListener("pointerdown", retry);
        window.removeEventListener("keydown", retry);
        if (lastRequest) playGameMusic(lastRequest.src, lastRequest.volume);
      };
      window.addEventListener("pointerdown", retry);
      window.addEventListener("keydown", retry);
    });
  }
  fadeTo(volume);
}

/** Fade the music out and pause it. The element is kept warm for resume. */
export function stopGameMusic(): void {
  if (!audio) return;
  lastRequest = null;
  fadeTo(0, () => {
    try {
      audio?.pause();
    } catch {
      // ignore
    }
  });
}
