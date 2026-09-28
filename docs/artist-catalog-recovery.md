# Artist catalog recovery

## Observed on 2026-09-28

The deployed `spotify-artist` function found Tame Impala, Dame Atlas, and
Radiohead by name, but returned zero songs and zero albums for all three.
A separate `spotify-search` request returned 20 tracks for Tame Impala.
The artist-page screenshot's precise failing URL was not available during
investigation, so the original not-found response has not been reproduced.

The function discarded every non-success Spotify status as `null`. This
made API denial, throttling, and outages indistinguishable from missing
artists. The frontend also displayed “couldn't find” for every invocation
error. Failed album and song requests were cached as empty catalogs for
24 hours, and the existing song fallback depended on albums succeeding.
The deployed source did not log the discarded Spotify statuses. Management
log queries also failed during investigation, so the upstream status causing
the live empty catalogs has not yet been established.

## Recovery contract

- Artist routes send both catalog ID and name. If direct Spotify lookup
  returns 403 or 404, artist search may recover only a result with the same
  ID. Different artists with the same name must never be substituted.
- Required Spotify request failures remain service errors; a successful
  search with no match or a genuine missing ID remains not-found.
- Prefer Spotify top tracks. If unavailable or empty, search for songs and
  require exact artist-ID membership; then try album tracks. Deduplicate
  URIs and return at most ten songs. Search and album results are labeled
  “Songs”, because they are not an authoritative popularity ranking.
- Optional catalog failures leave the artist profile usable. If songs
  cannot be fetched, report that they are temporarily unavailable.
- Do not cache failed album/song fetches as complete results. Version the
  Spotify payload so old empty results are retried without deleting rows.
- Log failed Spotify endpoint paths and statuses, never bearer tokens.
- Apple catalog behavior is unchanged.

## Validation and rollout

Regression tests exercise the actual edge handler with mocked upstream
responses, including forbidden detail lookup, exact-ID recovery, rate
limits, genuine not-found, legacy cache bypass, song filtering, and the
normal top-tracks path. Client tests exercise routing, errors, and song labels.

The frontend build and tests pass. The edge function passes `deno check`.
The repository still has unrelated frontend type errors and lint failures.

No deployment has been made. Frontend and backend changes both need to
reach their target environments. MNTV uses one shared Supabase environment,
so an edge deployment changes production immediately. The downloaded live
function has a different biography prompt than this checkout: deploy only
the catalog-recovery diff on top of the live function, preserving its
existing biography behavior and its shared dependencies. After deployment,
verify both artists by name and ID, inspect the new Spotify status logs,
and confirm songs render and link to playback in the frontend.

### Local verification follow-up

The Vite frontend runs at `http://localhost:8080` (HTTP 200). It still uses
the deployed backend because the local environment contains only frontend
keys; opening that server does not exercise the changed edge function.
Automatic browser verification was declined at the browser permission prompt.

Added an integrated local test that connects the real `ArtistProfile` to the
real updated edge handler, mocking only Spotify, persistence, and unrelated
artist enrichment. Both Tame Impala and Dame Atlas recover from simulated
403 responses, render artist-matched songs, and navigate to the expected
Listen route and Spotify URI. This verifies routing, not audible playback.
A simulated 429 also renders the service-error message correctly. All 16
targeted tests pass. Actual Spotify calls from the updated local backend
remain unverified until server credentials are configured locally.

## Release-card playback

Artist-profile Latest Facts now passes a play target/action to both the
collapsed card and expanded dialog. Browse and artist profiles share
`useArtistUpdatePlayback`: a known song goes directly to Listen; an album
URI resolves to its first playable song through `spotify-album`. If album
details are unavailable, `spotify-search` may supply a song only when its
artist and album match the advertised release. A release is never replaced
with an unrelated catalog track. Apple listeners continue to resolve the
song in their selected service through the existing Listen-route behavior.

While resolving, play buttons are disabled. Success closes the dialog;
failure leaves it open with an error and permits retry. On the artist page,
the redundant link to the current artist is hidden; Browse retains its
artist link. Requests finishing after unmount do not navigate.

Validated locally: 633 tests pass; production build passes. Release tests
cover direct song playback, expanded album playback, failed lookup/retry,
Apple routing, and search results from the wrong artist or album. Audio
playback and browser visuals have not been automatically verified.

## Lately artist identity (2026-09-28)

The profile retains catalog IDs, but Lately previously sent only artist
names. Its backend selected the highest-follower exact-name search result,
then cached it by lowercase name. This could replace a listened-to artist
with a different, more popular artist using the same name. Display-name
capitalization was not a reliable identity signal.

