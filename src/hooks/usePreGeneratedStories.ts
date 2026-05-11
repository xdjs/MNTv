import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { usePlayer } from "@/contexts/PlayerContext";
import { buildPreGenCacheKey, preparePreGenCacheEntry, PREGEN_INVOKE_TIMEOUT_MS } from "@/lib/preGenCachePrefill";
import type { UserProfile } from "@/mock/types";

// Each story = one user-top-track worth of pre-generated nuggets. Tapping a
// story on Browse navigates to Listen for that track, which hits the same
// nugget_cache row we prime here so the first nugget is instant. The story's
// `ready` flag reflects whether that cache row exists; the ring around the
// circle uses it to show "hot" vs "still warming" at a glance.
export interface Story {
  trackKey: string;            // stable id = "artist::title"
  artist: string;              // primary artist (used for cache key)
  collaborators?: string[];    // other artists on the track
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
// 2 — Pete 2026-05-10: with concurrency=5 stories were stuck warming
// (Gemini queues, full pipeline timing out at 95s for indie artists).
// Two parallel calls keep Gemini cold-start manageable so each call
// resolves in its own budget rather than fighting for compute.
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
  // Pre-gen response also seeds the in-memory client cache, so a tap
  // on a pink ring shows the nugget instantly without a DB roundtrip
  // (and survives any DB cache write that silently failed server-side
  // — Pete 2026-05-10 hit this when stories went pink but tap showed
  // nothing because the row was never written).
  const { setNuggetCache } = usePlayer();

  // Content-stable signature of the slice we'll seed from. Used as
  // the effect's dep instead of the array reference so re-emits from
  // useUserProfile (DB hydration, background taste refresh, applyTastePatch)
  // that don't actually change the top-N content don't re-run the effect
  // and cancel in-flight pre-gen. Pete's diagnostic console (2026-05-08)
  // showed 3 cleanup cycles in 30 seconds — every cleanup killed
  // in-flight invokes mid-Gemini, which is why stories stayed warming
  // even though their server-side calls eventually completed. Mirror
  // of the same pattern used in useArtistUpdates.
  const trackSig = (profile?.trackImages ?? [])
    .filter((t) => !!t.uri)
    .slice(0, maxStories)
    .map((t) => `${t.artist}::${t.title}::${t.uri}`)
    .join("|");
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
    if (import.meta.env.DEV) console.log(`[Stories] effect run — ${profile.trackImages.length} top tracks, tier=${tier}`);
    const tierSwitched = prevTierRef.current !== null && prevTierRef.current !== tier;
    prevTierRef.current = tier;
    // Per-effect-run dedup. Local to this effect so a re-run (profile
    // re-hydration changing trackImages identity, etc.) starts fresh
    // and re-fires invokes that the previous cancelled run never
    // completed. The previous cross-run ref-based dedup created a
    // stuck-warming bug: cancelled run added entries → re-run saw
    // them as already kicked off → skipped → setStories(ready) from
    // run 1 never fired → infinite warming.
    const kickedOffThisRun = new Set<string>();

