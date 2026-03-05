import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ── YouTube Data API search ──────────────────────────────────────────
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
    const errText = await res.text();
    console.error("YouTube search failed:", res.status, errText);
    return [];
  }
  const data = await res.json();
  return (data.items || [])
    .map((item: any) => ({
      videoId: item.id?.videoId,
      title: item.snippet?.title,
      channelTitle: item.snippet?.channelTitle,
    }))
    .filter((v: YTVideo) => v.videoId);
}

// ── Fetch transcript via Innertube ───────────────────────────────────
async function fetchTranscript(videoId: string): Promise<string | null> {
  try {
    const playerRes = await fetch(
      "https://www.youtube.com/youtubei/v1/player?prettyPrint=false",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
        body: JSON.stringify({
          videoId,
          context: {
            client: { clientName: "WEB", clientVersion: "2.20240101.00.00", hl: "en" },
          },
        }),
      }
    );
    if (!playerRes.ok) return null;
    const playerData = await playerRes.json();

    const captionTracks =
      playerData?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
    if (!captionTracks?.length) return null;

    const enTrack = captionTracks.find(
      (t: any) => t.languageCode === "en" || t.languageCode?.startsWith("en")
    );
    const track = enTrack || captionTracks[0];
    if (!track.baseUrl) return null;

    const captionRes = await fetch(track.baseUrl);
    if (!captionRes.ok) return null;
    const xml = await captionRes.text();

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

    if (!textSegments?.length) return null;
    let transcript = textSegments.join(" ");
    if (transcript.length > 4000) transcript = transcript.slice(0, 4000) + "...";
    return transcript;
  } catch (e) {
    console.error(`Transcript fetch failed for ${videoId}:`, e);
    return null;
  }
}

class RecitationError extends Error {
  constructor() { super("RECITATION"); this.name = "RecitationError"; }
}

// ── Tier configuration ──────────────────────────────────────────────
type Tier = "casual" | "curious" | "nerd";

const TIER_CONFIG: Record<Tier, {
  tone: string;
  artistFocus: string;
  trackFocus: string;
  discoveryFocus: string;
  sourceExpectation: string;
  model: string;
  temperature: number;
}> = {
  casual: {
    tone: "Conversational, jargon-free, feel-good. Like texting a friend a fun fact.",
    artistFocus: "Humanizing details, fun anecdotes, latest news. Relatable and interesting.",
    trackFocus: "The vibe, a fun fact about how it was made. No music theory.",
    discoveryFocus: "Similar vibe, easy to get into. 'If you like this, you'll love...'",
    sourceExpectation: "Social media, mainstream interviews, YouTube, Wikipedia.",
    model: "gemini-2.5-flash",
    temperature: 1.0,
  },
  curious: {
    tone: "Engaging storytelling. Balanced depth — production details + cultural connections.",
    artistFocus: "Career context, creative evolution, artistic tensions.",
    trackFocus: "Production choices, songwriting process, cultural moment.",
    discoveryFocus: "Genuine musical thread — shared producer, genre lineage, thematic connection.",
    sourceExpectation: "Pitchfork, Rolling Stone, AllMusic, quality interviews.",
    model: "gemini-2.5-flash",
    temperature: 0.9,
  },
  nerd: {
    tone: "Authoritative, technical, maximum depth. Assume music terminology fluency.",
    artistFocus: "Technical innovations, gear, influence chains, recording philosophy.",
    trackFocus: "Production techniques, harmonic analysis, exact gear/studio/engineer details.",
    discoveryFocus: "Obscure but connected — session musicians, sample sources, micro-history.",
    sourceExpectation: "Sound on Sound, Tape Op, Discogs, MusicBrainz, Reddit deep dives.",
    model: "gemini-2.5-pro",
    temperature: 0.8,
  },
};

// ── Generate nuggets with Gemini + Google Search grounding ───────────
interface GeminiNugget {
  headline: string;
  text: string;
  kind: "artist" | "track" | "discovery";
  listenFor: boolean;
  imageHint?: {
    type: "artist" | "album" | "wiki";
    query: string;
    caption: string;
  };
  source: {
    type: "youtube" | "article" | "interview";
    title: string;
    publisher: string;
    quoteSnippet: string;
    locator?: string;
    videoIndex?: number;
  };
}

