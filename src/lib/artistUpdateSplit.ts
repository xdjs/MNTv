import type { ArtistUpdate } from "@/hooks/useArtistUpdates";

// Splits one artist's updates into the two lanes the Browse row renders:
// fact cards to read, and tracks to play.
//
// Kept as a pure function rather than living inside ArtistUpdatesSection
// because the interesting part is the resolution rules — which updates
// count as playable, and what a fact card falls back to when it has no
// track of its own. Those rules are worth testing without rendering.

/** A track the user can start playing from the Browse row. */
export interface PlayableTrack {
  title: string;
  album: string;
  /** Spotify track URI when known. Absent for Apple users and for
   *  releases whose track lookup failed server-side. */
  uri?: string;
  /** Cover art. Release/collab updates carry the album image in
   *  artistImageUrl, so a track tile can look like the rest of the
   *  cards instead of a bare pill. */
  imageUrl?: string;
}

export interface ArtistLanes {
  /** Cards to render. Each one taps through to either a song or a fact. */
  facts: ArtistUpdate[];
  /**
   * Play targets, de-duplicated by title. NOT rendered as their own lane
   * — an earlier design showed these as a "Get into" strip, which put a
   * new release in two places at once (its own card AND a tile) and read
   * as a bug. They exist so a card whose update names no track of its own
   * still has something to play.
   */
  tracks: PlayableTrack[];
}

const PLAYABLE_KINDS = new Set<ArtistUpdate["kind"]>(["new-release", "collab", "track"]);

/** An update is playable only if we know what track to play. */
function toPlayableTrack(update: ArtistUpdate): PlayableTrack | null {
  if (!PLAYABLE_KINDS.has(update.kind)) return null;
  if (!update.relatedTrackTitle) return null;
  return {
    title: update.relatedTrackTitle,
    album: update.relatedAlbumName ?? "",
    uri: update.relatedTrackUri,
    // For release/collab kinds this field holds the album cover, not an
    // artist photo — see buildReleaseUpdate in the artist-updates
    // edge function.
    imageUrl: update.artistImageUrl || undefined,
  };
}

/**
 * Partition an artist's updates.
 *
 * Release/collab updates that never resolved a track title stay in the
 * fact lane rather than disappearing — the copy is still worth reading,
 * it just has nothing to play. Dropping them would silently lose content
 * whenever the server's album-track lookup failed.
 *
 * `extraTracks` accepts catalog tracks supplied by the edge function. It
 * is optional so the section works today, before that field exists, and
 * gets denser once it does.
 */
export function splitArtistUpdates(
  updates: ArtistUpdate[] | null | undefined,
  extraTracks: readonly PlayableTrack[] = [],
): ArtistLanes {
  const facts: ArtistUpdate[] = [];
  const tracks: PlayableTrack[] = [];
  const seenTitles = new Set<string>();

  const pushTrack = (track: PlayableTrack) => {
    const key = track.title.trim().toLowerCase();
    if (!key || seenTitles.has(key)) return;
    seenTitles.add(key);
    tracks.push(track);
  };

  for (const update of updates ?? []) {
    const playable = toPlayableTrack(update);
    if (playable) pushTrack(playable);

    // "track" kinds are catalog entries with no body — they exist only
    // to fill the play lane. Everything else is readable copy and
    // belongs in the fact lane, including a release card, which is both
    // a thing to read and a thing to play.
    if (update.kind !== "track") facts.push(update);
  }

  for (const track of extraTracks) pushTrack(track);

  return { facts, tracks };
}

/** Prefer the card's own release. Album URIs are resolved by the playback
 * hook to a song from that album, never replaced with another artist track. */
export function resolvePlayTarget(
  update: ArtistUpdate,
  tracks: readonly PlayableTrack[],
): PlayableTrack | null {
  const own = toPlayableTrack(update);
  if (own) return own;
  // A release without enough identifying data must not play another release.
  if (update.kind === "new-release" || update.kind === "collab") return null;
  return tracks.find((t) => t.uri?.startsWith("spotify:track:")) ?? tracks[0] ?? null;
}
