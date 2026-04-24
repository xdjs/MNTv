import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { UserProfile } from "@/mock/types";

/**
 * One item for the "Your artists, lately" row on Browse.
 *
 * Mirrors the server-side `ArtistUpdate` shape in
 * supabase/functions/artist-updates/index.ts. Duplicated client-side so
 * the hook doesn't cross-import from a Deno edge function.
 */
export interface ArtistUpdate {
  artistId: string;
  artistName: string;
  artistImageUrl: string;
  kind: "new-release" | "collab" | "fact";
  headline: string;
  body: string;
  source?: {
    type: string;
    title?: string;
    publisher?: string;
    url?: string;
  };
  nuggetId?: string;
  relatedTrackUri?: string;
}

/** A top artist paired with their updates. Stays null while loading. */
export interface ArtistUpdateGroup {
  artistName: string;
  updates: ArtistUpdate[] | null;
}

interface UseArtistUpdatesOptions {
  tier: "casual" | "curious" | "nerd";
  /** Cap on how many top artists we ask the edge function about. */
  maxArtists?: number;
  /** In-flight requests per user; matches usePreGeneratedStories. */
  maxConcurrent?: number;
}

// Defaults dropped from 5 → 3 after first-run feedback: 5 artists × up
// to 3 updates + 8 stories was too much cold-generation pressure on
// first sign-in. 3 × 3 = 9 cards per artist row is still plenty of
// MusicNerd density without burying the first paint.
const DEFAULT_MAX_ARTISTS = 3;
const DEFAULT_CONCURRENCY = 2;

export interface UseArtistUpdatesResult {
  /** One entry per top artist, preserving input order. `updates` is null until that artist resolves. */
  groups: ArtistUpdateGroup[];
  /** Flat list of all updates received so far (consumers that don't care about grouping). */
  allUpdates: ArtistUpdate[];
  /** Whether at least one artist is still being fetched. */
  loading: boolean;
  /** Count of artists we attempted (includes those still loading). */
  totalCount: number;
  /** Count of artists whose fetch has resolved (even if they returned zero updates). */
  readyCount: number;
}

/**
 * Fan-out fetch for the user's top artists. Each artist resolves to an
 * array of up to 3 updates (one release card + two fact nuggets). The
 * edge function returns `{ updates: ArtistUpdate[] }`; we key the
 * response into per-artist groups so Browse can render a nested row
 * per artist rather than a flat mixed list.
 *
 * Results land incrementally so `Browse` can render filled rows
 * alongside still-loading skeletons. Matches the throttle pattern in
 * `usePreGeneratedStories.ts`.
 */
export function useArtistUpdates(
  profile: UserProfile | null,
  {
    tier,
    maxArtists = DEFAULT_MAX_ARTISTS,
    maxConcurrent = DEFAULT_CONCURRENCY,
  }: UseArtistUpdatesOptions,
): UseArtistUpdatesResult {
  const [groups, setGroups] = useState<ArtistUpdateGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [readyCount, setReadyCount] = useState(0);
  // Scoped per `(artist, tier)` so switching tiers re-fetches but a
  // re-render doesn't re-fire in-flight requests.
  const inFlightRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const topArtists = profile?.topArtists ?? [];
    if (!topArtists.length) {
      setGroups([]);
      setReadyCount(0);
      return;
    }

    const artists = topArtists.slice(0, maxArtists);
    // Seed the groups with null-updates placeholders so Browse can
    // render one skeleton row per artist immediately while the edge
    // function calls are in flight.
    setGroups(artists.map((name) => ({ artistName: name, updates: null })));
    setReadyCount(0);
    setLoading(true);

    let cancelled = false;

    async function fetchOne(artist: string): Promise<void> {
      const key = `${artist}::${tier}`;
      if (inFlightRef.current.has(key)) return;
      inFlightRef.current.add(key);
      try {
        const { data, error } = await supabase.functions.invoke("artist-updates", {
          body: { artist, tier },
        });
        if (cancelled) return;
        if (error) {
          if (import.meta.env.DEV) {
            console.warn(`[artist-updates] ${artist} failed:`, error.message);
          }
          // Resolve with empty set so the placeholder flips out of
          // loading state — no partial row stays skeletal forever.
          setGroups((prev) =>
            prev.map((g) => (g.artistName === artist ? { ...g, updates: [] } : g)),
          );
          return;
        }
        const updates = (data?.updates as ArtistUpdate[] | undefined) ?? [];
        setGroups((prev) =>
          prev.map((g) => (g.artistName === artist ? { ...g, updates } : g)),
        );
      } catch (e) {
        if (import.meta.env.DEV) {
          console.warn(`[artist-updates] ${artist} threw:`, e);
        }
        setGroups((prev) =>
          prev.map((g) => (g.artistName === artist ? { ...g, updates: [] } : g)),
        );
      } finally {
        inFlightRef.current.delete(key);
        if (!cancelled) setReadyCount((n) => n + 1);
      }
    }

    (async () => {
      let index = 0;
      const worker = async () => {
        while (index < artists.length) {
          const i = index++;
          await fetchOne(artists[i]);
        }
      };
      const workers: Promise<void>[] = [];
      for (let w = 0; w < Math.min(maxConcurrent, artists.length); w++) {
        workers.push(worker());
      }
      await Promise.all(workers);
      if (!cancelled) setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
    // Array identity (not length) so a same-length taste refresh with
    // different artists still re-fetches — parity with the PR #74
    // round-3 fix in usePreGeneratedStories.ts.
  }, [profile?.topArtists, tier, maxArtists, maxConcurrent]);

  const allUpdates = useMemo(
    () => groups.flatMap((g) => g.updates ?? []),
    [groups],
  );

  return {
    groups,
    allUpdates,
    loading,
    totalCount: groups.length,
    readyCount,
  };
}
