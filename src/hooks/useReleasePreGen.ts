import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { usePlayer } from "@/contexts/PlayerContext";
import { buildPreGenCacheKey, preparePreGenCacheEntry, PREGEN_INVOKE_TIMEOUT_MS } from "@/lib/preGenCachePrefill";
import type { ArtistUpdateGroup } from "@/hooks/useArtistUpdates";

/**
 * Side-effect hook: fires the firstNuggetOnly pre-gen for any
 * new-release / collab tracks surfaced by `useArtistUpdates`, then
 * fans out the full per-tier pre-gen in the background.
 *
 * Why this exists separately from `usePreGeneratedStories`: the
 * stories rail is keyed off `profile.trackImages` (the user's top
 * tracks), but a brand-new release from a top artist usually isn't in
 * that set yet. Without dedicated pre-gen, tapping a NEW RELEASE card
 * lands on a Listen page with a cold cache — Pete: "I should be able
 * to start listening to the song and the first nugget takes over the
 * screen while other nuggets start generating in the background."
 *
 * Mirrors the stories-rail pattern: 1 partial Gemini call to populate
 * the cache row with one nugget (so the tap is instant), then a
 * fire-and-forget full call to fill in the rest behind the scenes.
 *
 * Per-session dedup via a `Set<string>` ref keyed by
 * `${artist}::${title}::${tier}`. We don't persist across sessions —
 * release content is short-lived (we clear after 24h via the cache
 * TTL), so re-running on a fresh session is correct.
 */
export function useReleasePreGen(
  groups: ArtistUpdateGroup[],
  tier: "casual" | "curious" | "nerd",
  enabled: boolean,
): void {
  const firedRef = useRef<Set<string>>(new Set());
  // In-mem cache prefill so release-card taps are instant, matching
  // the story-rail UX.
  const { setNuggetCache } = usePlayer();

  useEffect(() => {
    if (!enabled) return;
    if (!groups.length) return;
    // Drop late-arriving results after unmount.
    let cancelled = false;

    // Walk the groups, find release / collab cards with a resolved
    // track-level URI + title (the edge function only sets these when
    // it successfully resolved the album's first track).
    const targets: Array<{ artist: string; title: string; uri: string }> = [];
    for (const group of groups) {
      const updates = group.updates ?? [];
      for (const update of updates) {
        if (update.kind !== "new-release" && update.kind !== "collab") continue;
        if (!update.relatedTrackTitle || !update.relatedTrackUri) continue;
        targets.push({
          artist: update.artistName,
          title: update.relatedTrackTitle,
          uri: update.relatedTrackUri,
        });
      }
    }

    if (!targets.length) return;

    for (const target of targets) {
      const key = `${target.artist}::${target.title}::${tier}`;
      if (firedRef.current.has(key)) continue;
      firedRef.current.add(key);

      const spotifyTrackId = target.uri.match(/spotify:track:([a-zA-Z0-9]{22})/)?.[1];
      const appleTrackId = target.uri.match(/apple:song:(\d+)/)?.[1];
      // The artist-updates pipeline returns Spotify URIs even for Apple
      // users (it uses Spotify search server-side). For Apple-Music
      // listening sessions tapping the card, Listen will find no
      // matching cache row at the apple:song:… key, then run a fresh
      // SSE pipeline. That's acceptable degradation; the Spotify-keyed
      // cache row stays warm for any Spotify user who later taps the
      // same release.
      if (!spotifyTrackId && !appleTrackId) continue;

      // Full pipeline pre-gen, mirroring the stories rail (which
      // moved off firstNuggetOnly because the fast path produced
      // synthetic boilerplate too often). Server runs Curator +
      // Writer + Validator, caches all 3-9 tier-scaled nuggets.
      // Best-effort: no awaiting. Tap reads the cache row.
      // PREGEN_INVOKE_TIMEOUT_MS is shared with usePreGeneratedStories
      // via @/lib/preGenCachePrefill — see that file for why 95s.
      // Build the URI we'll persist into the cache key. Stories use
      // story.uri directly; we need the same resolved URI so the
      // server-side write key matches what useAINuggets reads on tap.
      const cacheUri = spotifyTrackId
        ? `spotify:track:${spotifyTrackId}`
        : appleTrackId
          ? `apple:song:${appleTrackId}`
          : "";
      const invokePromise = supabase.functions.invoke("generate-nuggets", {
        body: {
          artist: target.artist,
          title: target.title,
          album: "",
          listenCount: 1,
          previousNuggets: [],
          tier,
          spotifyTrackId,
          appleTrackId,
        },
      });
      Promise.race([
        invokePromise,
        new Promise<{ timedOut: true }>((resolve) =>
          setTimeout(() => resolve({ timedOut: true }), PREGEN_INVOKE_TIMEOUT_MS),
        ),
      ])
        .then((result) => {
          if (cancelled) return;
          if (typeof result === "object" && result !== null && "timedOut" in result) {
            if (import.meta.env.DEV) {
              console.warn(`[ReleasePreGen] TIMEOUT after ${PREGEN_INVOKE_TIMEOUT_MS}ms — ${target.artist} - ${target.title}`);
            }
            return;
          }
          const data = (result as { data?: unknown }).data;
          const cacheEntry = preparePreGenCacheEntry(data);
          if (cacheEntry) {
            const memCacheKey = buildPreGenCacheKey({
              artist: target.artist,
              title: target.title,
              uri: cacheUri,
              tier,
            });
            setNuggetCache(memCacheKey, cacheEntry);
            if (import.meta.env.DEV) console.log(`[ReleasePreGen] in-mem cache primed for ${target.artist} - ${target.title}`);
          }
        })
        .catch((e) => {
          if (cancelled) return;
          if (import.meta.env.DEV) {
            console.warn(`[ReleasePreGen] failed for ${target.artist} - ${target.title}:`, e);
          }
        });
    }
    return () => { cancelled = true; };
    // Depend on groups identity — useArtistUpdates re-renders only
    // when the per-artist `updates` arrays settle, so this fires once
    // per group resolution. firedRef dedups across re-renders.
  }, [groups, tier, enabled]);
}