async function generateWithGemini(
  artist: string,
  title: string,
  album: string | undefined,
  videos: YTVideo[],
  transcripts: Map<string, string>,
  apiKey: string,
  listenCount: number = 1,
  previousNuggets: string[] = [],
  tier: Tier = "casual"
): Promise<{ nuggets: GeminiNugget[]; groundingChunks: any[] }> {
  const tierConfig = TIER_CONFIG[tier];
  const transcriptContext = videos
    .filter((v) => transcripts.has(v.videoId))
    .map((v, i) => {
      const t = transcripts.get(v.videoId)!;
      return `[VIDEO ${i}] "${v.title}" by ${v.channelTitle} (videoId: ${v.videoId})\nTranscript:\n${t}`;
    })
    .join("\n\n---\n\n");

  const videoListContext = videos
    .map((v, i) => `[VIDEO ${i}] "${v.title}" by ${v.channelTitle} (videoId: ${v.videoId})`)
    .join("\n");

  // Depth tier instructions
  let depthInstruction: string;
  if (listenCount <= 1) {
    depthInstruction = "This is the listener's FIRST TIME hearing this track. Be introductory and welcoming. Set the stage — who is this artist, what's the basic story of this song, and what's one obvious next listen.";
  } else if (listenCount === 2) {
    depthInstruction = "The listener has heard this before. Skip the basics. Go deeper — surprising production details, lesser-known connections, a more adventurous recommendation.";
  } else {
    depthInstruction = "The listener keeps coming back (listen #" + listenCount + "). Give them deep cuts — obscure influences, technical breakdowns, unexpected cultural connections, niche recommendations only a true nerd would know.";
  }

  const nonRepeatInstruction = previousNuggets.length > 0
    ? `\n\nDO NOT repeat or closely rephrase any of these previously shown headlines:\n${previousNuggets.map((h) => `- "${h}"`).join("\n")}\nGenerate completely fresh angles.`
    : "";

  const prompt = `You are a music historian and trivia expert. Generate exactly 3 fascinating nuggets about the song "${title}" by the artist/band ${artist}${album ? ` from the album "${album}"` : ""}.

IMPORTANT DISAMBIGUATION: The ARTIST/BAND is "${artist}". The SONG/TRACK is "${title}". These are different — "${title}" is the song name, NOT a band. All nuggets must be about the artist "${artist}" and their song "${title}".

DEPTH CONTEXT: ${depthInstruction}${nonRepeatInstruction}

TONE & STYLE: ${tierConfig.tone}
SOURCE EXPECTATIONS: Prefer sources from ${tierConfig.sourceExpectation}.

${videoListContext ? `Available YouTube videos:\n${videoListContext}\n` : ""}
${transcriptContext ? `Real transcript content:\n\n${transcriptContext}\n` : "No transcripts available — use your knowledge and Google Search to find real sources."}

STRUCTURE — always exactly 3 nuggets in this order:
1. **Nugget 1 — kind: "artist"**: About the artist/band ${artist}. ${tierConfig.artistFocus}. listenFor: false.
2. **Nugget 2 — kind: "track"**: About the song "${title}" by ${artist}. ${tierConfig.trackFocus}. listenFor: true.
3. **Nugget 3 — kind: "discovery"**: ${tierConfig.discoveryFocus}. Be opinionated and specific like a knowledgeable friend. listenFor: false.

CRITICAL RULES:
- Each nugget MUST have TWO text fields:
  - "headline": 1-2 sentences that spark curiosity and make the reader WANT to learn more. Don't write a dry fact — write something that teases a surprising detail or asks an implicit question. Examples: "The cash register sounds at the start? Roger Waters recorded them by throwing coins into a mixing bowl in his pottery shed." or "There's a reason this song feels unsettling — and it has nothing to do with the lyrics." Make the reader think "wait, really?" or "tell me more."
  - "text": The full 2-3 sentence explanation that delivers on the headline's promise with rich detail and context.
- Each nugget MUST have an "imageHint" object to suggest a contextually relevant real image:
  - "type": one of "artist" (for a person — musician, producer, collaborator), "album" (for an album cover), or "wiki" (for an object, place, instrument, studio, etc.)
   - "query": a SPECIFIC search term that will find an image showing EXACTLY what the caption describes. If the caption mentions a specific instrument, the query MUST include that instrument name. If it mentions a person, include their name AND what they're doing or holding. Examples: "David Gilmour playing Black Strat guitar", "Fender Rhodes electric piano", "Abbey Road Studios interior", "Syd Barrett with guitar 1967". NEVER use a generic person name alone — always add the specific subject (instrument, object, setting) that the caption references.
   - "caption": a SHORT sentence (6-12 words) that explains HOW this image connects to the nugget's content. Do NOT just label the image — explain its relevance. Examples: "The Fender Rhodes that gave this track its shimmer" or "Nile Rodgers — the groove architect behind this hit" or "Abbey Road's Studio Two, where this was recorded". The viewer sees the image + caption WITHOUT the nugget text, so the caption must make the image's connection to the music self-evident.
  - Pick the most visually interesting and relevant subject for each nugget. Prefer specific people, instruments, studios, or album covers over abstract concepts.
- For nugget 3 (discovery): The headline should feel like a friend nudging you with genuine enthusiasm, e.g. "If this groove hit you right, you need to hear what Nile Rodgers did on this other track."
- For YouTube sources from videos above: set type "youtube", include videoIndex, include a real quote
- For article/interview sources: cite REAL publications with real article titles
- Include locator (timestamp for videos, section for articles) when possible
- Be factually accurate — do not fabricate quotes or facts

Return ONLY valid JSON:
{
  "nuggets": [
    {
      "headline": "One punchy complete sentence hook",
      "text": "2-3 sentences of surprising music trivia with full detail",
      "kind": "artist|track|discovery",
      "listenFor": false,
      "imageHint": {
        "type": "artist|album|wiki",
        "query": "Search term for real image",
        "caption": "Short caption"
      },
      "source": {
        "type": "youtube|article|interview",
        "title": "Real source title",
        "publisher": "Real publisher/channel name",
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
    generationConfig: { temperature: tierConfig.temperature },
  };

  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${tierConfig.model}:generateContent?key=${apiKey}`;

  // Retry up to 3 times on 429
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (res.ok) {
      const data = await res.json();
      const candidate = data.candidates?.[0];
      
      // Check for blocked/empty responses
      const finishReason = candidate?.finishReason;
      if (finishReason === "SAFETY") {
        console.warn("Gemini blocked response due to SAFETY");
        throw new Error("Gemini blocked response: SAFETY");
      }
      if (finishReason === "RECITATION") {
        console.warn("Gemini blocked response due to RECITATION, will retry without transcripts");
        // Signal caller to retry without transcript context
        throw new RecitationError();
      }
      
      const text = candidate?.content?.parts?.[0]?.text || "";
      const groundingChunks = candidate?.groundingMetadata?.groundingChunks || [];

      if (!text.trim()) {
        console.error("Gemini returned empty text. Candidate:", JSON.stringify(candidate));
        // Retry if we have attempts left
        if (attempt < 2) {
          console.log("Empty response, retrying...");
          await new Promise((r) => setTimeout(r, 2000));
          continue;
        }
        throw new Error("Gemini returned empty response after retries");
      }

      let parsed: { nuggets: GeminiNugget[] };
      try {
        const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
        parsed = JSON.parse(cleaned);
      } catch {
        console.error("Failed to parse Gemini response:", text.slice(0, 500));
        if (attempt < 2) {
          console.log("Parse failed, retrying...");
          await new Promise((r) => setTimeout(r, 2000));
          continue;
        }
        throw new Error("Failed to parse Gemini response");
      }
      return { nuggets: parsed.nuggets || [], groundingChunks };
    }

    if (res.status === 429 && attempt < 2) {
      const errData = await res.json().catch(() => null);
      const retryInfo = errData?.error?.details?.find((d: any) => d["@type"]?.includes("RetryInfo"));
      const retryDelay = retryInfo?.retryDelay || "5s";
      // Parse delay like "0.606s" or "5s"
      const delaySec = parseFloat(retryDelay.replace("s", "")) || 5;
      const waitMs = Math.min((delaySec + 2) * 1000, 55000);
      console.log(`Rate limited, waiting ${waitMs / 1000}s before retry ${attempt + 1}...`);
      await new Promise((r) => setTimeout(r, waitMs));
      continue;
    }

    const errText = await res.text();
    console.error("Gemini API error:", res.status, errText);
    throw new Error(`Gemini API error: ${res.status}`);
  }

  throw new Error("Gemini API failed after retries");
}

