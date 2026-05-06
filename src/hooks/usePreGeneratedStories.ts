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

// 8 → 5. Pairs with DEFAULT_MAX_ARTISTS dropping from 5 → 3 in
// useArtistUpdates.ts to lighten first-run pre-gen pressure. Most
// users engage with the first few stories anyway; generating 8 on
// cold sign-in was a lot of Gemini traffic we don't need.
const DEFAULT_MAX_STORIES = 5;
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
  // Detect tier switches (vs initial mount). When the user explicitly
  // changes tier — Casual → Curious — they want to see ALL stories
  // re-warm with the new depth, not silently inherit any stray cache row
  // that happens to exist for the new tier from a prior visit. On a
  // detected tier switch we bypass cache + ledger checks for this run so
  // every story flips through the warming animation and the server
  // regenerates with whatever the latest Constitution / prompt looks
  // like. Initial mount keeps the efficient cache-first path.
  const prevTierRef = useRef<string | null>(null);

  useEffect(() => {
    if (!profile?.trackImages?.length) {
      setStories([]);
      return;
    }
    const tierSwitched = prevTierRef.current !== null && prevTierRef.current !== tier;
    prevTierRef.current = tier;
    // On a tier switch, drop kickedOffRef entries scoped to the new tier
    // so we'll actually re-fire pre-gen. Without this, a user who toggles
    // curious → casual → curious would see the second curious switch
    // bail in runThrottled (kicked-off in the first curious run) and the
    // skipped cache lookup leaves stories stuck in warming forever.
    if (tierSwitched) {
      kickedOffRef.current.forEach((key) => {
        if (key.endsWith(`::${tier}`)) kickedOffRef.current.delete(key);
      });
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
      //
      // The actual cache key format varies by how Listen constructs it — use
      // a prefix match (ILIKE) on artist+title+tier to catch existing rows.
      // ILIKE treats `%` and `_` as wildcards, so escape any that appear in
      // artist/title (Spotify artist names like "50% Off" or "hi_top" would
      // otherwise match the wrong rows).
      const escapeIlike = (s: string) =>
        s.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
      const likePatterns = seeded.map(
        (s) => `%${escapeIlike(s.artist)}::${escapeIlike(s.title)}%::${tier}`,
      );

      try {
        // On a tier switch we deliberately skip the cache lookup so the
        // user sees every story re-warm and the server regenerates with
        // the new depth. `readyKeys` stays empty in that branch, which
        // both leaves all five stories in the warming state and forces
        // every story into `needsGen` below.
        const readyKeys = new Set<string>();
        if (!tierSwitched) {
          const { data: rows } = await supabase
            .from("nugget_cache")
            .select("track_id, status, nuggets")
            .or(likePatterns.map((p) => `track_id.ilike.${p}`).join(","));

          if (cancelled) return;

          (rows || []).forEach((r) => {
            // Require status='ready' AND a non-empty nuggets array. An
            // empty 'ready' row would pin the story circle as "ready" but
            // a tap would land on a blank Listen page — see the matching
            // generatedAny check in the pre-gen invoke path below.
            const nuggets = r.nuggets as unknown[] | null | undefined;
            const hasContent = Array.isArray(nuggets) && nuggets.length > 0;
            if (r.status === "ready" && hasContent) {
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
        }

        // 2. Kick off pre-gen for the rest, throttled. Skip tracks we've
        // already pre-gen'd recently (cross-session dedup via ledger).
        // On tier switch, regenerate ALL stories — bypass the ledger so a
        // recently-pregenned (but old-tier) entry doesn't suppress the
        // re-warm.
        const needsGen = tierSwitched
          ? seeded
          : seeded.filter(
              (s) => !readyKeys.has(s.trackKey) && !wasPregennedRecently(s.trackKey, tier),
            );
        await runThrottled(needsGen, maxConcurrent, async (story) => {
          const kickKey = `${story.trackKey}::${tier}`;
          if (kickedOffRef.current.has(kickKey)) return;
          kickedOffRef.current.add(kickKey);
          if (cancelled) return;
          try {
            const { data, error } = await supabase.functions.invoke("generate-nuggets", {
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
                // Without this, the server's cache key falls back to an
                // empty URI slot for Apple Music users and misses the
                // Listen-path read (which includes the full apple:song:
                // URI). Result: pre-gen ran but cache never matched, and
                // every story tap paid the full SSE generation cost.
                appleTrackId: story.uri?.match(/apple:song:(\d+)/)?.[1],
                // Fast path: ONE artist-kind nugget per story. Server
                // skips Curator + multi-kind loop, uses 1 Exa search
                // (6s timeout) + 1 Gemini call (25s timeout), with a
                // synthetic catalog fallback if the validator rejects
                // everything. Bounded wall time; "stories warming up"
                // resolves in 5-15s per track instead of 30-60s. The
                // tier-scaled rest of the nuggets is fanned out on
                // tap (see useAINuggets cache-hit fan-out).
                firstNuggetOnly: true,
              },
            });
            if (cancelled) return;
            if (error) {
              if (import.meta.env.DEV) console.warn(`[Stories] pre-gen failed for ${story.trackKey}:`, error.message);
              return;
            }
            // The JSON path of generate-nuggets returns 200 with an
            // empty `nuggets` array when the Validator + source filter
            // strip every Writer attempt — happens reliably for very-
            // low-popularity artists (Pete Rango, Cherele, Ty Symph,
            // Dame Atlas) where Exa returns no usable journalism and
            // anything Gemini fabricates fails the source check.
            //
            // We mark the story READY anyway so it's tappable. On tap,
            // Listen runs through useAINuggets which falls through to
            // a synthetic catalog-grounded fallback (see
            // makeSparseFallbackNugget) — an honest, non-fabricated
            // nugget that names the track, invites the listen, and
            // doesn't pretend to know things we can't verify.
            //
            // The ledger gets stamped either way so we don't re-fire
            // pre-gen for the same track within the 24h TTL.
            const responseNuggets = (data as { nuggets?: unknown[] } | null)?.nuggets;
            const generatedAny = Array.isArray(responseNuggets) && responseNuggets.length > 0;
            if (!generatedAny && import.meta.env.DEV) {
              console.warn(`[Stories] pre-gen returned 0 nuggets for ${story.trackKey} — sparse track, will use synthetic fallback on tap`);
            }
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
    // Depend on the trackImages array identity rather than its length so a
    // same-length profile replacement (e.g. user switches accounts, or
    // SpotifyCallback writes a different top-8 tracks set of the same size)
    // triggers a fresh pre-gen pass. Length-only was a silent trap: two
    // 8-track taste profiles wouldn't re-run and the second user would
    // stare at the first user's warmed stories.
  }, [profile?.trackImages, tier, maxStories, maxConcurrent]);

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
