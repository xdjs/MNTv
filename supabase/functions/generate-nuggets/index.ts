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

// ── Generate nuggets with Gemini + Google Search grounding ───────────
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
    videoIndex?: number;
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

  // Randomize angles for variety each time
  const seed = Math.random().toString(36).slice(2, 8);
  const angles = [
    "production techniques", "personal stories", "cultural impact",
    "musical theory", "recording sessions", "live performances",
    "collaborations", "lyrical meaning", "instrument choices",
    "historical context", "critical reception", "samples and influences",
    "music video creation", "chart performance", "fan theories",
  ];
  const pickedAngles = angles.sort(() => Math.random() - 0.5).slice(0, 3);

  const prompt = `You are a music historian and trivia expert. Generate exactly 3 fascinating, UNIQUE pieces about "${title}" by ${artist}${album ? ` from "${album}"` : ""}.

Focus on these angles for nuggets 1-2: ${pickedAngles.join(", ")}. (Seed: ${seed} — generate DIFFERENT facts each time)

${videoListContext ? `Available YouTube videos:\n${videoListContext}\n` : ""}
${transcriptContext ? `Real transcript content:\n\n${transcriptContext}\n` : "No transcripts available — use your knowledge and Google Search to find real sources."}

STRUCTURE:
- Nuggets 1 and 2: Fascinating trivia with diverse "kind" values from: process, constraint, pattern, human, influence
- Nugget 3 (MUST have kind "discovery"): A discovery nudge — recommend a specific song, album, or artist the listener should explore next. Explain WHY based on a genuine musical connection to "${title}" (shared production approach, influence chain, emotional palette, cultural moment, collaboration). Be opinionated and specific like a knowledgeable friend, not a generic recommendation engine. Name the exact track or album and why it matters in context of what they're hearing right now.

CRITICAL RULES:
- Set exactly ONE of nuggets 1-2's listenFor to true (an audio moment to listen for). Nugget 3's listenFor must be false.
- Each nugget MUST have TWO text fields:
  - "headline": A single punchy sentence (max 15 words) that hooks the reader — a complete thought, no ellipsis
  - "text": The full 2-3 sentence explanation with detail and context
- For nugget 3 (discovery): The headline should feel like a friend nudging you ("If this moves you, try..." or "The thread from here leads to...")
- For YouTube sources from videos above: set type "youtube", include videoIndex, include a real quote
- For article/interview sources: cite REAL publications with real article titles
- Include locator (timestamp for videos, section for articles) when possible
- Be factually accurate — do not fabricate quotes or facts
- Generate DIFFERENT trivia each time

Return ONLY valid JSON:
{
  "nuggets": [
    {
      "headline": "One punchy complete sentence hook",
      "text": "2-3 sentences of surprising music trivia with full detail",
      "kind": "process|constraint|pattern|human|influence|discovery",
      "listenFor": false,
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
    generationConfig: { temperature: 1.0 },
  };

  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

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
    const { artist, title, album, deepDive, context, sourceTitle, sourcePublisher } = body;

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

    // ── Deep Dive mode ──────────────────────────────────────────────
    if (deepDive) {
      const deepDivePrompt = `You are a music historian having a fascinating conversation about "${title}" by ${artist}.

The user has been reading this trivia and wants to go deeper:
---
${context}
---
${sourceTitle ? `The original source was: "${sourceTitle}" by ${sourcePublisher}` : ""}

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
      const searchQuery = `${artist} ${title} interview OR breakdown OR behind the scenes`;
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
        artist, title, album, videos, transcripts, GOOGLE_AI_API_KEY
      );
      rawNuggets = result.nuggets;
      groundingChunks = result.groundingChunks;
    } catch (e) {
      if (e instanceof RecitationError) {
        // Retry without transcripts — they likely contain copyrighted lyrics
        console.log("Retrying without transcripts to avoid RECITATION block...");
        const result = await generateWithGemini(
          artist, title, album, videos, new Map(), GOOGLE_AI_API_KEY
        );
        rawNuggets = result.nuggets;
        groundingChunks = result.groundingChunks;
      } else {
        throw e;
      }
    }

    // Step 4: Assemble response with real video IDs and targeted search URLs
    const nuggets = rawNuggets.map((n) => {
      const result: any = {
        headline: n.headline,
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

      // Attach real embedId for YouTube sources
      if (n.source.type === "youtube" && n.source.videoIndex != null) {
        const video = videos[n.source.videoIndex];
        if (video) {
          result.source.embedId = video.videoId;
          result.source.url = `https://www.youtube.com/watch?v=${video.videoId}`;
        }
      }

      // For article/interview sources, build a targeted Google Search URL
      if (!result.source.url) {
        const publisherDomains: Record<string, string> = {
          "pitchfork": "site:pitchfork.com",
          "rolling stone": "site:rollingstone.com",
          "nme": "site:nme.com",
          "the guardian": "site:theguardian.com",
          "billboard": "site:billboard.com",
          "spin": "site:spin.com",
          "stereogum": "site:stereogum.com",
          "consequence of sound": "site:consequence.net",
          "the quietus": "site:thequietus.com",
          "sound on sound": "site:soundonsound.com",
          "wikipedia": "site:en.wikipedia.org",
          "far out magazine": "site:faroutmagazine.co.uk",
          "the line of best fit": "site:thelineofbestfit.com",
        };
        const pubLower = n.source.publisher.toLowerCase();
        const siteHint = publisherDomains[pubLower] || "";
        const q = `"${n.source.title}" ${siteHint} ${artist}`.trim();
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
