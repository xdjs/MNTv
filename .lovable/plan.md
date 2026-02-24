

# Contextual Visual Nuggets — Full Plan

## Summary

Enhance the nugget system so that **one of the three nuggets per track** is presented as a visual card — an image with a short caption — while the other two remain text-only. The image is contextually relevant to the nugget's content, sourced from real photography via Wikimedia Commons, MusicBrainz artist photos, or Cover Art Archive album art. The AI prompt is updated to include an `imageHint` per nugget, and a new backend function resolves these hints to real image URLs.

## Architecture

```text
┌─────────────────────┐     ┌──────────────────────┐     ┌─────────────────────┐
│  generate-nuggets   │     │    nugget-image       │     │   NuggetCard.tsx     │
│  (edge function)    │     │   (new edge function) │     │   (component)       │
│                     │     │                       │     │                     │
│  Returns 3 nuggets  │────▶│  Resolves imageHint   │────▶│  Renders visual-    │
│  each with an       │     │  to real imageUrl via  │     │  only card for one  │
│  imageHint field    │     │  MusicBrainz/Wikidata/ │     │  nugget, text for   │
│                     │     │  Wikimedia Commons/    │     │  the other two      │
│                     │     │  Cover Art Archive     │     │                     │
└─────────────────────┘     └──────────────────────┘     └─────────────────────┘
```

## Image Resolution Pipeline

The new `nugget-image` edge function accepts an `imageHint` and resolves it to a real URL:

| `imageHint.type` | Resolution Method | Example |
|---|---|---|
| `"artist"` | MusicBrainz → Wikidata → Wikimedia Commons (same pipeline as existing `artist-image` function) | `{ type: "artist", query: "Nile Rodgers" }` → photo of Nile Rodgers |
| `"album"` | MusicBrainz album search → MBID → Cover Art Archive thumbnail | `{ type: "album", query: "OK Computer Radiohead" }` → OK Computer cover |
| `"wiki"` | Wikimedia Commons search API → first relevant CC-licensed photo | `{ type: "wiki", query: "Fender Rhodes piano" }` → real photo of a Rhodes |

All sources are free, open, real photographs — never AI-generated.

## What the Visual Nugget Looks Like

```text
Standard text nugget:              Visual-only nugget:
┌──────────────────────┐           ┌──────────────────────┐
│ THE ARTIST · 0:10    │           │                      │
│                      │           │  ┌──────────────┐    │
│ "The cash register   │           │  │              │    │
│  sounds at the start │           │  │  [relevant   │    │
│  were recorded by    │           │  │   photo]     │    │
│  Roger Waters..."    │           │  │              │    │
│                      │           │  └──────────────┘    │
└──────────────────────┘           │  Brief caption       │
                                   └──────────────────────┘
```

The visual-only card uses the same `apple-glass` wrapper, same animation variants (A/B/C), same MusicNerd logo, same glow/focus behavior. It just replaces the header + text body with an image + caption.

## Rotation Logic

One nugget per track is selected as the visual slot, rotating deterministically:

```typescript
const visualSlotIndex = trackId.charCodeAt(0) % 3;
// Track A → slot 0 (artist nugget is visual)
// Track B → slot 1 (track nugget is visual)
// Track C → slot 2 (discovery nugget is visual)
```

This ensures variety across tracks without randomness.

## Changes

### 1. `src/mock/types.ts` — Extend Nugget type

Add three optional fields:
- `imageUrl?: string` — resolved image URL
- `imageCaption?: string` — short caption for the image
- `visualOnly?: boolean` — when true, render as image + caption only

### 2. `supabase/functions/generate-nuggets/index.ts` — Add imageHint to prompt

Update the Gemini prompt to request an `imageHint` per nugget:

```json
{
  "headline": "...",
  "text": "...",
  "imageHint": {
    "type": "artist",
    "query": "Nile Rodgers",
    "caption": "Nile Rodgers in the studio"
  }
}
```

