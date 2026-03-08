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
  kind: "artist" | "track" | "discovery";
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
  spotifyUri: string;
  coverArtUrl: string;
  /** File-name slug used in src/data/seed/ */
  slug: string;
}

/** All demo tracks — single source of truth for Browse tiles + Listen playback. */
export const DEMO_TRACKS: DemoTrackMeta[] = [
  { id: "demo-around-the-world", artist: "Daft Punk", title: "Around the World", album: "Homework", spotifyUri: "spotify:track:1pKYYY0dkg23sQQXi0Q5zN", coverArtUrl: "https://i.scdn.co/image/ab67616d0000b2738ac778cc7d88779f74d33311", slug: "daftpunk" },
  { id: "demo-weird-fishes", artist: "Radiohead", title: "Weird Fishes/Arpeggi", album: "In Rainbows", spotifyUri: "spotify:track:4tha3dahOS9LhTxKn4JYLC", coverArtUrl: "https://i.scdn.co/image/ab67616d0000b273de3c04b5fc750b68899b20a9", slug: "radiohead" },
  { id: "demo-oms-at-play", artist: "Pete Rango", title: "Oms at Play", album: "Savage Planet", spotifyUri: "spotify:track:7mYphBaMfblb6iu1saj3MC", coverArtUrl: "https://i.scdn.co/image/ab67616d0000b27305b43e15352510b1b9c9a5a5", slug: "peterango" },
  { id: "demo-love-hangover", artist: "Aaron Doh", title: "Love Hangover", album: "Love Lies", spotifyUri: "spotify:track:2N8zd5nKHrjhDgo78ZhtWl", coverArtUrl: "https://i.scdn.co/image/ab67616d0000b273bcdeee598b7cfab69f0dce68", slug: "aarondoh" },
  { id: "demo-slack", artist: "Jamee Cornelia", title: "SLACK", album: "HARVEST", spotifyUri: "spotify:track:5bU8cB57AfhTtO0qj9zy3X", coverArtUrl: "https://i.scdn.co/image/ab67616d0000b273e9c4a69ecd5c43229cfd03f3", slug: "jameecornelia" },
];

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
