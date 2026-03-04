
## Current State

The backend RAG pipeline is already partially built:
- `generate-nuggets/index.ts` — YouTube search + Gemini grounding + transcript extraction, returns `{headline, text, kind, source}` per nugget
- `generate-companion/index.ts` — Gemini + Google Search, returns `{artistSummary, trackStory, nuggets[], externalLinks[]}`, cached in `companion_cache` by `track_key + listen_count_tier`
- Both functions use `listenCount` to scale depth (1=intro, 2=deeper, 3=deep cuts)

**What's missing**: tier awareness, the new `CompanionNugget` schema with `category`/`listenUnlockLevel`/`sourceName`/`sourceUrl`, the `UserProfile` system, updated Onboarding, tier-aware Browse, and the new Companion UI layout.

---

## The RAG-Aware Architecture

The backend already does retrieval (YouTube + Google Search grounding) and synthesis (Gemini as editor). What we're adding:

- **Tier routing**: `casual` → Gemini Flash + 3 nuggets, `curious` → Gemini Flash + 6 nuggets, `nerd` → Gemini Pro + 9 nuggets + Reddit/deep-cut angle
- **Strict schema output**: backend returns `category: 'track'|'history'|'explore'`, `listenUnlockLevel`, `sourceName`, `sourceUrl` (direct links, not Google search fallbacks)
- **Last.fm context**: if username provided, it's passed to the prompt for personalization

---

## Files to Change

### 1. `src/mock/types.ts`
Add alongside existing types:
```ts
export interface CompanionNugget {
  id: string;
  timestamp: number;
  text: string;
  headline?: string;
  imageUrl?: string;
  imageCaption?: string;
  sourceName: string;
  sourceUrl: string;
  category: 'track' | 'history' | 'explore';
  listenUnlockLevel: number;
}
export interface DeepDiveResponse {
  text: string;
  followUp: string;
  source: { publisher: string; title: string; url: string; }
}
export interface UserProfile {
  streamingService: 'Spotify' | 'YouTube Music' | 'Apple Music' | '';
  lastFmUsername?: string;
  calculatedTier: 'casual' | 'curious' | 'nerd';
}
```

### 2. `src/hooks/useMusicNerdState.ts` (NEW)
- `useUserProfile()` — read/write `UserProfile` from `localStorage('musicnerd_profile')`
- `useListenCount(trackId)` — per-track count from `localStorage('musicnerd_listens')`
- `incrementListenCount(trackId)` 

### 3. `src/pages/Onboarding.tsx` — 3-step flow
- Step 1: Platform selection (Spotify / YouTube Music / Apple Music) — button group with logos
- Step 2: Last.fm username — optional text input with Skip
- Step 3: Tier selection — three large colored cards:
  - Casual Listener (green) — "Just here for the vibes"
  - Curious Fan (blue) — "I like knowing the backstory"
  - Hardcore Nerd (pink) — "Give me every detail"
- On complete: save `UserProfile` to localStorage → navigate `/connect`
- If profile already exists in localStorage → skip to `/browse` immediately
- `framer-motion AnimatePresence` slide transitions between steps

### 4. `src/pages/Browse.tsx` — Tier-aware UI
- Read profile from `useMusicNerdState`
- Personalized greeting: `"Good evening, Nerd"` / `"Good evening, Curious Fan"` / `"Good evening"`
- Small tier badge next to greeting: colored pill (`● Nerd Mode` / `● Curious` / `● Casual`)
- Tier glow on the hero greeting block (same inset shadow system)
- Row ordering by tier:
  - Casual: standard (Jump Back In, Artists, Albums, genres)
  - Curious: adds a "Dig Deeper" row (albums sorted differently, labeled as hidden gems)
  - Nerd: genre rows first, then artists, then "Deep Cuts" row

