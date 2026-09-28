# Fact source integrity

As of 2026-09-28, generated editorial facts must cite a retrieved document that supports the entire displayed headline and body. A catalog URL, reachable link, publisher name, or matching hostname is not evidence for an editorial claim.

The artist generator selects a numbered research document and supplies an exact supporting passage. Both artist and listening generators run a separate support check against that document. The checker must accept the whole claim and return a verbatim passage found in the retrieved text. Missing sources, unsupported details, invalid quotations, unavailable verification and timeouts withhold the fact. This reduces citation errors; model-based support checks cannot guarantee factual truth or source reliability.

The server stores evidence bound to the exact headline, body and URL. Frontend reads require that binding in Browse, artist profiles, listening, artist-fact reuse, demo seeds, pre-generation, bookmarks and QR companion views. Deep dives are checked against their selected source before display. Companion writes recheck client-submitted text on the server. Legacy unverified facts are withheld, not silently grandfathered in; saved records remain in storage. Invalid listening caches trigger fresh generation. Artist caches use the v6 namespace.

Native catalog release/song metadata continues to use the streaming provider. Editorial facts cannot borrow those catalog links as evidence. Uncited companion summaries are also withheld. No synthetic facts replace failed research. Fewer cards and an additional bounded verification request are intentional tradeoffs. Story readiness requires supported content.

Release remains staging-first. The shared backend rollout is authorized, but the frontend must await staging acceptance before main. The generate-nuggets deploy guard still applies: apply this change to downloaded live source and preserve its deployed constitution and Apple-token dependencies. Do not deploy the repository's unrelated pending generator work. Browser/signed-in verification remains a separate acceptance step.
