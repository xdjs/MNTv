import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ── YouTube Data API search (optional, requires API enabled) ─────────
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
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
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

// ── Generate nuggets via Lovable AI gateway ──────────────────────────
interface NuggetResult {
  text: string;
  kind: string;
  listenFor: boolean;
  source: {
    type: "youtube" | "article" | "interview";
    title: string;
    publisher: string;
    url?: string;
    embedId?: string;
    quoteSnippet: string;
    locator?: string;
    videoIndex?: number;
  };
}

async function generateNuggets(
  artist: string,
  title: string,
  album: string | undefined,
  videos: YTVideo[],
  transcripts: Map<string, string>,
  apiKey: string
): Promise<NuggetResult[]> {
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

  // Add randomness seed to get different results each time
  const seed = Math.random().toString(36).slice(2, 8);
  const angles = [
    "production techniques", "personal stories", "cultural impact",
    "musical theory", "recording sessions", "live performances",
    "collaborations", "lyrical meaning", "instrument choices",
    "historical context", "critical reception", "fan theories",
    "samples and influences", "music video creation", "chart performance",
  ];
  const pickedAngles = angles.sort(() => Math.random() - 0.5).slice(0, 3);

  const prompt = `You are a music historian and trivia expert. Generate exactly 3 fascinating, UNIQUE pieces of trivia about the song "${title}" by ${artist}${album ? ` from "${album}"` : ""}.

Focus on these angles for THIS generation: ${pickedAngles.join(", ")}. (Seed: ${seed})

${videoListContext ? `Available YouTube videos:\n${videoListContext}\n` : ""}
${transcriptContext ? `Real transcript content:\n\n${transcriptContext}\n` : ""}

CRITICAL RULES:
- Generate exactly 3 nuggets with diverse "kind" values from: process, constraint, pattern, human, influence
- Set exactly ONE nugget's listenFor to true (an audio moment listeners should pay attention to)
- For each nugget provide a REAL source — a real article, interview, or video that actually exists
- For YouTube sources from the videos above: set type to "youtube", include videoIndex number, and include a real quote
- For article/interview sources: cite REAL publications (Pitchfork, Rolling Stone, NME, The Guardian, etc.) with real article titles that actually exist about this artist/song
- Include a url field with the REAL URL to the source when possible
- Include a locator (timestamp for videos, section for articles) when possible
- Be factually accurate — do not fabricate quotes or facts
- IMPORTANT: Generate DIFFERENT trivia each time — avoid the most obvious facts

Return ONLY valid JSON:
{
  "nuggets": [
    {
      "text": "1-3 sentences of surprising music trivia",
      "kind": "process|constraint|pattern|human|influence",
      "listenFor": false,
      "source": {
        "type": "youtube|article|interview",
        "title": "Real source title",
        "publisher": "Real publisher/channel name",
        "url": "https://real-url-to-source",
        "quoteSnippet": "Real or closely paraphrased quote from the source",
        "locator": "3:12 or Paragraph 6",
        "videoIndex": 0
      }
    }
  ]
}`;

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        {
          role: "system",
          content: "You are a music historian who provides accurate, well-sourced trivia. Always cite real sources with real URLs. Return only valid JSON.",
        },
        { role: "user", content: prompt },
      ],
      temperature: 1.0,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error("Lovable AI error:", res.status, errText);
    if (res.status === 429) {
      throw new Error("Rate limited — please try again in a moment");
    }
    if (res.status === 402) {
      throw new Error("AI credits exhausted — please add credits in workspace settings");
    }
    throw new Error(`AI gateway error: ${res.status}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content || "";

  let parsed: { nuggets: NuggetResult[] };
  try {
    const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    parsed = JSON.parse(cleaned);
  } catch {
    console.error("Failed to parse AI response:", content);
    throw new Error("Failed to parse AI response");
  }

  return parsed.nuggets || [];
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

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const GOOGLE_AI_API_KEY = Deno.env.get("GOOGLE_AI_API_KEY");

    // Step 1: Search YouTube (optional — needs YouTube Data API enabled)
    let videos: YTVideo[] = [];
    if (GOOGLE_AI_API_KEY) {
      try {
        const searchQuery = `${artist} ${title} interview OR breakdown OR behind the scenes`;
        videos = await searchYouTube(searchQuery, GOOGLE_AI_API_KEY);
      } catch (e) {
        console.warn("YouTube search skipped:", e);
      }
    }
    console.log(`Found ${videos.length} YouTube videos for "${artist} - ${title}"`);

    // Step 2: Fetch transcripts in parallel (top 3 videos)
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

    // Step 3: Generate nuggets via Lovable AI
    const rawNuggets = await generateNuggets(
      artist, title, album, videos, transcripts, LOVABLE_API_KEY
    );

    // Step 4: Assemble response — attach real video IDs where applicable
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
          url: n.source.url,
        },
      };

      // Attach real embedId for youtube sources
      if (n.source.type === "youtube" && n.source.videoIndex != null) {
        const video = videos[n.source.videoIndex];
        if (video) {
          result.source.embedId = video.videoId;
          result.source.url = `https://www.youtube.com/watch?v=${video.videoId}`;
        }
      }

      // Fallback: Google Search link if no real URL
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
