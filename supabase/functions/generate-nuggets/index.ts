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
  assumedKnowledge: string;
  artistFocus: string;
  trackFocus: string;
  discoveryFocus: string;
  sourceExpectation: string;
  model: string;
  temperature: number;
}> = {
  casual: {
    tone: "Conversational, warm, jargon-free. Like a knowledgeable friend sharing something cool they just learned. Wikipedia-level facts are perfectly fine — the goal is to make someone feel more connected to the music.",
    assumedKnowledge: "Assume the listener knows who this artist is but not much else. Introductory context is welcome.",
    artistFocus: "Who this person is as a human — their origin story, a memorable personality moment, a relatable struggle or triumph, or a surprising personal detail. Make them feel like a real person, not a Wikipedia entry.",
    trackFocus: "What this song FEELS like and one fun or surprising fact about how it was made — no technical jargon. If it has a great story behind it (the accident, the argument, the late-night session that changed everything), tell it simply and warmly.",
    discoveryFocus: "One artist with a very similar vibe that they could play right now and instantly enjoy. Be warm and direct: 'If this track hits right, you'll love...' Avoid artists they likely already know well.",
    sourceExpectation: "Wikipedia, mainstream music press (Rolling Stone, NME, Billboard), YouTube interviews, music documentaries.",
    model: "gemini-2.5-flash",
    temperature: 1.0,
  },
  curious: {
    tone: "Engaging storytelling with genuine depth. Go one layer deeper than Wikipedia — find the production detail, the cultural moment, the artistic tension that makes this truly interesting.",
    assumedKnowledge: "Assume some music knowledge. Don't reintroduce the artist from scratch. The listener wants context and backstory, not a biography summary.",
    artistFocus: "A career turning point, creative evolution, or artistic philosophy that shaped who they became. What were the tensions, decisions, or collaborations that defined their sound? Name specific people and moments.",
    trackFocus: "A specific production choice, songwriting decision, or cultural context that defined this track. Name the key collaborators, where it was recorded, what was happening in the artist's life or career at that moment.",
    discoveryFocus: "An artist with a genuine musical thread connecting them — a shared producer, a genre lineage, an influence relationship, or a thematic connection. Explain specifically WHY the connection exists, not just that it does.",
    sourceExpectation: "Pitchfork, Rolling Stone deeper features, AllMusic, quality podcast interviews (Zane Lowe, Broken Record, Song Exploder, Rolling Stone Music Now).",
    model: "gemini-2.5-flash",
    temperature: 0.9,
  },
  nerd: {
    tone: "Authoritative and technical. Assume full music terminology fluency. Skip the handholding — go straight to the specific, obscure, or analytical detail that this person couldn't find by casually googling.",
    assumedKnowledge: "Assume deep familiarity with the artist, their full catalog, and their genre/era. Skip biography entirely. Go to the technical, historical, or analytical layer that requires real knowledge to appreciate.",
    artistFocus: "Technical innovations and signature approaches: specific gear (name the exact make/model/year), recording chain, studio methodology, influence chains with named records, relationships with specific engineers and producers. What is their sonic fingerprint and exactly how do they achieve it?",
    trackFocus: "Production technique, harmonic or rhythmic analysis, specific studio and engineer details, specific take or edit decisions, what's happening in the mix that requires careful listening to notice. Be precise — name the exact gear, the exact technique, the specific moment in the track.",
    discoveryFocus: "An obscure but precisely connected record: a session musician they share, a sample source, a specific B-side or deep cut that influenced this track, a micro-genre ancestor, or an engineer whose fingerprint appears on both. The connection should be something only a real fan would know.",
    sourceExpectation: "Sound on Sound, Tape Op, Recording magazine, Discogs, MusicBrainz, academic music journals, specific Reddit communities (r/indieheads, r/LetsTalkMusic, r/audiophile), Resident Advisor (for electronic), gear wikis.",
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
  tier: Tier = "casual",
  userTopArtists: string[] = [],
  userTopTracks: string[] = []
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

  // Build listener taste context for personalized connections
  const tasteContext = userTopArtists.length > 0
    ? `\nLISTENER PROFILE — use this to personalize your nuggets:
This listener's top artists include: ${userTopArtists.slice(0, 8).join(", ")}.${userTopTracks.length > 0 ? `\nTheir top tracks include: ${userTopTracks.slice(0, 5).join(", ")}.` : ""}
Use this to:
- Draw genuine connections to artists they already love when relevant (not forced)
- Calibrate assumed knowledge — if they already listen to this artist, skip basic biography
- For the discovery nugget: recommend something adjacent to their existing taste that feels like an expert tip
- Do NOT recommend artists already in their top artists list\n`
    : "";

  const prompt = `You are a music historian and trivia expert. Generate exactly 3 fascinating nuggets about the song "${title}" by the artist/band ${artist}${album ? ` from the album "${album}"` : ""}.

IMPORTANT DISAMBIGUATION: The ARTIST/BAND is "${artist}". The SONG/TRACK is "${title}". These are different — "${title}" is the song name, NOT a band. All nuggets must be about the artist "${artist}" and their song "${title}".

DEPTH CONTEXT: ${depthInstruction}${nonRepeatInstruction}
${tasteContext}
TONE & STYLE: ${tierConfig.tone}
ASSUMED KNOWLEDGE: ${tierConfig.assumedKnowledge}
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
    const { artist, title, album, deepDive, context, sourceTitle, sourcePublisher, imageCaption, imageQuery, listenCount, previousNuggets, tier: rawTier, userTopArtists: rawTopArtists, userTopTracks: rawTopTracks } = body;
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
    const safeTopArtists: string[] = Array.isArray(rawTopArtists)
      ? rawTopArtists.slice(0, 10).map((s: unknown) => (typeof s === "string" ? s.slice(0, 100) : "")).filter(Boolean)
      : [];
    const safeTopTracks: string[] = Array.isArray(rawTopTracks)
      ? rawTopTracks.slice(0, 10).map((s: unknown) => (typeof s === "string" ? s.slice(0, 100) : "")).filter(Boolean)
      : [];

    const GOOGLE_AI_API_KEY = Deno.env.get("GOOGLE_AI_API_KEY");
    if (!GOOGLE_AI_API_KEY) {
      throw new Error("GOOGLE_AI_API_KEY is not configured");
    }
    // YouTube Data API v3 requires a separate Google Cloud API key
    // (different from the Gemini AI key). Falls back to GOOGLE_AI_API_KEY
    // only if the dedicated key isn't set yet.
    const YOUTUBE_API_KEY = Deno.env.get("YOUTUBE_API_KEY") || GOOGLE_AI_API_KEY;

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
      videos = await searchYouTube(searchQuery, YOUTUBE_API_KEY);
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
        artist, title, album, videos, transcripts, GOOGLE_AI_API_KEY, safeListenCount, safePreviousNuggets, tier, safeTopArtists, safeTopTracks
      );
      rawNuggets = result.nuggets;
      groundingChunks = result.groundingChunks;
    } catch (e) {
      if (e instanceof RecitationError) {
        console.log("Retrying without transcripts to avoid RECITATION block...");
        const result = await generateWithGemini(
          artist, title, album, videos, new Map(), GOOGLE_AI_API_KEY, safeListenCount, safePreviousNuggets, tier, safeTopArtists, safeTopTracks
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
        // Filter out purely internal grounding URLs (keep vertexaisearch proxy URLs — they redirect to real sources)
        const realChunks = groundingChunks.filter((chunk: any) => {
          const uri = (chunk?.web?.uri || "").toLowerCase();
          const chunkTitle = (chunk?.web?.title || "").toLowerCase();
          return uri &&
                 !chunkTitle.includes("vertex ai") &&
                 !chunkTitle.includes("grounding api");
        });

        const pubLower = (source.publisher || "").toLowerCase();
        const titleLower = (source.title || "").toLowerCase();
        const artistLower = artist.toLowerCase();

        // Try exact match on publisher or source title (match on title, not URI — URIs may be proxy URLs)
        let match = realChunks.find((chunk: any) => {
          const chunkTitle = (chunk?.web?.title || "").toLowerCase();
          return (
            (pubLower && pubLower !== "unknown" && chunkTitle.includes(pubLower)) ||
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
          // Update publisher from grounding title if it was generic
          // (grounding URIs may be proxy URLs, but title has the real publisher domain)
          if (!pubLower || pubLower === "unknown") {
            result.source.publisher = match.web.title || result.source.publisher;
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
