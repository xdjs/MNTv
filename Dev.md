# MusicNerd TV — Developer Reference

> **Last updated:** 2026-03-04  
> Keep this file in sync whenever the architecture, data model, or security posture changes.

---

## 1. What It Is

MusicNerd TV transforms passive music listening into an engaged discovery experience. When a user plays a track, the app shows AI-generated "nuggets" — bite-sized facts about the track, artist, and cultural context — timed to the music. A "Companion" screen provides an AI-curated deep-dive with categories: *Track*, *History*, and *Explore Next* (personalised recommendations based on taste data).

**Key concept:** The experience scales with the user's self-declared "tier":
| Tier | Nuggets per listen | Depth |
|---|---|---|
| Casual Listener | 3 | Accessible, jargon-free |
| Curious Fan | 6 | Production details, cultural context |
| Hardcore Nerd | 9 | Technical breakdowns, obscure influences |

---

## 2. Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite, TypeScript, Tailwind CSS |
| Routing | React Router v6 |
| Animation | Framer Motion |
| State | React local state + localStorage (no Redux/Zustand) |
| Backend | Supabase (originally provisioned via Lovable; now managed directly) |
| AI | Google Gemini via `GOOGLE_AI_API_KEY` (no client-side key) |
| Auth | Anonymous — no Supabase auth flow is wired up; `auth.users` is empty |
| DB | Supabase Postgres with RLS |
| Edge Functions | Deno (deployed via Supabase Functions) |

---

## 3. Project Structure

```
src/
  pages/          # Route-level components
    Onboarding    # Landing / splash screen
    Connect       # Multi-step onboarding: account → platform → Last.fm → tier
    Browse        # Personalized catalog rows
    ArtistProfile # Artist detail page
    AlbumDetail   # Album detail page
    Listen        # Track playback + nuggets overlay
    Companion     # AI deep-dive for a track
    SpotifyCallback # Handles Spotify PKCE OAuth redirect
  hooks/
    useMusicNerdState.ts  # Core profile/listen-count persistence (localStorage + DB sync)
    usePersonalizedCatalog.ts  # Builds Browse rows from taste signals
    useSpotifyAuth.ts     # Spotify PKCE OAuth helpers
    useArtistImage.ts     # Fetches real artist photos via artist-image edge fn
    useAINuggets.ts       # Calls generate-nuggets edge fn
    usePlayback.ts        # Track playback simulation state
    useAccentColor.ts     # Dynamic accent color from album art
    useTierAccent.ts      # Tier-specific glow/color tokens
    useBackdropSync.ts    # Syncs backdrop image with playing track
  components/
    companion/    # CompanionNuggetCard, NuggetCategoryCard
    overlays/     # MediaOverlay, NuggetDeepDive, ReadingOverlay
    ui/           # Full shadcn/ui component library
  mock/
    tracks.ts     # Hardcoded catalog of ~14 artists/tracks (fallback for guests)
    types.ts      # Core TypeScript types (Artist, Track, Nugget, UserProfile, etc.)
  integrations/
    supabase/client.ts  # Auto-generated — DO NOT EDIT
    supabase/types.ts   # Auto-generated — DO NOT EDIT
supabase/
  functions/      # Edge functions (Deno)
  config.toml     # Function JWT config
```

---

## 4. User Flow

```
/ (Onboarding)
  → /connect  (4-step wizard)
      Step 0: Account creation (Google OAuth or email/password or skip)
      Step 1: Streaming platform (Spotify PKCE OAuth or Apple Music)
      Step 2: Last.fm username (optional, triggers lastfm-sync cache warm)
      Step 3: Self-select tier (Casual / Curious / Nerd)
  → /browse   (personalized catalog)
      → /artist/:id
      → /album/:id
      → /listen/:trackId  (playback + time-locked nuggets)
          → /companion/:trackId  (AI deep-dive)
```

Users **can skip account creation** and continue as guests. Guest browse uses the mock catalog only.

---

## 5. Data Storage Philosophy

