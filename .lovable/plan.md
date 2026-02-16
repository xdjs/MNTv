

# YouTube-Powered Nuggets with Real Sources

## What's Changing

The current system asks Gemini to "imagine" what sources exist -- it has no internet access, so every URL, quote, and video reference is fabricated. We're going to flip this: **find real YouTube content first, read the actual transcripts, then generate nuggets from that real material.**

## The New Pipeline

```text
Step 1: YouTube Data API  -->  Search for interviews, documentaries, breakdowns
                               about the artist + song (returns real video IDs)

Step 2: YouTube Innertube  -->  Fetch actual transcripts from those videos
        (server-side)           (no OAuth needed, works for any public video)

Step 3: Gemini API         -->  Generate nuggets FROM the real transcript content
        + Google Search         + ground article sources with Google Search
        Grounding               (returns verified article URLs with citations)

Step 4: Return to app      -->  Every nugget has a real YouTube embedId OR
                                a real article URL -- everything is clickable
```

## Why This Works

- YouTube transcripts contain the richest, most specific information about artists -- the exact quotes, stories, and details that make great trivia
- Gemini with Google Search grounding can find and cite real articles with verified URLs
- YouTube Data API gives us real video IDs that work for in-app embedding
- Everything stays server-side in the edge function, so no CORS issues with YouTube's internal API

## What You Need

A Google AI API key from https://aistudio.google.com/apikeys -- this single key powers:
- Gemini API with Google Search grounding (for article sources)
- YouTube Data API v3 (for video search) -- make sure YouTube Data API v3 is enabled in your Google Cloud console

You mentioned you have the key ready, so we'll store it as `GOOGLE_AI_API_KEY`.

## Detailed Changes

### 1. Add Secret: `GOOGLE_AI_API_KEY`

Store your Google API key securely as a backend secret.

### 2. Rewrite `supabase/functions/generate-nuggets/index.ts`

The edge function becomes a multi-step pipeline:

**Step 1 -- Find YouTube videos:**
- Call YouTube Data API: `GET https://www.googleapis.com/youtube/v3/search?q={artist}+{song}+interview+OR+breakdown+OR+documentary&type=video&part=snippet&maxResults=5`
- Get back real video IDs, titles, and channel names

**Step 2 -- Fetch transcripts:**
- For each video, call YouTube's internal Innertube API (`POST https://www.youtube.com/youtubei/v1/player`) to get caption track URLs
- Download and parse the caption XML to get plain text transcripts
- This works server-side for any public video with captions (auto-generated or manual)
- If a video has no captions, skip it gracefully

**Step 3 -- Generate nuggets with Gemini:**
- Call Gemini API directly at `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent`
- Include the `google_search` grounding tool so Gemini can also find real articles
- Pass the real YouTube transcripts as context in the prompt
- The prompt tells Gemini: "Here are real transcripts from these YouTube videos about {artist}. Generate 3 trivia nuggets. For YouTube sources, reference the actual video and timestamp. For article sources, use Google Search to find and cite real articles."
- Gemini returns nuggets with `groundingMetadata.groundingChunks` containing real article URLs
- For YouTube-sourced nuggets, we already have the real video IDs from Step 1

**Step 4 -- Assemble response:**
- Each nugget comes back with either:
  - A real YouTube `embedId` + video title + channel name + timestamp from the transcript
  - A real article `url` from Google Search grounding citations

### 3. Update `src/hooks/useAINuggets.ts`

- Remove the Google Search URL fallback hack (no more `googleSearchUrl` construction)
- Pass through the real `url` and `embedId` directly from the API response
- Sources will now have genuine, clickable data

### 4. Update `src/components/overlays/MediaOverlay.tsx`

- YouTube embeds will work because `embedId` is now a real video ID
- Change "Search for source" to "Watch on YouTube" with a direct link to the real video
- If a timestamp locator exists, append `?start=` to the embed URL so it jumps to the relevant moment

### 5. Update `src/components/overlays/ReadingOverlay.tsx`

- Change "Search for source" to "Read Article" since the URL is now a real, verified link
- For articles with real URLs, add an iframe option to read within the app (TV-optimized)
- Keep the sidebar panel layout for the TV experience

## Expected Performance

- YouTube search: ~500ms
- Transcript fetching (up to 3 videos in parallel): ~1-2s
- Gemini with grounding: ~3-5s
- **Total: ~5-8 seconds** (acceptable for a "loading nuggets" experience)

## Fallback Behavior

- If YouTube search returns no results: Gemini still generates nuggets using Google Search grounding only (article-heavy)
- If transcripts are unavailable (no captions): Use video titles/descriptions as context instead
- If Google Search grounding doesn't return a citation: Fall back to a Google Search link for that specific source
- If the API key is missing: Return a clear error message

## Files Changed

| File | Change |
|------|--------|
| `supabase/functions/generate-nuggets/index.ts` | Full rewrite: YouTube search, transcript fetch, Gemini with grounding |
| `src/hooks/useAINuggets.ts` | Remove URL fallback hack, pass through real URLs and embedIds |
| `src/components/overlays/MediaOverlay.tsx` | "Watch on YouTube" with real link, timestamp support in embed |
| `src/components/overlays/ReadingOverlay.tsx` | "Read Article" with real link, optional in-app iframe |

