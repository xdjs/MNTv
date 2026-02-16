import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ── Step 1: YouTube Data API search ──────────────────────────────────
interface YTVideo {
  videoId: string;
  title: string;
  channelTitle: string;
}

async function searchYouTube(query: string, apiKey: string): Promise<YTVideo[]> {
  const url = new URL("https://www.googleapis.com/youtube/v3/search");
  url.searchParams.set("q", query);
  url.searchParams.set("type", "video");
  url.searchParams.set("part", "snippet");
  url.searchParams.set("maxResults", "5");
  url.searchParams.set("key", apiKey);

  const res = await fetch(url.toString());
  if (!res.ok) {
    console.error("YouTube search failed:", res.status, await res.text());
    return [];
  }
  const data = await res.json();
  return (data.items || []).map((item: any) => ({
    videoId: item.id?.videoId,
    title: item.snippet?.title,
    channelTitle: item.snippet?.channelTitle,
  })).filter((v: YTVideo) => v.videoId);
}

// ── Step 2: Fetch transcript via Innertube ───────────────────────────
async function fetchTranscript(videoId: string): Promise<string | null> {
  try {
    // Step 2a: Get caption track URLs from Innertube player endpoint
    const playerRes = await fetch(
      "https://www.youtube.com/youtubei/v1/player?prettyPrint=false",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        },
        body: JSON.stringify({
          videoId,
          context: {
            client: {
              clientName: "WEB",
              clientVersion: "2.20240101.00.00",
              hl: "en",
            },
          },
        }),
      }
    );

    if (!playerRes.ok) return null;
    const playerData = await playerRes.json();

    const captionTracks =
      playerData?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
    if (!captionTracks || captionTracks.length === 0) return null;

    // Prefer English, fall back to first available
    const enTrack = captionTracks.find(
      (t: any) => t.languageCode === "en" || t.languageCode?.startsWith("en")
    );
    const track = enTrack || captionTracks[0];
    const captionUrl = track.baseUrl;
    if (!captionUrl) return null;

    // Step 2b: Fetch the caption XML
    const captionRes = await fetch(captionUrl);
    if (!captionRes.ok) return null;
    const xml = await captionRes.text();

    // Parse XML to extract plain text (strip tags, decode entities)
    const textSegments = xml
      .match(/<text[^>]*>([\s\S]*?)<\/text>/g)
      ?.map((seg) =>
        seg
          .replace(/<[^>]+>/g, "")
          .replace(/&amp;/g, "&")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .replace(/&apos;/g, "'")
      );

    if (!textSegments || textSegments.length === 0) return null;

    // Limit transcript to ~4000 chars to stay within prompt limits
    let transcript = textSegments.join(" ");
    if (transcript.length > 4000) transcript = transcript.slice(0, 4000) + "...";
    return transcript;
  } catch (e) {
    console.error(`Transcript fetch failed for ${videoId}:`, e);
    return null;
  }
}

// ── Step 3: Gemini with Google Search grounding ──────────────────────
interface GeminiNugget {
  text: string;
  kind: string;
  listenFor: boolean;
  source: {
    type: "youtube" | "article" | "interview";
    title: string;
    publisher: string;
    quoteSnippet: string;
    locator?: string;
    videoIndex?: number; // index into the videos array for youtube sources
  };
}

async function generateWithGemini(
  artist: string,
  title: string,
  album: string | undefined,
  videos: YTVideo[],
  transcripts: Map<string, string>,
  apiKey: string
): Promise<{ nuggets: GeminiNugget[]; groundingChunks: any[] }> {
  // Build transcript context
  const transcriptContext = videos
    .filter((v) => transcripts.has(v.videoId))
    .map((v, i) => {
      const t = transcripts.get(v.videoId)!;
      return `[VIDEO ${i}] "${v.title}" by ${v.channelTitle} (videoId: ${v.videoId})\nTranscript excerpt:\n${t}`;
    })
    .join("\n\n---\n\n");

  const videoListContext = videos
    .map((v, i) => `[VIDEO ${i}] "${v.title}" by ${v.channelTitle} (videoId: ${v.videoId})`)
    .join("\n");

  const prompt = `You are a music historian and trivia expert. Given a song and real YouTube transcripts, generate exactly 3 fascinating, accurate pieces of trivia.

Song: "${title}" by ${artist}${album ? ` from the album "${album}"` : ""}

Available YouTube videos:
${videoListContext}

${transcriptContext ? `Real transcript content from these videos:\n\n${transcriptContext}` : "No transcripts available — use your knowledge to find real sources."}

Rules:
- Generate exactly 3 nuggets with diverse "kind" values
- Set exactly ONE nugget's listenFor to true (an audio moment to listen for)
- For nuggets sourced from the YouTube transcripts above: set source.type to "youtube", reference the real video title and channel, include a real quote from the transcript, and set source.videoIndex to the VIDEO index number
- For nuggets sourced from articles: set source.type to "article" or "interview", cite a real publication name and article title.
- Include a locator (timestamp like "3:12" for videos, or "Paragraph 6" for articles) when possible
- Each nugget must be factually accurate and based on the real content provided
- Aim for at least 1 YouTube source and at least 1 article source across the 3 nuggets

Return ONLY a JSON object with this exact structure:
{
  "nuggets": [
    {
      "text": "1-3 sentences of surprising, accurate music trivia",
      "kind": "process|constraint|pattern|human|influence",
      "listenFor": false,
      "source": {
        "type": "youtube|article|interview",
        "title": "Real title",
        "publisher": "Real publisher/channel",
        "quoteSnippet": "Real or closely paraphrased quote",
        "locator": "3:12",
        "videoIndex": 0
      }
    }
  ]
}`;

  const body: any = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    tools: [{ google_search: {} }],
    generationConfig: { temperature: 0.7 },
  };

  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

  // Retry up to 3 times on 429 rate limit
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (res.ok) {
      const data = await res.json();
      const candidate = data.candidates?.[0];
      const text = candidate?.content?.parts?.[0]?.text || "";
      const groundingMeta = candidate?.groundingMetadata;
      const groundingChunks = groundingMeta?.groundingChunks || [];

      let parsed: { nuggets: GeminiNugget[] };
      try {
        const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
        parsed = JSON.parse(cleaned);
      } catch {
        console.error("Failed to parse Gemini response:", text);
        throw new Error("Failed to parse Gemini response");
      }
      return { nuggets: parsed.nuggets || [], groundingChunks };
    }

    if (res.status === 429 && attempt < 2) {
      // Parse retry delay from error response
      const errData = await res.json().catch(() => null);
      const retryInfo = errData?.error?.details?.find((d: any) => d["@type"]?.includes("RetryInfo"));
      const delaySec = parseInt(retryInfo?.retryDelay || "30", 10);
      const waitMs = Math.min((delaySec + 5) * 1000, 55000); // cap at 55s to stay in function timeout
      console.log(`Rate limited, waiting ${waitMs / 1000}s before retry ${attempt + 1}...`);
      await new Promise((r) => setTimeout(r, waitMs));
      continue;
    }

    const errText = await res.text();
    console.error("Gemini API error:", res.status, errText);
    lastError = new Error(`Gemini API error: ${res.status}`);
  }

  throw lastError || new Error("Gemini API failed after retries");
}

