export type RadioTrack = { title: string; file: string; seconds: number };

// Alphabetical for v1. Resequencing is just array order — when Gage supplies
// the intended album sequence, reorder this manifest.
export const LIZARD_MUSIC: RadioTrack[] = [
  { title: "1 Pitcher Sweet- NecTar", file: "1-pitcher-sweet-nectar.mp3", seconds: 228 },
  { title: "afterlight ecology",      file: "afterlight-ecology.mp3",      seconds: 283 },
  { title: "Arboreal",               file: "arboreal.mp3",                seconds: 325 },
  { title: "bugs in a log",          file: "bugs-in-a-log.mp3",           seconds: 315 },
  { title: "canopy memory",          file: "canopy-memory.mp3",           seconds: 298 },
  { title: "Drosera Lulaby",         file: "drosera-lulaby.mp3",          seconds: 375 },
  { title: "exit through the green", file: "exit-through-the-green.mp3", seconds: 274 },
  { title: "glass canopy_1",         file: "glass-canopy-1.mp3",          seconds: 222 },
  { title: "loopvine protocol (2)",  file: "loopvine-protocol-2.mp3",     seconds: 214 },
  { title: "mycelium drift",         file: "mycelium-drift.mp3",          seconds: 159 },
  { title: "neon underbrush",        file: "neon-underbrush.mp3",         seconds: 250 },
  { title: "orchid smoke",           file: "orchid-smoke.mp3",            seconds: 352 },
  { title: "root signal",            file: "root-signal.mp3",             seconds: 150 },
  { title: "signal bloom",           file: "signal-bloom.mp3",            seconds: 205 },
  { title: "sunwarm stone",          file: "sunwarm-stone.mp3",           seconds: 340 },
  { title: "Venus Silk",             file: "venus-silk.mp3",              seconds: 343 },
  { title: "warm rain static",       file: "warm-rain-static.mp3",        seconds: 337 },
];

// Env override wins; otherwise the Supabase public bucket (project URL is
// already public in the codebase). No NEXT_PUBLIC_* Vercel config needed.
export const RADIO_BASE_URL =
  process.env.NEXT_PUBLIC_LIZARD_MUSIC_URL ??
  "https://ykaqnxajszwgeqkmaora.supabase.co/storage/v1/object/public/lizard-music";

export const radioTrackUrl = (track: RadioTrack) =>
  `${RADIO_BASE_URL}/${encodeURIComponent(track.file)}`;

export const RADIO_ARTWORK_URL = "/branding/arboreal-planet-app-icon.webp";
