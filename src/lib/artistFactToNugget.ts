import type { Nugget, Source } from "@/mock/types";
import type { ArtistUpdate } from "@/hooks/useArtistUpdates";
import { isSafeUrl } from "./urlSafety";

// Converts an artist-level fact from Browse into a nugget Listen can show.
//
// The two generators write to the same table under different namespaces —
// artist-updates keys by `artist::<name>::<tier>`, generate-nuggets by
// track — so research done for Browse is invisible to Listen and gets
// regenerated from scratch. This is the shape mapping that lets Listen
// reuse it while its own generation runs.
//
// See docs/superpowers/specs/2026-07-29-artist-fact-reuse-design.md.

/** Prefix so a reused artist fact can never collide with, or be mistaken
 *  for, a nugget produced by generate-nuggets. */
export const ARTIST_FACT_ID_PREFIX = "artistfact";

/**
 * The `nugget_cache.track_id` under which artist-updates stores an
 * artist's row. MUST match `cacheKey()` in the artist-updates edge
 * function — if the two drift, this silently reads nothing and the
 * feature degrades to "no seed" with no error anywhere.
 */
export function buildArtistUpdatesCacheKey(artistName: string, tier: string): string {
  return `artist::${artistName.trim().toLowerCase()}::${tier}`;
}

/** Matches makeSparseFallbackNugget so a seeded fact is indistinguishable
 *  from a normal opening nugget. */
const SEEDED_DURATION_MS = 7000;

/**
 * Only `fact` kinds convert. Release, collab and track updates are Browse
 * surface concepts — a "new single out" card is not a fact about the
 * music, and showing it mid-listen would read as an ad.
 */
export function isReusableArtistFact(update: ArtistUpdate): boolean {
  return update.kind === "fact" && !!update.headline?.trim() && !!update.body?.trim();
}

/**
 * Build a nugget + source pair from an artist fact.
 *
 * Returns null when the update isn't reusable, so callers can filter
 * without a second predicate call.
 *
 * `trackId` is the CURRENTLY PLAYING track, not the artist — the nugget
 * belongs to this listen, and cache keys downstream are track-scoped.
 */
export function artistFactToNugget(
  update: ArtistUpdate,
  trackId: string,
): { nugget: Nugget; source: Source } | null {
  if (!isReusableArtistFact(update)) return null;

  const idBase = update.nuggetId || update.headline.slice(0, 40);
  const nuggetId = `${ARTIST_FACT_ID_PREFIX}-${idBase}`;
  const sourceId = `${ARTIST_FACT_ID_PREFIX}-src-${idBase}`;

  // The publisher/title are Exa-derived and the URL is rendered as a
  // link, so it gets the same scheme guard the rest of the app applies.
  // An unsafe or missing URL degrades to no link rather than dropping
  // the fact — the copy is still worth reading.
  const rawUrl = update.source?.url;
  const url = isSafeUrl(rawUrl) ? rawUrl! : "";

  return {
    nugget: {
      id: nuggetId,
      trackId,
      // Pinned to 0 like the sparse fallback, so it opens the listen.
      timestampSec: 0,
      durationMs: SEEDED_DURATION_MS,
      headline: update.headline,
      text: update.body,
      // Renders as "The Artist" in the immersive view, which is exactly
      // what this is — a fact about the artist, not the recording.
      kind: "artist",
      listenFor: false,
      sourceId,
      imageUrl: update.artistImageUrl || undefined,
    },
    source: {
      id: sourceId,
      // ArtistUpdate.source.type is free-form (Exa / Spotify), while
      // Source.type is a narrow union. Anything that isn't a known
      // media kind is journalism as far as the UI is concerned.
      type: "article",
      title: update.source?.title || update.headline,
      publisher: update.source?.publisher || update.artistName,
      url,
    },
  };
}

/**
 * Pick the artist facts worth seeding a listen with.
 *
 * Capped deliberately: this fills the opening slot while track-specific
 * research runs. It must not crowd out the material that follows, which
 * is the actual point of the listen.
 */
export function selectSeedFacts(
  updates: ArtistUpdate[] | null | undefined,
  trackId: string,
  limit = 1,
): { nuggets: Nugget[]; sources: Source[] } {
  const nuggets: Nugget[] = [];
  const sources: Source[] = [];
  for (const update of updates ?? []) {
    if (nuggets.length >= limit) break;
    const converted = artistFactToNugget(update, trackId);
    if (!converted) continue;
    nuggets.push(converted.nugget);
    sources.push(converted.source);
  }
  return { nuggets, sources };
}

/** Normalised headline, for matching a seeded fact against one that
 *  wave-1 produced independently. */
function headlineKey(headline: string | undefined): string {
  return (headline ?? "").trim().toLowerCase().replace(/\s+/g, " ").replace(/[.!?]+$/, "");
}

/**
 * Drop seeded artist facts that generated nuggets have since duplicated.
 *
 * Wave-1 can independently produce the same fact, and seeing it twice in
 * one listen is worse than never reusing it. Drops the SEEDED copy rather
 * than the generated one: the generated nugget is track-scoped, properly
 * timestamped, and carries a real citation.
 */
export function dropDuplicatedSeeds(
  seeded: readonly Nugget[],
  generated: readonly Nugget[],
): Nugget[] {
  if (generated.length === 0) return [...seeded];
  const generatedKeys = new Set(generated.map((n) => headlineKey(n.headline || n.text)));
  return seeded.filter((s) => !generatedKeys.has(headlineKey(s.headline || s.text)));
}
