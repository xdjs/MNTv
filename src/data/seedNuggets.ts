/**
 * Seed data for demo tracks — pre-curated nuggets served instantly
 * without hitting the AI generation pipeline.
 *
 * JSON files are loaded on demand via dynamic import() so they don't
 * bloat the main bundle (~524 KB of seed data stays out of the index chunk).
 */

// ── Types ───────────────────────────────────────────────────────────────────

interface SeedNuggetData {
  headline: string;
  text: string;
  kind: "artist" | "track" | "discovery" | "context";
  listenFor?: boolean;
  imageUrl?: string;
  imageCaption?: string;
  source: {
    type: "youtube" | "article" | "interview";
    title: string;
    publisher: string;
    url?: string;
    embedId?: string;
    quoteSnippet?: string;
    locator?: string;
  };
}

interface SeedListenFile {
  nuggets: SeedNuggetData[];
}

interface SeedCompanionNugget {
  id: string;
  text: string;
  category: string;
  headline: string;
  imageUrl?: string | null;
  sourceUrl?: string;
  timestamp: number;
  sourceName?: string;
  imageCaption?: string | null;
  listenUnlockLevel: number;
}

interface SeedCompanionFile {
  nuggets: SeedCompanionNugget[];
  trackStory: string;
  artistSummary: string;
  externalLinks: { url: string; label: string }[];
}

// ── Demo track registry ─────────────────────────────────────────────────────

type Tier = "casual" | "curious" | "nerd";

export interface DemoTrackMeta {
  id: string;
  artist: string;
  title: string;
  album: string;
  /** Spotify track URI — the default/primary URI. Used when the user's service is Spotify. */
  trackUri: string;
  /** Optional Apple Music song URI — used when the user's service is Apple Music. */
  appleMusicUri?: string;
  coverArtUrl: string;
  /** File-name slug used in src/data/seed/ */
  slug: string;
}

/** All demo tracks — single source of truth for Browse tiles + Listen playback. */
export const DEMO_TRACKS: DemoTrackMeta[] = [
  { id: "demo-around-the-world", artist: "Daft Punk", title: "Around the World", album: "Homework", trackUri: "spotify:track:1pKYYY0dkg23sQQXi0Q5zN", appleMusicUri: "apple:song:1609438415", coverArtUrl: "https://i.scdn.co/image/ab67616d0000b2738ac778cc7d88779f74d33311", slug: "daftpunk" },
  { id: "demo-weird-fishes", artist: "Radiohead", title: "Weird Fishes/Arpeggi", album: "In Rainbows", trackUri: "spotify:track:4wajJ1o7jWIg62YqpkHC7S", coverArtUrl: "https://i.scdn.co/image/ab67616d0000b273de3c04b5fc750b68899b20a9", slug: "radiohead" },
  { id: "demo-oms-at-play", artist: "Pete Rango", title: "Oms at Play", album: "Savage Planet", trackUri: "spotify:track:7mYphBaMfblb6iu1saj3MC", coverArtUrl: "https://i.scdn.co/image/ab67616d0000b27305b43e15352510b1b9c9a5a5", slug: "peterango" },
  { id: "demo-slack", artist: "Jamee Cornelia", title: "SLACK", album: "HARVEST", trackUri: "spotify:track:5bU8cB57AfhTtO0qj9zy3X", coverArtUrl: "https://i.scdn.co/image/ab67616d0000b273e9c4a69ecd5c43229cfd03f3", slug: "jameecornelia" },
  { id: "demo-humble", artist: "Kendrick Lamar", title: "HUMBLE.", album: "DAMN.", trackUri: "spotify:track:7KXjTSCq5nL1LoYtL7XAwS", coverArtUrl: "https://i.scdn.co/image/ab67616d0000b2738b52c6b9bc4e43d873869699", slug: "kendrick" },
  { id: "demo-bad-guy", artist: "Billie Eilish", title: "bad guy", album: "WHEN WE ALL FALL ASLEEP, WHERE DO WE GO?", trackUri: "spotify:track:2Fxmhks0bxGSBdJ92vM42m", coverArtUrl: "https://i.scdn.co/image/ab67616d0000b27350a3147b4edd7701a876c6ce", slug: "billie" },
];

/**
 * Pick the right playable URI for this demo track based on the user's active service.
 *
 * CAUTION — silent Spotify fallback: Apple Music users asking for a demo
 * without an `appleMusicUri` will receive a `spotify:track:...` URI that
 * the Apple Music engine cannot play. Callers that route tracks into the
 * engine must pre-filter the demo list (see Listen.tsx's P5 fallback,
 * which filters `DEMO_TRACKS` by `!!d.appleMusicUri` for Apple users).
 * Browse.tsx is safe because every tile the user can click has an
 * `appleMusicUri` set when the demo appears in the catalog; once more
 * Apple IDs are added to DEMO_TRACKS in Phase 6b/7, this caveat shrinks.
 */
export function getDemoTrackUri(demo: DemoTrackMeta, service: string | undefined): string {
  if (service === "Apple Music" && demo.appleMusicUri) return demo.appleMusicUri;
  return demo.trackUri;
}

/** Look up a demo track by its simple ID (e.g. "demo-weird-fishes"). */
export function getDemoTrackById(id: string): DemoTrackMeta | null {
  return DEMO_TRACKS.find((t) => t.id === id) || null;
}

/** Maps "Artist::Title" → the file-name slug used in src/data/seed/ */
const SEED_TRACKS: Record<string, string> = Object.fromEntries(
  DEMO_TRACKS.map((t) => [`${t.artist}::${t.title}`, t.slug])
);

// ── Dynamic import helpers ──────────────────────────────────────────────────

// Vite requires the import path to start with a known prefix so it can
// discover which files to split into on-demand chunks. The glob pattern
// below covers all JSON files under ./seed/.
const seedModules = import.meta.glob<SeedListenFile | SeedCompanionFile>(
  "./seed/*.json"
);

async function loadSeedJson<T>(fileName: string): Promise<T | null> {
  const key = `./seed/${fileName}`;
  const loader = seedModules[key];
  if (!loader) return null;
  const mod = await loader();
  // Vite may wrap the default export in { default: ... } for JSON
  return ((mod as any).default ?? mod) as T;
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Check if a track is a seeded demo track. (Synchronous — no data loaded.)
 */
export function isSeedTrack(artist: string, title: string): boolean {
  return `${artist}::${title}` in SEED_TRACKS;
}

/**
 * Returns seed listen nuggets for a demo track, or `null` for non-demo tracks.
 * Listen count is clamped to 1–3 (4+ reuses listen3 data).
 */
export async function getSeedListenNuggets(
  artist: string,
  title: string,
  tier: Tier,
  listenCount: number
): Promise<SeedNuggetData[] | null> {
  const slug = SEED_TRACKS[`${artist}::${title}`];
  if (!slug) return null;

  const idx = Math.min(Math.max(listenCount, 1), 3); // 1, 2, or 3
  const fileName = `${slug}-${tier}-listen${idx}.json`;
  const data = await loadSeedJson<SeedListenFile>(fileName);
  return data?.nuggets ?? null;
}

/**
 * Returns seed companion data for a demo track, or `null` for non-demo tracks.
 */
export async function getSeedCompanion(
  artist: string,
  title: string,
  tier: Tier
): Promise<SeedCompanionFile | null> {
  const slug = SEED_TRACKS[`${artist}::${title}`];
  if (!slug) return null;

  const fileName = `${slug}-${tier}-companion.json`;
  return loadSeedJson<SeedCompanionFile>(fileName);
}
