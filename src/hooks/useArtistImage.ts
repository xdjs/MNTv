import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

interface CacheEntry {
  value: string | null;
  /** Undefined = never expires (success). Number = retry after this timestamp (failure). */
  expiresAt?: number;
}

const imageCache = new Map<string, CacheEntry>();

/** Artists whose MusicBrainz results are incorrect — always use the local fallback. */
const SKIP_API_LOOKUP = new Set(["Jamee Cornelia"]);

/** How long to cache a failed lookup before retrying (5 minutes). */
const NEGATIVE_CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Hook that fetches a real artist photo from MusicBrainz → Wikidata → Wikimedia Commons.
 * Falls back to the provided local image if the API doesn't return a result.
 *
 * Fixes vs. previous version:
 * - Negative cache entries expire after NEGATIVE_CACHE_TTL_MS so transient failures
 *   are retried instead of cached forever.
 * - `fallbackUrl` is NOT in the effect dependency array — it only affects the rendered
 *   value, not whether we fetch. Previously, an inline-computed fallbackUrl (new string
 *   each render) would re-trigger the effect, set state, cause a re-render, and loop.
 */
export function useArtistImage(artistName: string, fallbackUrl: string): string {
  // Stable ref for the fallback so we can read the latest value inside async callbacks
  // without adding it to any dependency array.
  const fallbackRef = useRef(fallbackUrl);
  fallbackRef.current = fallbackUrl;

  const [imageUrl, setImageUrl] = useState<string>(() => {
    const entry = imageCache.get(artistName);
    if (!entry) return fallbackUrl;
    // Expired negative cache → treat as uncached
    if (entry.expiresAt !== undefined && Date.now() > entry.expiresAt) return fallbackUrl;
    return entry.value ?? fallbackUrl;
  });

  useEffect(() => {
    // Check cache (respecting TTL)
    const entry = imageCache.get(artistName);
    if (entry) {
      const expired = entry.expiresAt !== undefined && Date.now() > entry.expiresAt;
      if (!expired) {
        setImageUrl(entry.value ?? fallbackRef.current);
        return;
      }
      // Expired — remove stale entry so we fetch again
      imageCache.delete(artistName);
    }

    // Skip API for known-bad matches
    if (SKIP_API_LOOKUP.has(artistName)) {
      imageCache.set(artistName, { value: null });
      setImageUrl(fallbackRef.current);
      return;
    }

    let cancelled = false;

    async function fetchImage() {
      try {
        const { data, error } = await supabase.functions.invoke("artist-image", {
          body: { artist: artistName, width: 600 },
        });

        if (cancelled) return;

        if (!error && data?.imageUrl) {
          // Successful result — cache permanently (no TTL)
          imageCache.set(artistName, { value: data.imageUrl });
          setImageUrl(data.imageUrl);
        } else {
          // Failed — cache with TTL so we retry later
          imageCache.set(artistName, { value: null, expiresAt: Date.now() + NEGATIVE_CACHE_TTL_MS });
          setImageUrl(fallbackRef.current);
        }
      } catch {
        if (!cancelled) {
          imageCache.set(artistName, { value: null, expiresAt: Date.now() + NEGATIVE_CACHE_TTL_MS });
          setImageUrl(fallbackRef.current);
        }
      }
    }

    fetchImage();
    return () => { cancelled = true; };
    // NOTE: fallbackUrl intentionally omitted from deps — it only affects the rendered
    // value (via fallbackRef), not whether we should fetch. Including it would cause
    // re-fetch loops when fallbackUrl is computed inline.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [artistName]);

  return imageUrl;
}
