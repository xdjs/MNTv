/**
 * Seed data for demo tracks — pre-curated nuggets served instantly
 * without hitting the AI generation pipeline.
 */

// ── Daft Punk — Around the World ────────────────────────────────────────────
import dpCasualListen1 from "./seed/daftpunk-casual-listen1.json";
import dpCasualListen2 from "./seed/daftpunk-casual-listen2.json";
import dpCasualListen3 from "./seed/daftpunk-casual-listen3.json";
import dpCasualCompanion from "./seed/daftpunk-casual-companion.json";
import dpCuriousListen1 from "./seed/daftpunk-curious-listen1.json";
import dpCuriousListen2 from "./seed/daftpunk-curious-listen2.json";
import dpCuriousListen3 from "./seed/daftpunk-curious-listen3.json";
import dpCuriousCompanion from "./seed/daftpunk-curious-companion.json";
import dpNerdListen1 from "./seed/daftpunk-nerd-listen1.json";
import dpNerdListen2 from "./seed/daftpunk-nerd-listen2.json";
import dpNerdListen3 from "./seed/daftpunk-nerd-listen3.json";
import dpNerdCompanion from "./seed/daftpunk-nerd-companion.json";

// ── Radiohead — Weird Fishes/Arpeggi ────────────────────────────────────────
import rhCasualListen1 from "./seed/radiohead-casual-listen1.json";
import rhCasualListen2 from "./seed/radiohead-casual-listen2.json";
import rhCasualListen3 from "./seed/radiohead-casual-listen3.json";
import rhCasualCompanion from "./seed/radiohead-casual-companion.json";
import rhCuriousListen1 from "./seed/radiohead-curious-listen1.json";
import rhCuriousListen2 from "./seed/radiohead-curious-listen2.json";
import rhCuriousListen3 from "./seed/radiohead-curious-listen3.json";
import rhCuriousCompanion from "./seed/radiohead-curious-companion.json";
import rhNerdListen1 from "./seed/radiohead-nerd-listen1.json";
import rhNerdListen2 from "./seed/radiohead-nerd-listen2.json";
import rhNerdListen3 from "./seed/radiohead-nerd-listen3.json";
import rhNerdCompanion from "./seed/radiohead-nerd-companion.json";

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

// ── Lookup tables ───────────────────────────────────────────────────────────

type Tier = "casual" | "curious" | "nerd";

const listenMap: Record<string, Record<Tier, [SeedListenFile, SeedListenFile, SeedListenFile]>> = {
  "Daft Punk::Around the World": {
    casual: [dpCasualListen1, dpCasualListen2, dpCasualListen3],
    curious: [dpCuriousListen1, dpCuriousListen2, dpCuriousListen3],
    nerd: [dpNerdListen1, dpNerdListen2, dpNerdListen3],
  },
  "Radiohead::Weird Fishes/Arpeggi": {
    casual: [rhCasualListen1, rhCasualListen2, rhCasualListen3],
    curious: [rhCuriousListen1, rhCuriousListen2, rhCuriousListen3],
    nerd: [rhNerdListen1, rhNerdListen2, rhNerdListen3],
  },
};

const companionMap: Record<string, Record<Tier, SeedCompanionFile>> = {
  "Daft Punk::Around the World": {
    casual: dpCasualCompanion,
    curious: dpCuriousCompanion,
    nerd: dpNerdCompanion,
  },
  "Radiohead::Weird Fishes/Arpeggi": {
    casual: rhCasualCompanion,
    curious: rhCuriousCompanion,
    nerd: rhNerdCompanion,
  },
};

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Returns seed listen nuggets for a demo track, or `null` for non-demo tracks.
 * Listen count is clamped to 1–3 (4+ reuses listen3 data).
 */
export function getSeedListenNuggets(
  artist: string,
  title: string,
  tier: Tier,
  listenCount: number
): SeedNuggetData[] | null {
  const key = `${artist}::${title}`;
  const tierFiles = listenMap[key]?.[tier];
  if (!tierFiles) return null;

  const idx = Math.min(Math.max(listenCount, 1), 3) - 1; // 0, 1, or 2
  return tierFiles[idx].nuggets;
}

/**
 * Returns seed companion data for a demo track, or `null` for non-demo tracks.
 */
export function getSeedCompanion(
  artist: string,
  title: string,
  tier: Tier
): SeedCompanionFile | null {
  const key = `${artist}::${title}`;
  return companionMap[key]?.[tier] ?? null;
}

/**
 * Check if a track is a seeded demo track.
 */
export function isSeedTrack(artist: string, title: string): boolean {
  return `${artist}::${title}` in listenMap;
}