    // Seed stories from the top-tracks list, preserving order. Require a
    // URI so tapping the story can actually start playback — otherwise we'd
    // show stories that navigate to a /listen/ URL Spotify can't resolve.
    const seeded: Story[] = profile.trackImages
      .filter((t) => !!t.uri)
      .slice(0, maxStories)
      .map((t) => ({
        trackKey: `${t.artist}::${t.title}`,
        artist: t.artist,
        collaborators: t.collaborators,
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

          // Flip ready flags ONLY for stories with a verified cache row
          // (status='ready' AND non-empty nuggets). The ledger is used
          // below to skip RE-FIRING pre-gen, but never to mark a story
          // ready by itself — a stale ledger entry whose cache row is
          // gone (TTL, manual cleanup, key drift) was the source of
          // the "pink ring lies" bug Pete keeps hitting.
          setStories((prev) =>
            prev.map((s) =>
              readyKeys.has(s.trackKey) ? { ...s, ready: true } : s,
            ),
          );
        }

        // 2. Kick off pre-gen for tracks WITHOUT a verified cache row.
        // We deliberately do NOT short-circuit on the ledger here:
        // a ledger entry whose cache row never landed (silent server
        // upsert failure / row deleted) would otherwise leave the
        // story stuck warming forever. Re-firing on every session
        // until the cache is actually populated is the correct
        // recovery path. On tier switch, regenerate ALL stories.
        const needsGen = tierSwitched
          ? seeded
          : seeded.filter((s) => !readyKeys.has(s.trackKey));
        await runThrottled(needsGen, maxConcurrent, async (story) => {
          const kickKey = `${story.trackKey}::${tier}`;
          if (kickedOffThisRun.has(kickKey)) return;
          kickedOffThisRun.add(kickKey);
          if (cancelled) return;
          const t0 = Date.now();
          try {
            // PREGEN_INVOKE_TIMEOUT_MS is shared with useReleasePreGen
            // via @/lib/preGenCachePrefill — see that file for why 95s.
            const invokePromise = supabase.functions.invoke("generate-nuggets", {
              body: {
                artist: story.artist,
                collaborators: story.collaborators,
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
                // Fast path: one artist-kind nugget per story so rings
                // go pink in 5-15s instead of 25-50s. Pete 2026-05-10:
                // re-enabling after the full-pipeline experiment left
                // stories stuck warming. The synthetic safety net at
                // every server-side failure (Exa empty / Gemini
                // timeout / source rejected) guarantees a cache row,
                // so a tap on a pink ring shows SOMETHING instantly.
                // Quality iteration on synthetic copy is a separate
                // task — getting the ring + tap pipeline reliable
                // first.
                firstNuggetOnly: true,
              },
            });
            type InvokeResult = Awaited<typeof invokePromise>;
            const raceResult = await Promise.race<InvokeResult | { timedOut: true }>([
              invokePromise,
              new Promise<{ timedOut: true }>((resolve) =>
                setTimeout(() => resolve({ timedOut: true }), PREGEN_INVOKE_TIMEOUT_MS),
              ),
            ]);
            if ("timedOut" in raceResult) {
              if (import.meta.env.DEV) console.warn(`[Stories] TIMEOUT after ${PREGEN_INVOKE_TIMEOUT_MS}ms — ${story.trackKey} (slot freed)`);
              return;
            }
            const { data, error } = raceResult;
            if (cancelled) {
              if (import.meta.env.DEV) console.log(`[Stories] cancelled mid-flight after ${Date.now() - t0}ms — ${story.trackKey}`);
              return;
            }
            if (error) {
              if (import.meta.env.DEV) console.warn(`[Stories] ERROR after ${Date.now() - t0}ms — ${story.trackKey}:`, error.message);
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
            const responseSources = (data as { sources?: Record<string, unknown> } | null)?.sources;
            const generatedAny = Array.isArray(responseNuggets) && responseNuggets.length > 0;
            const synthetic = (data as { synthetic?: boolean } | null)?.synthetic === true;
            if (import.meta.env.DEV) console.log(`[Stories] OK after ${Date.now() - t0}ms — ${story.trackKey} (${responseNuggets?.length ?? 0} nuggets${synthetic ? ", synthetic" : ""})`);

            // INVARIANT (Pete 2026-05-10 re-affirmed): pink ring = tap
            // will show a nugget. If the server returned 0 nuggets,
            // we MUST NOT mark ready — that's the bug-fix from
            // bef9302 that 56a65f7 accidentally regressed. A blank
            // tap is worse than a still-warming ring.
            if (!generatedAny) {
              if (import.meta.env.DEV) console.warn(`[Stories] response had no nuggets — leaving ${story.trackKey} in warming state`);
              return;
            }

            recordPregen(story.trackKey, tier);

            // Pre-fill in-memory cache so a tap on the pink ring shows
            // the nugget instantly. Helper centralizes shape validation
            // and key construction so useReleasePreGen stays in sync.
            const memCacheKey = buildPreGenCacheKey({
              artist: story.artist,
              title: story.title,
              uri: story.uri,
              tier,
            });
            const cacheEntry = preparePreGenCacheEntry(data);
            if (cacheEntry) {
              setNuggetCache(memCacheKey, cacheEntry);
              if (import.meta.env.DEV) console.log(`[Stories] in-mem cache primed for ${story.trackKey} (key=${memCacheKey.slice(0, 80)}…)`);
            } else if (import.meta.env.DEV) {
              console.warn(`[Stories] response nuggets failed shape validation for ${story.trackKey} — skipping in-mem prefill`);
            }

            setStories((prev) =>
              prev.map((s) => (s.trackKey === story.trackKey ? { ...s, ready: true } : s)),
            );
          } catch (e) {
            if (import.meta.env.DEV) console.warn(`[Stories] THREW after ${Date.now() - t0}ms — ${story.trackKey}:`, e);
          }
        });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      if (import.meta.env.DEV) console.log(`[Stories] effect cleanup — cancelling in-flight pre-gen`);
    };
    // Content-keyed deps: `trackSig` (stable string fingerprint of the
    // top-N artist/title/uri tuples) instead of `profile?.trackImages`
    // (whose array identity changes on every useUserProfile re-emit
    // even when content is identical). Listing trackImages directly
    // forced this effect to cancel-and-restart on every DB hydrate,
    // background taste refresh, etc. — wedging in-flight pre-gen
    // calls so stories never marked ready even when the server
    // eventually completed them.
    //
    // We still want a real content change (different top-N tracks
    // after a user switch / SpotifyCallback) to re-run; trackSig
    // captures that without re-running on identity-only churn.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackSig, tier, maxStories, maxConcurrent]);

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