### What we store (minimal footprint):
| Table | What's stored | Why |
|---|---|---|
| `profiles` | `user_id`, `streaming_service`, `last_fm_username`, `tier`, timestamps | Core identity data needed across sessions |
| `nugget_history` | `user_id`, `track_key`, `listen_count`, `previous_nuggets[]` | Enables progressive depth (different nuggets on each replay) |
| `companion_cache` | `track_key`, `tier`, AI-generated companion content | Shared cache — avoids re-calling Gemini for same track+tier |
| `nugget_cache` | `track_id`, AI-generated nuggets | Shared cache — avoids re-calling AI for same track |
| `lastfm_cache` | `username`, `top_artists`, `recent_tracks`, `user_info` | Short-lived (24h TTL) performance cache for Last.fm API |

### What we deliberately do NOT store:
- Spotify access tokens (ephemeral, PKCE flow, never leaves browser session)
- Spotify top artists/tracks persistently in DB *(currently stored in `profiles.spotify_top_artists` / `spotify_top_tracks` — see §10 for planned improvement)*
- YouTube top artists persistently in DB *(same — see §10)*
- Full Last.fm listening history (only recent 5 tracks + monthly top 10 artists cached for 24h)

### Data origin at runtime:
- **Last.fm taste**: fetched fresh per session via `lastfm-sync` (24h DB cache, backend-only)
- **Spotify taste**: fetched at connect time via PKCE OAuth → `spotify-taste` edge fn → stored in `profiles`
- **YouTube taste**: fetched at connect time via Google OAuth → `youtube-taste` edge fn → stored in `profiles`

---

## 6. Database Schema

### `profiles`
```sql
user_id uuid (FK → auth.users, unique)
streaming_service text         -- "Spotify" | "YouTube Music" | "Apple Music" | ""
last_fm_username text          -- nullable
spotify_top_artists jsonb      -- string[] of artist names
spotify_top_tracks jsonb       -- string[] of "Track — Artist" strings
youtube_top_artists jsonb      -- string[] of artist names
tier text                      -- "casual" | "curious" | "nerd"
created_at / updated_at
```
**RLS:** Users can only SELECT / INSERT / UPDATE their own row (no DELETE policy).

### `nugget_history`
```sql
user_id uuid (nullable — supports guest-ish usage)
track_key text                 -- e.g. "radiohead::karma-police"
listen_count integer           -- increments on each session
previous_nuggets jsonb         -- array of past nugget headlines (deduplication)
```
**RLS:** All operations scoped to `auth.uid() = user_id`.

### `companion_cache` / `nugget_cache`
Shared AI output caches. Public SELECT, service_role-only writes.

### `lastfm_cache`
Backend-only. All operations restricted to `service_role`.  
The 24h TTL is enforced in application code inside `lastfm-sync`.

---

## 7. Edge Functions

All functions require a valid JWT (Bearer token) except where noted.

| Function | Auth | Purpose |
|---|---|---|
| `generate-companion` | Required | Gemini RAG — generates the Companion deep-dive (nuggets + links) |
| `generate-nuggets` | Required | Gemini — generates time-locked Listen screen nuggets |
| `lastfm-sync` | Required | Fetches + caches Last.fm user data (24h TTL) |
| `lastfm-recommendations` | Required | Last.fm getSimilar — builds "Recommended For You" row |
| `artist-image` | Required | MusicBrainz → Wikidata → Wikimedia Commons real artist photos |
| `spotify-taste` | `verify_jwt=false` | Exchanges Spotify access token for top artists/tracks (PKCE, no secret) |
| `youtube-taste` | `verify_jwt=false` | Extracts top artists from YouTube liked videos via provider token |
| `nugget-image` | Required | AI-generated or fetched thumbnail for nuggets |
| `seed-nuggets` | Required | Dev/admin: pre-seeds nugget cache for mock tracks |

> **Note:** `spotify-taste` and `youtube-taste` have `verify_jwt=false` because they receive short-lived OAuth tokens from third-party providers, not Supabase JWTs. They perform their own input validation.

### Auth pattern (all secured functions):
```typescript
const authHeader = req.headers.get("Authorization");
// Validate via supabase.auth.getClaims(token)
// Return 401 if missing or invalid
```

---

## 8. Taste Personalization Pipeline

