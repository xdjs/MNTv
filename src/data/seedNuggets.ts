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

// ── Track slug mapping ──────────────────────────────────────────────────────

type Tier = "casual" | "curious" | "nerd";

/** Maps "Artist::Title" → the file-name slug used in src/data/seed/ */
const SEED_TRACKS: Record<string, string> = {
  "Daft Punk::Around the World": "daftpunk",
  "Radiohead::Weird Fishes/Arpeggi": "radiohead",
  "Pete Rango::Oms at Play": "peterango",
  "Aaron Doh::Love Hangover": "aarondoh",
  "Jamee Cornelia::SLACK": "jameecornelia",
};

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
