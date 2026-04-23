import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { UserProfile } from "@/mock/types";

// Each story = one user-top-track worth of pre-generated nuggets. Tapping a
// story on Browse navigates to Listen for that track, which hits the same
// nugget_cache row we prime here so the first nugget is instant. The story's
// `ready` flag reflects whether that cache row exists; the ring around the
// circle uses it to show "hot" vs "still warming" at a glance.
export interface Story {
  trackKey: string;            // stable id = "artist::title"
  artist: string;
  title: string;
  imageUrl: string;
  uri?: string;                // spotify:track:... or apple:song:...
  ready: boolean;              // nugget_cache has a ready row for this track+tier
}

interface PreGenOptions {
  tier: "casual" | "curious" | "nerd";
  maxStories?: number;         // default 8
  maxConcurrent?: number;      // default 2 — throttle to avoid blasting Gemini
}

const DEFAULT_MAX_STORIES = 8;
const DEFAULT_CONCURRENCY = 2;

// Cross-session dedup — persists "we already fired pre-gen for this
// (track,tier) since the cache-TTL" marker in localStorage so reloading
// Browse doesn't re-blast Gemini. Keyed by `artist::title::tier`. Entries
// older than 24h are ignored (fresh pre-gen permitted after a day to pick
// up any Constitution/prompt improvements).
const PREGEN_LEDGER_KEY = "musicnerd_pregen_ledger";
const PREGEN_TTL_MS = 24 * 60 * 60 * 1000;

function readLedger(): Record<string, number> {
  try {
    const raw = localStorage.getItem(PREGEN_LEDGER_KEY);
    return raw ? (JSON.parse(raw) as Record<string, number>) : {};
  } catch {
    return {};
  }
}

function writeLedger(ledger: Record<string, number>): void {
  try {
    localStorage.setItem(PREGEN_LEDGER_KEY, JSON.stringify(ledger));
  } catch {
    // Quota or storage disabled — silently skip persistence.
  }
}

function wasPregennedRecently(trackKey: string, tier: string): boolean {
  const ledger = readLedger();
  const ts = ledger[`${trackKey}::${tier}`];
  return typeof ts === "number" && Date.now() - ts < PREGEN_TTL_MS;
}

function recordPregen(trackKey: string, tier: string): void {
  const ledger = readLedger();
  ledger[`${trackKey}::${tier}`] = Date.now();
  // Prune entries older than TTL to keep the ledger from growing unboundedly.
  const cutoff = Date.now() - PREGEN_TTL_MS;
  for (const k of Object.keys(ledger)) {
    if (ledger[k] < cutoff) delete ledger[k];
  }
  writeLedger(ledger);
}

/**
 * usePreGeneratedStories: picks the top N tracks from the user's profile,
 * checks nugget_cache for each, and fires background generation for uncached
 * ones (throttled). Returns a live-updating list of Story objects so the
 * StoriesRail can show each one flipping to "ready" as its pre-gen lands.
 *
 * Non-goals: this hook does NOT navigate, does NOT mutate DB outside of
 * triggering generate-nuggets, and never surfaces errors — background
 * pre-generation is best-effort. Failures just leave a story in "loading"
 * state; tapping it falls through to the normal Listen flow.
 */