Add `imageHint` to the JSON schema in the prompt. The AI picks the most visually interesting subject related to each nugget. Pass `imageHint` through in the response alongside existing fields.

### 3. `supabase/functions/nugget-image/index.ts` — New edge function

A lightweight function that resolves `imageHint` → `imageUrl`:

- **Input**: `{ type, query, width? }`
- **`type: "artist"`**: Reuses the MusicBrainz → Wikidata → Wikimedia pipeline (copy the helper functions from `artist-image/index.ts` since edge functions can't import across directories)
- **`type: "album"`**: Search MusicBrainz for the album → get release group MBID → Cover Art Archive `https://coverartarchive.org/release-group/{mbid}/front-500`
- **`type: "wiki"`**: Query `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch={query}&prop=imageinfo&iiprop=url&iiurlwidth=500` → return first result's thumbnail URL
- **Output**: `{ imageUrl: string | null }`
- **Fallback**: Returns `null` if resolution fails — client handles gracefully

Add to `supabase/config.toml`:
```toml
[functions.nugget-image]
verify_jwt = false
```

### 4. `src/hooks/useAINuggets.ts` — Resolve images and apply visual rotation

After receiving nuggets from `generate-nuggets`:

1. Determine `visualSlotIndex` from `trackId`
2. For each nugget that has an `imageHint`, call `nugget-image` to resolve it (all 3 in parallel via `Promise.allSettled`)
3. Set `imageUrl` and `imageCaption` on each nugget from the resolution result
4. Mark the nugget at `visualSlotIndex` as `visualOnly: true` (only if its image resolved successfully)
5. If the visual slot's image failed, try the next slot; if all fail, all nuggets remain text-only

The hook signature adds two new optional parameters: `coverArtUrl` and `artistImageUrl` as fallbacks.

### 5. `src/components/NuggetCard.tsx` — Visual-only layout branch

Add a conditional at the top of the card render:

**If `nugget.visualOnly && nugget.imageUrl`:**
- Same outer `motion.div` wrapper with animation variants
- Same MusicNerd logo positioning
- Inside the `apple-glass` card: a rounded image (`object-cover`, `max-h-[180px]`, `w-full`, `rounded-lg`) with fade-in animation
- Below the image: `nugget.imageCaption || nugget.headline` as caption in `text-sm text-foreground/70`
- No kind label header, no listen-for badge, no text body
- Same glow, focus, and Style B border effects

**Otherwise:** existing layout, completely unchanged.

### 6. `src/pages/Listen.tsx` — Pass fallback image data

Pass `track.coverArtUrl` and the artist's local image URL to `useAINuggets` as fallback parameters.

## Fallback Chain

If image resolution fails for the visual slot:
1. Artist nuggets → fall back to current track's artist photo (local asset)
2. Track nuggets → fall back to current track's cover art URL
3. Discovery nuggets → fall back to current track's artist photo
4. If all resolution + fallbacks fail → nugget stays text-only (no `visualOnly` flag set)

## What Does NOT Change

- Still exactly 3 nuggets per track
- Animation variants A, B, C and their rotation
- Apple-glass card styling, box-shadow, rounded corners
- Nugget timing, queue logic, auto-dismiss, dwell-to-expand
- Deep dive overlay behavior (visual nuggets still support click-to-deep-dive)
- Edge function model (still Gemini 2.5 Flash)
- YouTube transcript pipeline
- Listen history / non-repeat logic

## Technical Notes

- Wikimedia Commons search API is free, no API key required, returns CC-licensed images
- Cover Art Archive is free, no API key required
- MusicBrainz rate limit (1 req/sec) is handled with the same delay pattern as `artist-image`
- The `nugget-image` function is called for all 3 nuggets in parallel from the client, but only the visual slot's result is critical
- Image URLs are not cached in this iteration — each listen resolves fresh (caching can be added later via a database table)