// ── Main handler ─────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { artist, title, album } = await req.json();

    if (!artist || !title) {
      return new Response(
        JSON.stringify({ error: "artist and title are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const GOOGLE_AI_API_KEY = Deno.env.get("GOOGLE_AI_API_KEY");
    if (!GOOGLE_AI_API_KEY) {
      throw new Error("GOOGLE_AI_API_KEY is not configured");
    }

    // Step 1: Search YouTube for relevant videos (optional, needs YouTube Data API enabled)
    let videos: YTVideo[] = [];
    try {
      const searchQuery = `${artist} ${title} interview OR breakdown OR behind the scenes OR documentary`;
      videos = await searchYouTube(searchQuery, GOOGLE_AI_API_KEY);
    } catch (e) {
      console.warn("YouTube search skipped:", e);
    }
    console.log(`Found ${videos.length} YouTube videos for "${artist} - ${title}"`);

    // Step 2: Fetch transcripts in parallel (top 3 videos)
    const videosToFetch = videos.slice(0, 3);
    const transcripts = new Map<string, string>();

    const transcriptResults = await Promise.allSettled(
      videosToFetch.map(async (v) => {
        const t = await fetchTranscript(v.videoId);
        return { videoId: v.videoId, transcript: t };
      })
    );

    for (const result of transcriptResults) {
      if (result.status === "fulfilled" && result.value.transcript) {
        transcripts.set(result.value.videoId, result.value.transcript);
      }
    }
    console.log(`Fetched ${transcripts.size} transcripts`);

    // Step 3: Generate nuggets with Gemini
    const { nuggets: rawNuggets, groundingChunks } = await generateWithGemini(
      artist,
      title,
      album,
      videos,
      transcripts,
      GOOGLE_AI_API_KEY
    );

    // Step 4: Assemble response with real video IDs and grounded URLs
    const nuggets = rawNuggets.map((n) => {
      const result: any = {
        text: n.text,
        kind: n.kind,
        listenFor: n.listenFor,
        source: {
          type: n.source.type,
          title: n.source.title,
          publisher: n.source.publisher,
          quoteSnippet: n.source.quoteSnippet,
          locator: n.source.locator,
        },
      };

      if (n.source.type === "youtube" && n.source.videoIndex != null) {
        const video = videos[n.source.videoIndex];
        if (video) {
          result.source.embedId = video.videoId;
          result.source.url = `https://www.youtube.com/watch?v=${video.videoId}`;
        }
      }

      // For article sources, try to find a matching grounding chunk URL
      if (
        (n.source.type === "article" || n.source.type === "interview") &&
        groundingChunks.length > 0
      ) {
        const matchingChunk = groundingChunks.find(
          (c: any) =>
            c.web?.title?.toLowerCase().includes(n.source.publisher.toLowerCase()) ||
            c.web?.title?.toLowerCase().includes(n.source.title.toLowerCase().slice(0, 20))
        );
        if (matchingChunk?.web?.uri) {
          result.source.url = matchingChunk.web.uri;
        }
      }

      // Fallback: Google Search link if no real URL found
      if (!result.source.url) {
        const q = `${n.source.title} ${n.source.publisher} ${artist}`;
        result.source.url = `https://www.google.com/search?q=${encodeURIComponent(q)}`;
      }

      return result;
    });

    return new Response(JSON.stringify({ nuggets }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-nuggets error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
