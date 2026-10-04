// Hank's default shop theme — a thin wrapper over the shared game-music
// player (src/lib/game-music.ts) so the shop shares the one persisted
// "always mute game music" switch with the rest of the game.

import {
  SHOP_THEME_SRC,
  SHOP_THEME_VOLUME,
  isGameMusicMuted,
  playGameMusic,
  setGameMusicMuted,
  stopGameMusic,
} from "@/lib/game-music";

export function isShopMusicMuted(): boolean {
  return isGameMusicMuted();
}

export function setShopMusicMuted(muted: boolean): void {
  setGameMusicMuted(muted);
  if (!muted) startShopMusic();
}

/** Start (or resume) Hank's shop theme. Safe to call on mount and from gestures. */
export function startShopMusic(): void {
  playGameMusic(SHOP_THEME_SRC, SHOP_THEME_VOLUME);
}

/** Fade the shop theme out and pause it. */
export function stopShopMusic(): void {
  stopGameMusic();
}