### 5. `supabase/functions/generate-companion/index.ts` — Tier-aware RAG
Update to:
- Accept `tier: 'casual' | 'curious' | 'nerd'` and `lastFmUsername?: string`
- Route to different Gemini models:
  - casual/curious → `gemini-2.5-flash`
  - nerd → `gemini-2.5-pro` (richer, deeper output)
- Adjust nugget count: casual=3, curious=6, nerd=9
- Output new schema: each nugget gets `category: 'track'|'history'|'explore'`, `listenUnlockLevel: 1|2|3`, `sourceName`, `sourceUrl` (direct verified URL or targeted search)
- Cache key includes tier: `track_key + listen_count_tier + tier_slug`
- Include Last.fm context in prompt if `lastFmUsername` provided
- Depth prompt language adapts per tier:
  - casual: "accessible, no jargon, feel-good discoveries"
  - curious: "production details, cultural context, artist history"
  - nerd: "technical breakdowns, obscure influences, deep fan theory angles, Reddit-level deep cuts"

### 6. `src/pages/Companion.tsx` — New layout
- Read `UserProfile` from `useMusicNerdState`
- Pass `tier` + `lastFmUsername` to `generate-companion` edge function
- Tier-based inset glow on main container:
  - casual: `shadow-[inset_0_0_50px_rgba(34,197,94,0.15)]`
  - curious: `shadow-[inset_0_0_50px_rgba(59,130,246,0.15)]`
  - nerd: `shadow-[inset_0_0_50px_rgba(236,72,153,0.15)]`
- Three stacked sections: "The Track", "History", "Explore Next"
- Each section filters `CompanionNugget[]` by `category` + `listenUnlockLevel <= currentListenCount`, sorted by `timestamp` descending
- Show locked indicator when higher-level nuggets exist but aren't unlocked yet: "Listen again to unlock 3 more insights"
- Replace existing `NuggetCategoryCard` usage with new `CompanionNuggetCard`

### 7. `src/components/companion/CompanionNuggetCard.tsx` (NEW)
- Props: `nugget: CompanionNugget`, `onDeepDive: (nugget) => void`
- Image (if present) displayed prominently with caption below
- Nugget text body
- "Go Deeper" button → fires `onDeepDive`
- Pill button: `Source: {sourceName}` → links to `sourceUrl` in `target="_blank"`
- Glass card styling matching app aesthetic

### 8. `src/App.tsx` — Onboarding guard
- Check localStorage for `musicnerd_profile` on `/` route
- If exists, redirect to `/browse` directly

---

## Data Flow (End-to-End)

```text
User picks tier in Onboarding
         ↓
localStorage: { calculatedTier, streamingService, lastFmUsername }
         ↓
Companion page reads profile
         ↓
Calls generate-companion edge function with { artist, title, listenCount, tier, lastFmUsername }
         ↓
Backend: tier routes model choice (Flash vs Pro) + nugget count (3/6/9)
         ↓
Gemini generates CompanionNugget[] with category, listenUnlockLevel, sourceName, sourceUrl
         ↓
Cached in companion_cache (key: track_key + tier + listen_count_tier)
         ↓
Frontend filters by category → 3 sections
Frontend filters by listenUnlockLevel <= currentListenCount → progressive unlocking
Frontend sorts by timestamp descending → newest unlock at top
         ↓
CompanionNuggetCard shows text + image + Source pill + Go Deeper button
         ↓
NuggetDeepDive overlay with DeepDiveResponse + Source pill
```

---

## Key Decisions
- **No mock data** — all content from the real Gemini RAG pipeline
- **Cache key update**: `companion_cache` currently keys on `track_key + listen_count_tier` — we extend to also include `tier` (casual/curious/nerd) so each tier gets its own cached response
- **Companion cache schema needs a migration** to add a `tier` column, or we encode it into a composite string key like `"radiohead::creep::nerd::1"`
- **Source URLs**: `generate-companion` currently uses Google Search fallback URLs. We update the prompt to demand real direct URLs and only fall back to search if truly necessary, matching the user's requirement for strict RAG citations
