# QR Code Companion Page with Clickable Source Links

This plan adds a permanent QR code to the Listen screen and a mobile-friendly companion page. Each nugget on the companion page includes a clickable source link so users can trace where the information came from.

---

## Part 1: New Dependency

Add `qrcode.react` to render white SVG QR codes with transparent backgrounds.

---

## Part 2: QR Code on Listen Screen

**File: `src/pages/Listen.tsx**`

- Import `QRCodeSVG` from `qrcode.react`
- Render a 72px white-on-transparent QR code, positioned bottom-left, always visible
- Opacity ~40% so it blends with the cinematic backdrop
- Encodes: `https://musicnerdtv.lovable.app/companion/${trackId}`
- Sits at `z-10`, outside the playback bar's auto-hide behavior

---

## Part 3: Companion Edge Function

**New file: `supabase/functions/generate-companion/index.ts**`

Uses the same Gemini + Google Search grounding pipeline. Accepts `{ artist, title, album, listenCount }`.

**Nugget scaling by listen count:**

- `listenCount <= 1` → 3 nuggets (1 artist, 1 track, 1 discovery)
- `listenCount === 2` → 6 nuggets (2 artist, 2 track, 2 discovery)
- `listenCount >= 3` → 9 nuggets (3 artist, 3 track, 3 discovery) — capped

**Each nugget includes a `source` object with:**

- `type` (youtube/article/interview)
- `title` (real source title)
- `publisher` (channel or publication name)
- `url` (YouTube watch link or Google Search URL — same logic as `generate-nuggets`)
- `quoteSnippet` (relevant quote from the source)

**Also generates:**

- `artistSummary`: 2-3 paragraphs about the artist
- `trackStory`: 2-3 paragraphs about the track
- `externalLinks`: Array of `{ label, url }` for Wikipedia, Spotify, YouTube Music

Uses existing `GOOGLE_AI_API_KEY` secret. CORS headers included. `verify_jwt = false`.

---

## Part 4: Companion Page

**New file: `src/pages/Companion.tsx**`

Mobile-optimized, scrollable article page. Data flow on load:

1. Extract `trackId` from URL params
2. Look up track + artist from mock data
3. Fetch real artist photo via existing `artist-image` edge function
4. Query `nugget_history` table for this track's `listen_count`
5. Call `generate-companion` edge function with `{ artist, title, album, listenCount }`

**Content sections:**

1. **Header** — MusicNerd logo + branding
2. **Artist Hero** — Real photo from `artist-image` function, fallback to mock
3. **Artist Info** — Name, genre pills, bio from mock data
4. **Track Details** — Title, album, cover art
5. **AI Summaries** — Artist summary + track story paragraphs
6. **Nuggets** — 3/6/9 based on listen count, each rendered as a card with:
  - Kind label ("The Artist" / "The Track" / "Explore Next")
  - Headline + full text
  - **Clickable source link** — shows source title, publisher, and a link icon. Tapping opens the source URL (YouTube video or Google Search for the article) in a new tab
7. **External Links** — Wikipedia, Spotify, YouTube Music search links

**Styling:** Dark theme matching the TV app. Nunito Sans font. Glass-card sections. Loading skeleton while AI generates.

---

## Part 5: Route Registration

**File: `src/App.tsx**`

Add: `<Route path="/companion/:trackId" element={<Companion />} />`

---

## Summary of Changes


| File                                             | Change                                                                |
| ------------------------------------------------ | --------------------------------------------------------------------- |
| `package.json`                                   | Add `qrcode.react`                                                    |
| `src/pages/Listen.tsx`                           | Add QR code component (bottom-left)                                   |
| `src/pages/Companion.tsx`                        | New mobile companion page with clickable source links on every nugget |
| `supabase/functions/generate-companion/index.ts` | New edge function — listen-count-scaled nuggets with source URLs      |
| `src/App.tsx`                                    | Add `/companion/:trackId` route                                       |


### Source Link Behavior on Companion Page

Every nugget card has a tappable source attribution at the bottom:

- Shows an external-link icon + source title + publisher name
- YouTube sources → opens `https://www.youtube.com/watch?v={videoId}`
- Article/interview sources → opens a targeted Google Search URL (same pattern as `generate-nuggets`: `"Article Title" site:publisher.com artist`)
- Opens in a new tab (`target="_blank" rel="noopener"`)

### Companion Page Mobile Layout

```text
┌─────────────────────────┐
│  🎵 MusicNerd           │
├─────────────────────────┤
│   [Artist Photo]        │
├─────────────────────────┤
│  Artist Name            │
│  Genre · Genre          │
│  Bio paragraph...       │
├─────────────────────────┤
│  🎵 Track Title         │
│  Album Name             │
├─────────────────────────┤
│  About the Artist       │
│  Long-form summary...   │
├─────────────────────────┤
│  About This Track       │
│  Long-form story...     │
├─────────────────────────┤
│  Nuggets (3/6/9)        │
│  ┌───────────────────┐  │
│  │ The Artist        │  │
│  │ Headline text     │  │
│  │ Full explanation  │  │
│  │ 🔗 Source Title → │  │  ← clickable, opens source
│  └───────────────────┘  │
│  ┌───────────────────┐  │
│  │ The Track         │  │
│  │ ...               │  │
│  │ 🔗 Source Title → │  │
│  └───────────────────┘  │
│  (repeat per tier)      │
├─────────────────────────┤
│  Explore Further        │
│  📖 Wikipedia →         │
│  🎵 Spotify →           │
│  ▶  YouTube Music →     │
└─────────────────────────┘
```