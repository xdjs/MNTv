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

// ── Pete Rango — Oms at Play ────────────────────────────────────────────────
import prCasualListen1 from "./seed/peterango-casual-listen1.json";
import prCasualListen2 from "./seed/peterango-casual-listen2.json";
import prCasualListen3 from "./seed/peterango-casual-listen3.json";
import prCasualCompanion from "./seed/peterango-casual-companion.json";
import prCuriousListen1 from "./seed/peterango-curious-listen1.json";
import prCuriousListen2 from "./seed/peterango-curious-listen2.json";
import prCuriousListen3 from "./seed/peterango-curious-listen3.json";
import prCuriousCompanion from "./seed/peterango-curious-companion.json";
import prNerdListen1 from "./seed/peterango-nerd-listen1.json";
import prNerdListen2 from "./seed/peterango-nerd-listen2.json";
import prNerdListen3 from "./seed/peterango-nerd-listen3.json";
import prNerdCompanion from "./seed/peterango-nerd-companion.json";

// ── Aaron Doh — Love Hangover ───────────────────────────────────────────────
import adCasualListen1 from "./seed/aarondoh-casual-listen1.json";
import adCasualListen2 from "./seed/aarondoh-casual-listen2.json";
import adCasualListen3 from "./seed/aarondoh-casual-listen3.json";
import adCasualCompanion from "./seed/aarondoh-casual-companion.json";
import adCuriousListen1 from "./seed/aarondoh-curious-listen1.json";
import adCuriousListen2 from "./seed/aarondoh-curious-listen2.json";
import adCuriousListen3 from "./seed/aarondoh-curious-listen3.json";
import adCuriousCompanion from "./seed/aarondoh-curious-companion.json";
import adNerdListen1 from "./seed/aarondoh-nerd-listen1.json";
import adNerdListen2 from "./seed/aarondoh-nerd-listen2.json";
import adNerdListen3 from "./seed/aarondoh-nerd-listen3.json";
import adNerdCompanion from "./seed/aarondoh-nerd-companion.json";

// ── Jamee Cornelia — SLACK ──────────────────────────────────────────────────
import jcCasualListen1 from "./seed/jameecornelia-casual-listen1.json";
import jcCasualListen2 from "./seed/jameecornelia-casual-listen2.json";
import jcCasualListen3 from "./seed/jameecornelia-casual-listen3.json";
import jcCasualCompanion from "./seed/jameecornelia-casual-companion.json";
import jcCuriousListen1 from "./seed/jameecornelia-curious-listen1.json";
import jcCuriousListen2 from "./seed/jameecornelia-curious-listen2.json";
import jcCuriousListen3 from "./seed/jameecornelia-curious-listen3.json";
import jcCuriousCompanion from "./seed/jameecornelia-curious-companion.json";
import jcNerdListen1 from "./seed/jameecornelia-nerd-listen1.json";
import jcNerdListen2 from "./seed/jameecornelia-nerd-listen2.json";
import jcNerdListen3 from "./seed/jameecornelia-nerd-listen3.json";
import jcNerdCompanion from "./seed/jameecornelia-nerd-companion.json";

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
  "Pete Rango::Oms at Play": {
    casual: [prCasualListen1, prCasualListen2, prCasualListen3],
    curious: [prCuriousListen1, prCuriousListen2, prCuriousListen3],
    nerd: [prNerdListen1, prNerdListen2, prNerdListen3],
  },
  "Aaron Doh::Love Hangover": {
    casual: [adCasualListen1, adCasualListen2, adCasualListen3],
    curious: [adCuriousListen1, adCuriousListen2, adCuriousListen3],
    nerd: [adNerdListen1, adNerdListen2, adNerdListen3],
  },
  "Jamee Cornelia::SLACK": {
    casual: [jcCasualListen1, jcCasualListen2, jcCasualListen3],
    curious: [jcCuriousListen1, jcCuriousListen2, jcCuriousListen3],
    nerd: [jcNerdListen1, jcNerdListen2, jcNerdListen3],
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
  "Pete Rango::Oms at Play": {
    casual: prCasualCompanion,
    curious: prCuriousCompanion,
    nerd: prNerdCompanion,
  },
  "Aaron Doh::Love Hangover": {
    casual: adCasualCompanion,
    curious: adCuriousCompanion,
    nerd: adNerdCompanion,
  },
  "Jamee Cornelia::SLACK": {
    casual: jcCasualCompanion,
    curious: jcCuriousCompanion,
    nerd: jcNerdCompanion,
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
