# Reusing artist facts on Listen

**Date:** 2026-07-29
**Status:** Scoped, not scheduled
**Origin:** Pete — "if we already generated a fact about song or artist why is
it not showing up when I hit play?"

## The gap

Two generators write to the same table under different namespaces:

| Generator | Cache key | Keyed by |
|---|---|---|
| `artist-updates` | `nugget_cache.track_id = "artist::<name>::<tier>"` (index.ts:687) | artist |
| `generate-nuggets` | `canonicalCacheKey(trackId, tier)` (useAINuggets.ts:438) | track |

Listen looks up by track. A fact generated for Browse is keyed by artist, so
the lookup misses and Listen regenerates from scratch — paying Exa and Gemini a
second time, and making the user wait, for research already sitting in the
database.

This is also why the loading pill matters so much: the wait it covers is partly
self-inflicted.

## Why it's worth fixing beyond cost

The first fact could appear **instantly** on play for any artist the user has
already seen on Browse. Right now the fastest path is a cache hit on that exact
track; the artist row is a second, much broader hit we simply never consult.

## Non-goals

- Replacing track-specific generation. An artist fact seeds the opening moment;
  wave-1/wave-2 still produce the track-specific material.
- Touching `generate-nuggets`. It's deploy-guarded, and this doesn't need it.

## Approaches considered

**A. Read the artist row at Listen time (recommended).**
`useAINuggets` already computes `dbCacheKey` and queries `nugget_cache`. Add a
parallel read of `artist::<name>::<tier>`. On a track-row miss, convert eligible
artist facts into nuggets and surface them immediately while generation runs.

Works for *any* track by that artist, not just ones surfaced on Browse.
Survives reload because it's DB-backed. Doesn't require predicting what the user
will play.

**B. Write through from Browse.**
When `artist-updates` generates, prefill the in-memory nugget cache for the
artist's related tracks — the pattern `useReleasePreGen` already uses via
`preparePreGenCacheEntry` + `setNuggetCache`.

Rejected as the primary mechanism: it only helps tracks that happened to appear
on a card, and the prefill is in-memory so it dies on reload. Worth keeping as a
latency optimisation *on top of* A, since it's already built.

**C. Unify the cache namespaces.**
Rejected. The two rows hold genuinely different things — one is about an artist,
one about a recording — and collapsing them would make invalidation ambiguous.
The namespaces aren't the bug; not reading one of them is.

## Design (approach A)

### Conversion

`ArtistUpdate` → `Nugget` is a shape mapping, best as a pure tested helper
(`src/lib/artistFactToNugget.ts`):

| Nugget field | From |
|---|---|
| `headline` / `text` | `update.headline` / `update.body` |
| `kind` | `"artist"` — the existing kind for artist-level facts, already labelled "THE ARTIST" in the immersive view |
| `imageUrl` | `update.artistImageUrl` |
| `sourceId` | new id; source built from `update.source` |
| `trackId` | the *current* track, not the artist |
| `timestampSec` | `0`, matching `makeSparseFallbackNugget`'s pinning so it reads as a normal opening nugget |
| `id` | derived from `update.nuggetId`, prefixed so it can't collide with generated nugget ids |

Only `kind: "fact"` updates convert. Release, collab and the new `track` kinds
are Browse-surface concepts, not facts about the music.

### Eligibility

- Skip updates whose `source.url` fails `isSafeUrl` — same guard the existing
  prefill path applies.
- Skip if the track row already has nuggets. Artist facts are a *fallback for
  the wait*, never a replacement.
- Cap at 1. This fills the opening slot; it should not crowd out the
  track-specific material that follows.

### Deduplication

The real risk. Wave-1 may independently produce the same fact, and the user
would see it twice in one listen.

Two defences, both needed:
1. Carry the artist-fact's identity forward so a generated nugget with the same
   `nuggetId` origin is dropped.
2. Compare normalised headlines before appending wave results.

If dedup can't be made reliable, prefer showing the artist fact and dropping the
duplicate from the wave — the artist fact is already on screen and removing it
mid-listen would be worse than never showing it.

### Interaction with the loading pill

This changes pill behaviour, and that must be deliberate. If an artist fact
seeds the opening slot, `activeNugget` is set almost immediately — so
`nuggetOnScreen` goes true and the pill dismisses early *correctly*, because a
fact genuinely is on screen. But research is still running.

That's the case the wave-2 pulsating logo is for (see the artists-lately spec):
pill dismisses, logo keeps pulsing while the rest arrives. **The two features
should ship together**, or the app will look like it finished when it hasn't.

## Testing

- `artistFactToNugget`: field mapping, kind filtering, unsafe-source rejection,
  id-prefixing.
- Eligibility: no seeding when the track row already has nuggets.
- Dedup: a wave nugget matching a seeded artist fact appears once.
- Orchestrator: seeded fact dismisses the pill, and the logo still indicates
  in-flight research.

## Risks

**Relevance.** An artist fact is not about the track playing. Opening with "the
artist moved to Fort Myers in 2008" when the user pressed play on a specific
song may read as a non-sequitur. Mitigation is ordering, not filtering: seed it,
then let track-specific nuggets follow. Worth judging on real output before
committing.

**Tier drift.** Both rows are tier-scoped, so a tier change invalidates both.
Confirm no path reads one tier's artist row against another tier's track row.
