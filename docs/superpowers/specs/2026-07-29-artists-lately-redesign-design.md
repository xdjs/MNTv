# "Your Artists, Lately" redesign

**Date:** 2026-07-29
**Status:** Approved design, not yet implemented
**Branch:** to be cut after `p3t3rango/swipe-cue-and-bugfixes` merges

## Goal

Browse currently opens on a "Your Stories" rail followed by "Your Artists,
Lately", a section of read-only fact cards. Facts are the payoff of this
product, but a fact you can't act on is a dead end — there is no way to go
from "that's interesting" to "play it."

The redesign makes every surface on Browse a path into a song, and keeps the
MusicNerd logo pulsing while research continues so the user knows more facts
are coming.

## Non-goals

- Changing the nugget generation pipeline itself.
- Redesigning the Listen page. It already reveals the first nugget on play;
  this work only changes how users arrive there.
- Touching `generate-nuggets`. Its header marks v57 as the production cut and
  says not to deploy.

## Decisions

Three open questions were settled by Pete as "do what you'd want":

1. **Track supply:** extend the `artist-updates` edge function to return a
   small set of playable tracks per artist. Building the strip only from
   existing `new-release`/`collab` updates would leave many artists with zero
   or one track, which undercuts the feature.
2. **Facts lead somewhere:** every fact card gets a play action, not just
   track cards.
3. **Pulsating logo:** driven by real wave-2 research state, not a timer.

## What changes

### 1. Stories: remove the rail, keep the engine

`<StoriesRail />` comes out of `Browse.tsx`. Everything underneath stays:
`StoriesProvider`, `usePreGeneratedStories`, `useReleasePreGen`,
`preGenCachePrefill`, and the `PreparingExperience` warmup.

This distinction matters. The Stories system is the pre-generation engine that
makes a first listen instant; the rail is only its most visible consumer.
Deleting the system would trade a UI simplification for a latency regression
on every cold play.

**Re-pointing the warmup.** With the rail gone, pre-gen would be warming tracks
the user can no longer click. It should instead warm the tracks the new section
surfaces. The existing concurrency caps (`DEFAULT_CONCURRENCY = 2`) and
cross-session dedup must carry over unchanged — that machinery exists because
cold generation was saturating Gemini, and the track list is about to get
bigger, not smaller.

### 2. `artist-updates` returns playable tracks

The edge function gains a `tracks` array per artist: a few entries of
`{ title, album, uri, imageUrl }`, drawn from the artist's top tracks and
recent releases. Client-side `ArtistUpdate` keeps its existing shape; the
group gains the new field.

Server-side rules:

- Only return tracks with a URI the active service can actually play. The
  existing code already guards against handing Apple users a Spotify URI.
- Cap the count per artist. Three to five is enough to fill a strip without
  turning Browse into a catalog.
- Tracks are supplementary. If the lookup fails, the artist's fact cards still
  render — a failed track fetch must never blank the section.

### 3. Section structure: artist group, tracks nested

```
YOUR ARTISTS, LATELY

● lamboverrice
  ┌────────────────────────┐
  │ FACT                   │
  │ Collaborated with      │
  │ DeeDONTCARE and Jam…   │
  │              ▶ Will Kill│   ← fact leads into a song
  └────────────────────────┘
  GET INTO
  ┌─────────┐ ┌─────────┐
  │ ▶ Will  │ │ ▶ Loose │
  │   Kill  │ │   End   │
  └─────────┘ └─────────┘

● Spacebomb House Band
  …
```

Each artist group has two lanes: the existing fact cards, and a "GET INTO"
track strip.

**Fact cards get a play action.** A fact card resolves its track in order:
its own `relatedTrackUri` if it has one, otherwise the artist's first
supplied track. The control names the actual song ("Play Will Kill"), never
a bare "Play" — the user should know what they're about to hear. If neither
resolves, the card renders exactly as it does today, with no play control.
A dead button is worse than no button.

**Track tiles play directly**, with no expand step, navigating to
`/listen/real::artist::title::album::uri`. Facts keep their expand behaviour,
because reading is the point of a fact.

Both paths bake the URI into the route, which matters: routes without a URI
force `Listen` into a `spotify-search` round trip before playback can start.

### 4. Pulsating logo through wave-2

`useAINuggets` already exposes `waveLoading`, and `Listen.tsx` carries a
comment noting it was kept "for any future use that doesn't compete with"
the removed pill. This is that use.

`MusicNerdLoadingOrchestrator` already has a `pulsating` phase for in-progress
research. The work is wiring `waveLoading` in so the logo keeps pulsing while
wave-2 researches and settles to `ready` when it lands.

This must respect the terminus rule established in `b6682a8`: the pulsating
phase needs a bounded exit so a stalled wave-2 cannot leave the logo pulsing
forever. Note that the existing `!aiLoading && phase === "pulsating"` effect
is the same pattern deliberately removed from the `pill` phase, and will need
re-examining rather than extending.

## Components

| Unit | Responsibility |
|---|---|
| `splitArtistUpdates(updates, tracks)` (new, pure) | Splits an artist's updates into fact cards and playable track tiles, and resolves each fact's play target. Unit-tested. |
| `ArtistTrackStrip` (new) | Renders the "GET INTO" strip. Hides itself when empty. |
| `UpdateCard` (existing, extended) | Gains an optional play control. |
| `ArtistUpdatesSection` (existing) | Composes the two lanes per artist. |
| `artist-updates` edge function (extended) | Returns per-artist tracks. |

The resolution logic lives in `splitArtistUpdates` rather than inside a
component so the fallback rules are testable without rendering.

## Error and empty states

- No tracks for an artist: strip hidden, facts unaffected.
- No facts but tracks present: strip renders alone.
- Neither: artist omitted, as today.
- Track fetch fails: treated as "no tracks", never an error surface. Browse is
  a browsing page; a failed enrichment should degrade quietly.

## Testing

- `splitArtistUpdates`: fact/track partitioning, play-target resolution order,
  the no-target case.
- `ArtistTrackStrip`: renders tiles, hides when empty, navigates with the URI
  baked into the route.
- `UpdateCard`: play control appears only with a resolved target, names the
  track, does not swallow the expand tap.
- Orchestrator: logo pulses while `waveLoading`, settles on arrival, and
  cannot pulse indefinitely.

Extends the existing patterns — the shared framer-motion stub in
`src/test/helpers/framerMotionMock.tsx` and the fake-timer phase tests in
`loadingOrchestratorPill.test.tsx`.

## Risks

**Pre-gen load.** More surfaced tracks means more candidates to warm. The
existing caps were tuned against Gemini cold-start saturation; this work must
not raise them casually.

**Section length.** Two lanes per artist across three artists makes Browse
considerably taller. Worth checking on a real phone before committing to the
tile sizes.

**`ArtistUpdatesSection` size.** Already carries the card, the expanded
overlay, and navigation logic. Adding a lane is a reasonable moment to extract
the strip and the split logic rather than growing the file further.
