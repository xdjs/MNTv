# Fact source integrity

As of 2026-09-28, generated editorial facts must cite a retrieved document that supports the entire displayed headline and body. A catalog URL, reachable link, publisher name, or matching hostname is not evidence for an editorial claim.

The artist generator selects a numbered research document. Both artist and listening generators run a separate support check against that document. The checker must accept the whole claim and return a verbatim passage found in the retrieved text. Missing sources, unsupported details, invalid quotations, unavailable verification and timeouts withhold the fact. This reduces citation errors; model-based support checks cannot guarantee factual truth or source reliability.

The server stores evidence bound to the exact headline, body and URL. Frontend reads require that binding in Browse, artist profiles, listening, artist-fact reuse, demo seeds, pre-generation, bookmarks and QR companion views. Deep dives are checked against their selected source before display. Companion writes recheck client-submitted text on the server. Legacy unverified facts are withheld, not silently grandfathered in; saved records remain in storage. Invalid listening caches trigger fresh generation. Artist caches use the v6 namespace.

Native catalog release/song metadata continues to use the streaming provider. Editorial facts cannot borrow those catalog links as evidence. Uncited companion summaries are also withheld. No synthetic facts replace failed research. Fewer cards and an additional bounded verification request are intentional tradeoffs. Story readiness requires supported content.

Release remains staging-first. The shared backend rollout is authorized, but the frontend must await staging acceptance before main. The generate-nuggets deploy guard still applies: apply this change to downloaded live source and preserve its deployed constitution and Apple-token dependencies. Do not deploy the repository's unrelated pending generator work. Browser/signed-in verification remains a separate acceptance step.

### Review hardening (2026-09-28)

Verification shares the standard generation deadline. SSE stops starting writers when its budget expires, preserving the normal partial-result completion path. Each verification network call uses only the remaining budget. Deep dives retrieve the selected document before writing, disable unrelated search, and verify against that same document.

Companion submissions preserve evidence-valid facts from all existing listen tiers when revalidation is partial; writes no longer delete other tiers. Legacy companion content with no supported facts falls through to the nugget cache. Short catalog titles establish research identity only when at least two appear as quoted titles, not incidental prose.

Companion QR cache reads remain public. Submissions that trigger paid verification require a Supabase user token validated by Auth, not merely the public API key. Spotify sessions and Apple/guest anonymous user sessions are accepted. Listen ensures a session before submitting; failed authentication performs no source/model requests or cache writes.

Paid companion checks also consume a durable service-only database quota before any provider request: 3/minute and 30/hour per user, plus 30/minute and 300/hour project-wide to bound anonymous-account rotation. Counters update atomically under a transaction lock; rejected attempts consume no remaining quota. Counter rows expire after two hours. Quota denial returns 429; quota errors return 503 without verification or writes. Each submission checks at most nine claims, each at most 2,000 characters, against at most 4,000 document characters each. Existing supported companion content is still merged and preserved. Deploy the quota migration before the updated function.

QR fallback searches canonical recording cache keys with escaped artist/title fields, then the legacy key if no supported canonical row exists. Mixed cache rows are filtered before entering Listen's working state and memory cache, so legacy facts cannot count toward the tier's generation target.

Completed SSE generation persists verified facts with backend privileges before reporting completion, replacing unsupported legacy rows that browser RLS cannot overwrite. Persistence merges supported prior facts and skips writes after a failed prior read. Listen seeds use provider catalog IDs and Apple storefronts; artist-profile routes preserve primary IDs and separate collaborator credits.

Listen never infers an artist ID from a profile display-name map. Artist-profile and artist-update playback routes explicitly carry their selected catalog identity; other routes retain the name-scoped lookup until they carry an explicit ID. Cross-service recording resolution drops the original provider's artist ID.

Listening history preserves the complete query string (including artist ID and all collaborator credits), merging fallback artwork only when no artwork parameter exists. Returning with Previous therefore retains the same catalog identity and research context.

### Final review corrections (2026-09-28)

Companion uploads wait for initial and background generation to settle, coalesce snapshots for 1.5 seconds, and serialize requests. Attempts are spaced at least 65 seconds apart within the mounted Listen page, with at most three attempts per snapshot. Only successful uploads enter the dedupe map; quota failures can retry after the next minute window. Navigating away cancels queued work and prevents old requests from updating the current QR state.

Both streamed and batch cache writes normalize durations: finite values above 30 seconds and at most six hours are accepted; other inputs use 240 seconds. The streamed persistence helper also enforces this boundary independently.

Track currentness uses a monotonically increasing generation, so A → B → A cannot revive an old request. Cached QR links restore independently of upload deduplication when returning to a track.