export function usePreGeneratedStories(
  profile: UserProfile | null,
  { tier, maxStories = DEFAULT_MAX_STORIES, maxConcurrent = DEFAULT_CONCURRENCY }: PreGenOptions,
): { stories: Story[]; loading: boolean } {
  const [stories, setStories] = useState<Story[]>([]);
  const [loading, setLoading] = useState(false);
  // Track tracks we've already kicked off generation for in this session so
  // re-renders (profile hydration, tier switch) don't retrigger the same
  // pre-gen request. Keyed by `artist::title::tier`.
  const kickedOffRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!profile?.trackImages?.length) {
      setStories([]);
      return;
    }

    // Seed stories from the top-tracks list, preserving order. Require a
    // URI so tapping the story can actually start playback — otherwise we'd
    // show stories that navigate to a /listen/ URL Spotify can't resolve.
    const seeded: Story[] = profile.trackImages
      .filter((t) => !!t.uri)
      .slice(0, maxStories)
      .map((t) => ({
        trackKey: `${t.artist}::${t.title}`,
        artist: t.artist,
        title: t.title,
        imageUrl: t.imageUrl,
        uri: t.uri,
        ready: false,
      }));
    setStories(seeded);

    let cancelled = false;
    setLoading(true);

    (async () => {
      // 1. Bulk-check cache status for all stories in one query.
      const trackIds = seeded.map((s) => {
        const uriPart = s.uri ? `::${s.uri}` : "";
        return `real::${s.artist}::${s.title}::${uriPart}::${tier}`;
      });
      // The actual cache key format varies by how Listen constructs it — use a
      // prefix match (ILIKE) on artist+title+tier to catch existing rows.
      const likePatterns = seeded.map((s) => `%${s.artist}::${s.title}%::${tier}`);

      try {
        const { data: rows } = await supabase
          .from("nugget_cache")
          .select("track_id, status")
          .or(likePatterns.map((p) => `track_id.ilike.${p}`).join(","));

        if (cancelled) return;

        const readyKeys = new Set<string>();
        (rows || []).forEach((r) => {
          if (r.status === "ready") {
            // Extract artist::title from track_id to match story.trackKey
            const parts = String(r.track_id).split("::");
            if (parts.length >= 3) {
              readyKeys.add(`${parts[1]}::${parts[2]}`);
            }
          }
        });

        // Flip ready flags on stories that have cached nuggets OR that we've
        // pre-gen'd within the last 24h (treat them as hot without re-querying
        // every reload, even if cache key lookup happened to miss).
        setStories((prev) =>
          prev.map((s) => {
            const fromCache = readyKeys.has(s.trackKey);
            const fromLedger = wasPregennedRecently(s.trackKey, tier);
            return fromCache || fromLedger ? { ...s, ready: true } : s;
          }),
        );

        // 2. Kick off pre-gen for the rest, throttled. Skip tracks we've
        // already pre-gen'd recently (cross-session dedup via ledger).
        const needsGen = seeded.filter(
          (s) => !readyKeys.has(s.trackKey) && !wasPregennedRecently(s.trackKey, tier),
        );
        await runThrottled(needsGen, maxConcurrent, async (story) => {
          const kickKey = `${story.trackKey}::${tier}`;
          if (kickedOffRef.current.has(kickKey)) return;
          kickedOffRef.current.add(kickKey);
          if (cancelled) return;
          try {
            const { error } = await supabase.functions.invoke("generate-nuggets", {
              body: {
                artist: story.artist,
                title: story.title,
                album: "",
                listenCount: 1,
                previousNuggets: [],
                tier,
                userTopArtists: profile.topArtists?.slice(0, 10),
                userTopTracks: profile.topTracks?.slice(0, 10),
                spotifyTrackId: story.uri?.match(/spotify:track:([a-zA-Z0-9]{22})/)?.[1],
              },
            });
            if (cancelled) return;
            if (error) {
              if (import.meta.env.DEV) console.warn(`[Stories] pre-gen failed for ${story.trackKey}:`, error.message);
              return;
            }
            // Flip this story's ready flag and record cross-session success
            // so a reload doesn't refetch.
            recordPregen(story.trackKey, tier);
            setStories((prev) =>
              prev.map((s) => (s.trackKey === story.trackKey ? { ...s, ready: true } : s)),
            );
          } catch (e) {
            if (import.meta.env.DEV) console.warn(`[Stories] pre-gen threw for ${story.trackKey}:`, e);
          }
        });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
    // trackImages is an array — use its length + tier as the stable trigger.
    // Deep-diffing on every render is unnecessary; the profile hydrates once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.trackImages?.length, tier, maxStories, maxConcurrent]);

  return { stories, loading };
}

// ── Throttled fan-out ──────────────────────────────────────────────────
// Runs `fn` over `items` with at most `concurrency` in flight. Waits for all
// to settle before resolving. Errors inside `fn` are swallowed (pre-gen is
// best-effort).
async function runThrottled<T>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  let index = 0;
  const workers: Promise<void>[] = [];
  const worker = async (): Promise<void> => {
    while (index < items.length) {
      const i = index++;
      try { await fn(items[i]); } catch { /* swallow */ }
    }
  };
  for (let i = 0; i < Math.min(concurrency, items.length); i++) {
    workers.push(worker());
  }
  await Promise.all(workers);
}