Spotify profiles now send the saved `spotifyArtistId`. Direct lookup uses
that ID; search recovery must return the same ID. Name-only requests may
resolve only one distinct exact-name candidate, never pick by popularity.
Apple catalog IDs are not sent to the Spotify backend. Artist-profile facts
also send the Spotify ID from the resolved profile route.

The shared v4 cache key includes Spotify ID when known, separating namesakes
and excluding old v3 results. Client hooks discard responses carrying a
different artist ID and refetch when an ID changes without a name change.
Legacy name-only fact reuse in Listen remains separate from ID-scoped rows;
it may miss a seed rather than borrowing another artist's cached research.

The Lately artist avatar/name is a normal link directly to the saved catalog
profile, including while updates load. When a known artist has no usable
updates, its header remains available for navigation. The old request-body
storefront helper is no longer incorrectly applied to a navigation URL.

Tests use LIL LIL's supplied Spotify ID `62jLhwXSHpY3qoNybvyemr` against a
more popular same-name candidate. No artist-specific override is hardcoded
in production code. All 641 tests and the build pass; `artist-updates`
passes Deno type checking. Five unrelated frontend type errors remain.
Backend changes are local and require deployment before the new identity
requests produce ID-scoped live updates. Until then, client filtering may
hide old mismatched cards instead of displaying the namesake.

## Apple identity and native updates

Apple listening-history songs/albums are now enriched by their catalog IDs
with the `artists` relationship before ranking. Ranking separates identities;
the existing name-keyed profile format retains the most-listened identity if
two actual artists have identical display names. It does not merge their
counts or images. Library-only resources and failed enrichment remain
unresolved rather than guessing an ID from a name.

Lately and profile facts send Apple artist ID, service and storefront.
`artist-updates` reads the exact Apple artist's top-songs/latest-release views;
it does not substitute Spotify artists. Missing Apple IDs produce no updates.
Apple cache keys include service, storefront and artist ID. Native release
album URIs resolve on Play, and Apple song URIs survive Listen navigation.
Existing Apple profiles without artist IDs need a taste refresh/reconnection
after `apple-taste` is deployed. No production deployment was performed.

Validation: 647 tests passed across the full suite; after adding native Apple
release playback coverage, all 70 affected tests passed. Vite build, targeted
ESLint and Deno checks for both changed edge handlers passed. Frontend type
checking still reports the same five pre-existing errors. Signed-in Apple
API responses and actual audio playback have not been verified live.

API references: https://developer.apple.com/documentation/applemusicapi/get-multiple-catalog-songs-by-id
and https://developer.apple.com/documentation/applemusicapi/artists/views-data.dictionary

## Staging-first release (2026-09-28)

Tracked in [MusicNerdWeb#1374](https://github.com/xdjs/MusicNerdWeb/issues/1374).
Pete explicitly approved updating the shared backend, affecting production,
after reviewing the staging-isolation option. The temporary candidate
endpoints were used for pre-deployment probes; staging-only frontend routing
is removed from the release. Production frontend remains unchanged until the
staging-to-main release is approved.

Live probes recovered ten songs each for Tame Impala and Dame Atlas, and
native Apple updates for Tame Impala. They also caught research about a
namesake despite correct Spotify catalog identity. Research now searches
with catalog context and checks each source against the exact artist URL or
artist name plus a distinctive catalog title. Unverified sources are excluded;
no facts are generated when no sources pass. Generation cannot extend the
sources through independent name-only Google searches. Cache v5 invalidates
the earlier candidate results. This trades fewer fact cards for safer identity.

The Spotify biography generator is aligned to the downloaded live version
before deployment; this release does not introduce the previously unshipped
biography prompt. Other imported dependencies match the downloaded live
sources, except the explicitly changed Apple identity helpers.

The release checkout excludes the separate Apple sign-in recovery work.
Staging-to-main also includes the already-staged image retry, dead-component
cleanup and wave-cache error handling changes; list those in the release PR.

The final shared-backend rollout is authorized and deployed. Empty verified
research suppresses facts, not the correct artist's catalog songs. Fact
writing has a 15-second deadline (previously 40 seconds) and bounded thinking
to leave room inside the frontend's 30-second request limit. The final local
suite has 647 passing tests; build and Deno checks pass. The Claude review
workflow fails before review because its GitHub App is not installed on the
repository. This is recorded as a review infrastructure failure, not a pass.
Actual Apple account-history authorization and audible playback still need
user verification on staging before the main release.

Review follow-up: Spotify search now returns each track's album URI. Release
fallback requires that exact album URI, so collaborators are accepted without
substituting a namesake's same-titled release. Apple album lookup failures
stay retryable rather than guessing from names. Closing a release dialog or
opening another card invalidates pending playback, preventing late navigation
or a stale error. Regression tests exercise both cases.