// ── Main handler ─────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { artist, title, album, deepDive, context, sourceTitle, sourcePublisher, imageCaption, imageQuery, listenCount, previousNuggets, tier: rawTier } = body;
    const tier: Tier = (rawTier === "casual" || rawTier === "curious" || rawTier === "nerd") ? rawTier : "casual";

    // ── Input validation ────────────────────────────────────────────
    const MAX_STR = 300;
    const MAX_CONTEXT = 2000;
    const MAX_ARRAY = 50;

    if (!artist || typeof artist !== "string" || artist.trim().length === 0 || artist.length > MAX_STR) {
      return new Response(JSON.stringify({ error: "Invalid artist (max 300 chars)" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (!title || typeof title !== "string" || title.trim().length === 0 || title.length > MAX_STR) {
      return new Response(JSON.stringify({ error: "Invalid title (max 300 chars)" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (album !== undefined && album !== null && (typeof album !== "string" || album.length > MAX_STR)) {
      return new Response(JSON.stringify({ error: "Invalid album" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (context !== undefined && (typeof context !== "string" || context.length > MAX_CONTEXT)) {
      return new Response(JSON.stringify({ error: "Invalid context (max 2000 chars)" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const safeListenCount = Math.max(1, Math.min(10, typeof listenCount === "number" ? Math.floor(listenCount) : 1));
    const safePreviousNuggets: string[] = Array.isArray(previousNuggets)
      ? previousNuggets.slice(0, MAX_ARRAY).map((s: unknown) => (typeof s === "string" ? s.slice(0, 200) : "")).filter(Boolean)
      : [];
    const safeSourceTitle = typeof sourceTitle === "string" ? sourceTitle.slice(0, 300) : undefined;
    const safeSourcePublisher = typeof sourcePublisher === "string" ? sourcePublisher.slice(0, 200) : undefined;
    const safeImageCaption = typeof imageCaption === "string" ? imageCaption.slice(0, 300) : undefined;
    const safeImageQuery = typeof imageQuery === "string" ? imageQuery.slice(0, 300) : undefined;

    const GOOGLE_AI_API_KEY = Deno.env.get("GOOGLE_AI_API_KEY");
    if (!GOOGLE_AI_API_KEY) {
      throw new Error("GOOGLE_AI_API_KEY is not configured");
    }

    // ── Deep Dive mode ──────────────────────────────────────────────
    if (deepDive) {
      const deepDivePrompt = `You are a music historian having a fascinating conversation about "${title}" by ${artist}.

The user has been reading this trivia and wants to go deeper:
---
${context}
---
${safeSourceTitle ? `The original source was: "${safeSourceTitle}" by ${safeSourcePublisher}` : ""}
${safeImageCaption ? `An image was shown alongside this nugget: "${safeImageQuery}" with caption "${safeImageCaption}". If relevant, weave in how this visual element connects to the deeper story.` : ""}

Continue this thread of discovery. Provide ONE more paragraph of 2-3 sentences MAX (under 80 words total) that goes deeper — reveal connections, context, or implications that make this even more interesting. Be concise and punchy — this is for a TV screen. Think about WHY this matters, HOW it connects to broader music history, or WHAT it reveals about the creative process.

Be conversational but authoritative. Channel the spirit of a music nerd who can't stop sharing fascinating connections.

End with a brief "followUp" — a one-sentence teaser about what could be explored next.

Return ONLY valid JSON:
{
  "deepDive": {
    "text": "Your deeper exploration paragraph here",
    "followUp": "One-sentence teaser for the next exploration"
  }
}`;

      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GOOGLE_AI_API_KEY}`;
      const res = await fetch(geminiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: deepDivePrompt }] }],
          tools: [{ google_search: {} }],
          generationConfig: { temperature: 1.0 },
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        console.error("Deep dive Gemini error:", res.status, errText);
        throw new Error(`Gemini API error: ${res.status}`);
      }

      const data = await res.json();
      const candidate = data.candidates?.[0];
      const text = candidate?.content?.parts?.[0]?.text || "";
      
      if (!text.trim()) {
        console.error("Deep dive returned empty. Candidate:", JSON.stringify(candidate));
        return new Response(JSON.stringify({ 
          deepDive: { 
            text: "This topic is fascinating but I couldn't dig deeper right now. Try again in a moment.", 
            followUp: "There's always more to discover." 
          } 
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      let parsed;
      try {
        const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
        parsed = JSON.parse(cleaned);
      } catch {
        console.error("Failed to parse deep dive:", text.slice(0, 500));
        return new Response(JSON.stringify({ 
          deepDive: { 
            text: "Couldn't process that exploration. Try again in a moment.", 
            followUp: "There's always more to discover." 
          } 
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify(parsed), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Standard nugget generation ──────────────────────────────────
    // Step 1: Search YouTube (needs YouTube Data API v3 enabled)
    let videos: YTVideo[] = [];
    try {
      const searchQuery = `"${artist}" "${title}" interview OR breakdown OR behind the scenes`;
      videos = await searchYouTube(searchQuery, GOOGLE_AI_API_KEY);
    } catch (e) {
      console.warn("YouTube search skipped:", e);
    }
    console.log(`Found ${videos.length} YouTube videos for "${artist} - ${title}"`);

    // Step 2: Fetch transcripts in parallel (top 3)
    const transcripts = new Map<string, string>();
    if (videos.length > 0) {
      const results = await Promise.allSettled(
        videos.slice(0, 3).map(async (v) => {
          const t = await fetchTranscript(v.videoId);
          return { videoId: v.videoId, transcript: t };
        })
      );
      for (const r of results) {
        if (r.status === "fulfilled" && r.value.transcript) {
          transcripts.set(r.value.videoId, r.value.transcript);
        }
      }
    }
    console.log(`Fetched ${transcripts.size} transcripts`);

    // Step 3: Generate nuggets with Gemini + Google Search grounding
    let rawNuggets: any[];
    let groundingChunks: any[];
    try {
      const result = await generateWithGemini(
        artist, title, album, videos, transcripts, GOOGLE_AI_API_KEY, safeListenCount, safePreviousNuggets, tier
      );
      rawNuggets = result.nuggets;
      groundingChunks = result.groundingChunks;
    } catch (e) {
      if (e instanceof RecitationError) {
        console.log("Retrying without transcripts to avoid RECITATION block...");
        const result = await generateWithGemini(
          artist, title, album, videos, new Map(), GOOGLE_AI_API_KEY, safeListenCount, safePreviousNuggets, tier
        );
        rawNuggets = result.nuggets;
        groundingChunks = result.groundingChunks;
      } else {
        throw e;
      }
    }

    console.log(`[Grounding] ${groundingChunks.length} chunks for "${artist} - ${title}":`,
      groundingChunks.map((c: any) => ({ title: c?.web?.title, uri: c?.web?.uri })));

    // Step 4: Assemble response with real video IDs and grounding-sourced URLs
    const nuggets = rawNuggets.map((n) => {
      const source = n.source || {};
      const result: any = {
        headline: n.headline,
        text: n.text,
        kind: n.kind,
        listenFor: n.listenFor,
        imageHint: n.imageHint || null,
        source: {
          type: source.type || "article",
          title: source.title || `${title} by ${artist}`,
          publisher: source.publisher || "Unknown",
          quoteSnippet: source.quoteSnippet || "",
          locator: source.locator,
        },
      };

      // Attach real embedId for YouTube sources
      if (source.type === "youtube" && source.videoIndex != null) {
        const video = videos[source.videoIndex];
        if (video) {
          result.source.embedId = video.videoId;
          result.source.url = `https://www.youtube.com/watch?v=${video.videoId}`;
        }
      }

      // For non-YouTube sources, try to find a direct URL from Gemini's grounding chunks
      if (!result.source.url && groundingChunks.length > 0) {
        // Filter out Vertex/Google internal grounding URLs
        const realChunks = groundingChunks.filter((chunk: any) => {
          const uri = (chunk?.web?.uri || "").toLowerCase();
          const chunkTitle = (chunk?.web?.title || "").toLowerCase();
          return uri && !uri.includes("vertexaisearch.cloud.google.com") &&
                 !chunkTitle.includes("vertex ai") &&
                 !chunkTitle.includes("grounding api");
        });

        const pubLower = (source.publisher || "").toLowerCase();
        const titleLower = (source.title || "").toLowerCase();
        const artistLower = artist.toLowerCase();

        // Try exact match on publisher or source title
        let match = realChunks.find((chunk: any) => {
          const chunkTitle = (chunk?.web?.title || "").toLowerCase();
          const chunkUri = (chunk?.web?.uri || "").toLowerCase();
          return (
            (pubLower && pubLower !== "unknown" && (chunkTitle.includes(pubLower) || chunkUri.includes(pubLower))) ||
            (titleLower && chunkTitle.includes(titleLower))
          );
        });

        // Broader match: chunk mentions the artist
        if (!match) {
          match = realChunks.find((chunk: any) => {
            const chunkTitle = (chunk?.web?.title || "").toLowerCase();
            return chunkTitle.includes(artistLower);
          });
        }

        // Last resort: use the first real grounding chunk (Gemini thought it was relevant)
        if (!match && realChunks.length > 0) {
          match = realChunks[0];
        }

        if (match?.web?.uri) {
          result.source.url = match.web.uri;
          // Update publisher from grounding if it was generic
          if (!pubLower || pubLower === "unknown") {
            try {
              const hostname = new URL(match.web.uri).hostname.replace("www.", "");
              result.source.publisher = hostname;
            } catch { /* keep original */ }
          }
        }
      }

      // Fallback: "I'm Feeling Lucky" Google search (goes directly to top result)
      if (!result.source.url) {
        const q = `"${source.title || title}" ${source.publisher || ""} ${artist}`.trim();
        result.source.url = `https://www.google.com/search?btnI=1&q=${encodeURIComponent(q)}`;
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