```
User connects Spotify
  → PKCE OAuth (client-side, no secret)
  → spotify-taste edge fn extracts top artists + tracks
  → Stored in profiles.spotify_top_artists / spotify_top_tracks

User enters Last.fm username
  → lastfm-sync edge fn called (warms cache)
  → Cached in lastfm_cache (24h TTL, backend-only)
  → On Browse load: lastfm-sync called again (uses cache)

On Companion/Generate:
  → generate-companion receives: lastFmUsername, spotifyTopArtists, spotifyTopTracks, streamingService
  → Internally calls lastfm-sync to get taste context
  → Merges all signals into a RAG prompt context block
  → Gemini uses context to tailor "Explore Next" category

On Browse:
  → usePersonalizedCatalog merges Spotify + Last.fm signals
  → Calls lastfm-recommendations to get similar artist suggestions
  → Builds dynamic rows: "Jump Back In", "Your Top Artists", "Your Top Tracks", "Recommended For You"
```

---

## 9. Security Posture

### Authentication
- No user auth flow is currently wired up. `auth.users` is empty in
  prod. All client requests authenticate as anonymous via the
  Supabase publishable key.
- Edge functions with `verify_jwt = true` accept the anon key as a
  valid JWT — they do NOT enforce a real user identity. Any
  function that needs per-user authorization must implement its own
  in-function `supabase.auth.getUser()` check.

### RLS Summary
| Table | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `profiles` | owner only | owner only | owner only | ❌ no policy |
| `nugget_history` | owner only | owner only | owner only | owner only |
| `companion_cache` | public | service_role | service_role | service_role |
| `nugget_cache` | public | service_role | service_role | service_role |
| `lastfm_cache` | service_role | service_role | service_role | service_role |

### CORS
All edge functions use `Access-Control-Allow-Origin: *`. This is acceptable because:
1. All sensitive functions enforce JWT authentication server-side
2. No cookies are used (auth stored in localStorage)
3. CORS wildcard doesn't bypass JWT validation

### Known Security Findings (as of 2026-03-04)
| ID | Level | Status | Notes |
|---|---|---|---|
| `lastfm_cache_no_user_access` | info | accepted | lastfm_cache is intentionally backend-only; users access via edge fn |
| `cors_wildcard_config` | info | ignored | Acceptable per above rationale |

---

## 10. Planned / Known Technical Debt

### ✅ Data minimization (implemented 2026-03-04)
`profiles.spotify_top_artists`, `spotify_top_tracks`, and `youtube_top_artists` have been **removed from the DB**. Taste arrays are now held in `localStorage` only (session-scoped). When a signed-in user's profile is loaded from the DB, taste arrays are restored from their local copy. The DB profile only contains: `user_id`, `streaming_service`, `last_fm_username`, `tier`.

### Missing profiles DELETE policy
Users cannot delete their own profile row (no RLS policy). Should be added when a "Delete Account" flow is built.

### Mock catalog
`src/mock/tracks.ts` contains ~14 hardcoded artists. This is only shown to guest users. Signed-in users see real data from their connected platforms.

---

## 11. Environment / Secrets

All secrets live in Lovable Cloud (Supabase Secrets) and are **never** in client-side code.

| Secret | Used by |
|---|---|
| `GOOGLE_AI_API_KEY` | generate-companion, generate-nuggets, nugget-image |
| `LASTFM_API_KEY` | lastfm-sync, lastfm-recommendations |
| `SPOTIFY_CLIENT_ID` | Frontend only (public key — safe to expose) |
| `YOUTUBE_API_KEY` | youtube-taste |
| `LOVABLE_API_KEY` | Internal Lovable Cloud integration |
| `SUPABASE_URL` / `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_DB_URL` | Edge functions |

---

## 12. Local Development Notes

- Frontend dev server: `npm run dev` (Vite, port 5173)
- Edge functions are deployed automatically on save in Lovable
- The Supabase client (`src/integrations/supabase/client.ts`) and types (`src/integrations/supabase/types.ts`) are **auto-generated** — never edit them manually
- `supabase/config.toml` is also auto-managed — avoid manual edits
- Database migrations live in `supabase/migrations/` (read-only, applied automatically)
