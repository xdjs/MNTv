

# Companion Page Optimization & Redesign

Four changes: database caching, shorter content, new nugget UI components, and source URL fixes.

---

## Part 1: Database Caching for Generated Content

**New table: `companion_cache`**

| Column | Type | Notes |
|---|---|---|
| id | uuid | PK, auto-generated |
| track_key | text | Unique, e.g. "Daft Punk::Get Lucky" |
| listen_count_tier | integer | 1, 2, or 3 — which tier was generated |
| content | jsonb | Full JSON response from Gemini |
| created_at | timestamptz | Default now() |

RLS: permissive ALL with `true` (same pattern as `nugget_history` — no auth required for this testing/public data).

**Edge function change (`generate-companion/index.ts`):**
- Before calling Gemini, check `companion_cache` for a matching `track_key` + `listen_count_tier`
- If cache hit, return cached `content` immediately — no AI call
- After successful Gemini generation, upsert into `companion_cache`
- This eliminates regeneration during testing

**Pre-generation for all artists:** After caching is in place, we can trigger generation for all tracks by visiting each companion page once, or by adding a batch endpoint. For now the cache-on-first-visit approach avoids the complexity of a batch job while still solving the repeated regeneration problem.

---

## Part 2: Shorter Content in Prompt

**File: `supabase/functions/generate-companion/index.ts`**

Change the prompt instructions:
- `artistSummary`: Change from "2-3 paragraphs" to **"2 sentences maximum. Brief and punchy."**
- `trackStory`: Change from "2-3 paragraphs" to **"1 short paragraph (3-4 sentences max)."**

This is a prompt-only change — no structural changes needed.

---

## Part 3: Nugget Category Components with Swipeable Glass Cards

Currently all nuggets render in a flat list. The new design groups them by kind into 3 separate glass containers, each independently scrollable by touch.

**Nugget kinds renamed:**
- `artist` → "History" (covers artist or track history)
- `track` → "The Track"  
- `discovery` → "Explore Next"

**New component: `src/components/companion/NuggetCategoryCard.tsx`**

Props: `{ kind: string; label: string; nuggets: CompanionNugget[]; colorClass: string }`

Each card:
- Uses the `apple-glass` class with rounded-2xl styling (matching the NuggetDeepDive overlay aesthetic)
- Has a fixed height (~280px on mobile) with `overflow-y: auto` and `snap-y snap-mandatory` for touch-scrollable snapping between nuggets
- Each nugget inside is a full-height snap child (`snap-start`, `min-h-full`)
- Shows a dot indicator at the bottom (1/3, 2/3, 3/3) for which nugget is visible
- Each nugget includes the clickable source link at the bottom

**Updated `Companion.tsx`:**
- Import `NuggetCategoryCard`
- Group `data.nuggets` by kind: filter into `track`, `artist`, `discovery` arrays
- Render 3 `NuggetCategoryCard` instances vertically (The Track, History, Explore Next)
- Remove the old flat nugget list

---

## Part 4: Fix Source URL 404s

The current prompt asks Gemini to provide "real URLs" but LLMs hallucinate URLs. The fix is to **always build source URLs as Google Search queries** rather than trusting Gemini's fabricated direct links.

**File: `supabase/functions/generate-companion/index.ts`**

Post-processing change — after parsing Gemini's response, **override ALL source URLs** (not just missing ones):

```
for (const n of parsed.nuggets) {
  if (n.source) {
    if (n.source.type === "youtube") {
      // Build a YouTube search URL instead of trusting a hallucinated video ID
      const q = `${n.source.title} ${n.source.publisher} ${artist}`;
      n.source.url = `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`;
    } else {
      // Build a Google Search URL scoped to the publisher
      const q = `"${n.source.title}" site:${publisherDomain(n.source.publisher)} ${artist}`;
      n.source.url = `https://www.google.com/search?q=${encodeURIComponent(q)}`;
    }
  }
}
```

Also add a `publisherDomain` helper that maps known publishers to domains (e.g. "Pitchfork" → "pitchfork.com", "Rolling Stone" → "rollingstone.com"), with a fallback to just using the publisher name in the query. This ensures every source link leads to a real search result page instead of a 404.

Also update the prompt to tell Gemini NOT to fabricate URLs — just provide the source title, publisher, and type. The URL field in the prompt becomes optional since we override it anyway.

---

## Summary of Changes

| File | Change |
|---|---|
| Database migration | Create `companion_cache` table |
| `supabase/functions/generate-companion/index.ts` | Add cache read/write, shorten prompt, fix all source URLs with search fallbacks |
| `src/components/companion/NuggetCategoryCard.tsx` | New glass-card component with touch-scroll for grouped nuggets |
| `src/pages/Companion.tsx` | Use new nugget components, group by kind, update kind labels |

### Technical Notes

- The `companion_cache` table uses `track_key + listen_count_tier` as a unique pair so different listen tiers each get their own cached content
- Touch scrolling uses CSS `overflow-y: auto` with `scroll-snap-type: y mandatory` — no JS library needed
- The publisher domain mapping covers ~10 common music publications with a generic fallback
- Clearing the cache (for regeneration) is as simple as deleting rows from `companion_cache`

