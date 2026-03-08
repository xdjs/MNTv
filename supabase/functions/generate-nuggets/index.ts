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

// ── Exa /answer API ─────────────────────────────────────────────────
interface ExaCitation {
  citIndex: number;
  url: string;
  title: string;
  author: string | null;
  publishedDate: string | null;
}

interface ExaAnswer {
  label: string;
  answer: string;
  citations: ExaCitation[];
  costDollars: number;
}

async function askExa(
  query: string,
  label: string,
  apiKey: string,
  citIndexStart: number,
): Promise<ExaAnswer> {
  const res = await fetch("https://api.exa.ai/answer", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, text: true }),
  });

  if (!res.ok) {
    console.error(`[Exa] /answer failed for ${label}:`, res.status, await res.text());
    return { label, answer: "", citations: [], costDollars: 0 };
  }

  const data = await res.json();
  const citations: ExaCitation[] = (data.citations || []).map(
    (c: any, i: number) => ({
      citIndex: citIndexStart + i,
      url: c.url || "",
      title: c.title || "",
      author: c.author || null,
      publishedDate: c.publishedDate || null,
    })
  );

  return {
    label,
    answer: data.answer || "",
    citations,
    costDollars: data.costDollars?.total || 0,
  };
}

class RecitationError extends Error {
  constructor() { super("RECITATION"); this.name = "RecitationError"; }
}

// ── Wikipedia / Wikimedia Commons image search ──────────────────────
// Primary: Wikipedia search → lead image of top result
async function searchWikipediaImage(query: string): Promise<{ url: string; title: string } | null> {
  try {
    const url = new URL("https://en.wikipedia.org/w/api.php");
    url.searchParams.set("action", "query");
    url.searchParams.set("generator", "search");
    url.searchParams.set("gsrsearch", query);
    url.searchParams.set("gsrlimit", "1");
    url.searchParams.set("prop", "pageimages");
    url.searchParams.set("piprop", "thumbnail");
    url.searchParams.set("pithumbsize", "500");
    url.searchParams.set("format", "json");
    url.searchParams.set("origin", "*");

    const res = await fetch(url.toString());
    if (!res.ok) return null;
    const data = await res.json();
    const pages = data.query?.pages;
    if (!pages) return null;
    const page = Object.values(pages)[0] as any;
    const thumb = page?.thumbnail?.source;
    if (!thumb) return null;
    return { url: thumb, title: page.title || query };
  } catch {
    return null;
  }
}

// Fallback: Wikimedia Commons direct file search
async function searchCommonsImage(query: string): Promise<string | null> {
  try {
    const url = new URL("https://commons.wikimedia.org/w/api.php");
    url.searchParams.set("action", "query");
    url.searchParams.set("generator", "search");
    url.searchParams.set("gsrnamespace", "6");
    url.searchParams.set("gsrsearch", query);
    url.searchParams.set("gsrlimit", "1");
    url.searchParams.set("prop", "imageinfo");
    url.searchParams.set("iiprop", "url");
    url.searchParams.set("iiurlwidth", "500");
    url.searchParams.set("format", "json");
    url.searchParams.set("origin", "*");

    const res = await fetch(url.toString());
    if (!res.ok) return null;
    const data = await res.json();
    const pages = data.query?.pages;
    if (!pages) return null;
    const page = Object.values(pages)[0] as any;
    return page?.imageinfo?.[0]?.thumburl || page?.imageinfo?.[0]?.url || null;
  } catch {
    return null;
  }
}

// Resolve image for a single nugget's search query
async function resolveNuggetImage(query: string): Promise<{ url: string; title: string } | null> {
  const wiki = await searchWikipediaImage(query);
  if (wiki) return wiki;
  const commons = await searchCommonsImage(query);
  if (commons) return { url: commons, title: query };
  return null;
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

// ── Thematic angle pools (tier + listen-count gated) ─────────────────
interface AngleDef {
  name: string;
  minListen: number;          // earliest listen count where this angle appears
  tiers: Set<Tier>;           // which tiers include this angle
}

const ANGLE_POOL: AngleDef[] = [
  // Available from first listen
  { name: "personal stories",           minListen: 1, tiers: new Set(["casual", "curious", "nerd"]) },
  { name: "cultural impact",            minListen: 1, tiers: new Set(["casual", "curious", "nerd"]) },
  { name: "live performances",          minListen: 1, tiers: new Set(["casual", "curious", "nerd"]) },
  { name: "collaborations",             minListen: 1, tiers: new Set(["casual", "curious", "nerd"]) },
  { name: "lyrical meaning",            minListen: 1, tiers: new Set(["casual", "curious", "nerd"]) },
  { name: "chart performance",          minListen: 1, tiers: new Set(["casual", "curious", "nerd"]) },
  { name: "music video creation",       minListen: 1, tiers: new Set(["casual", "curious", "nerd"]) },
  { name: "historical context",         minListen: 1, tiers: new Set(["casual", "curious", "nerd"]) },
  // Unlock at listen 2 for casual/curious, always available for nerd
  { name: "recording sessions",         minListen: 2, tiers: new Set(["curious", "nerd"]) },
  { name: "production techniques",      minListen: 2, tiers: new Set(["curious", "nerd"]) },
  { name: "instrument choices",         minListen: 2, tiers: new Set(["curious", "nerd"]) },
  { name: "critical reception",         minListen: 2, tiers: new Set(["curious", "nerd"]) },
  { name: "samples and influences",     minListen: 2, tiers: new Set(["curious", "nerd"]) },
  { name: "fan theories",               minListen: 2, tiers: new Set(["curious", "nerd"]) },
  { name: "session musicians",          minListen: 2, tiers: new Set(["nerd"]) },
  // Deep cuts — unlock at listen 3 for curious, always available for nerd
  { name: "harmonic and rhythmic analysis", minListen: 3, tiers: new Set(["nerd"]) },
  { name: "signal chain and gear",      minListen: 3, tiers: new Set(["nerd"]) },
  { name: "micro-genre lineage",        minListen: 3, tiers: new Set(["nerd"]) },
  { name: "mixing and mastering",       minListen: 3, tiers: new Set(["nerd"]) },
];

function pickAngles(tier: Tier, listenCount: number, count = 2): string[] {
  // Nerd tier gets everything unlocked regardless of listen count
  const eligible = ANGLE_POOL.filter((a) =>
    a.tiers.has(tier) && (tier === "nerd" || listenCount >= a.minListen)
  );
  // Shuffle and pick
  const shuffled = eligible.sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count).map((a) => a.name);
}

// ── Exa question builder ─────────────────────────────────────────────
function buildExaQuestions(
  artist: string,
  title: string,
  album: string | undefined,
  tier: Tier,
  angles: string[],
): { artistQ: string; trackQ: string; discoveryQ: string } {
  const cfg = TIER_CONFIG[tier];
  const albumCtx = album ? ` from the album "${album}"` : "";
  const angleStr = angles.join(", ");

  return {
    artistQ: `${artist}${albumCtx}: ${cfg.artistFocus} Focus on: ${angleStr}.`,
    trackQ: `"${title}" by ${artist}${albumCtx}: ${cfg.trackFocus} Focus on: ${angleStr}.`,
    discoveryQ: `Artists related to ${artist} "${title}": ${cfg.discoveryFocus}`,
  };
}

// ── Build citation-indexed context for Gemini prompt ─────────────────
function buildExaPromptContext(answers: ExaAnswer[]): {
  context: string;
  allCitations: ExaCitation[];
} {
  const allCitations: ExaCitation[] = [];
  const parts: string[] = [];

  for (const a of answers) {
    if (!a.answer) continue;
    allCitations.push(...a.citations);
    parts.push(
      `[${a.label.toUpperCase()} RESEARCH]\n${a.answer}`
    );
  }

  const citList = allCitations.map((c) =>
    `[CIT ${c.citIndex}] "${c.title}"${c.author ? ` by ${c.author}` : ""} — ${c.url}`
  ).join("\n");

  const context = parts.join("\n\n---\n\n") +
    "\n\n---\nSOURCE CITATIONS:\n" + citList;

  return { context, allCitations };
}

// ── Generate nuggets with Gemini + Google Search grounding ───────────
interface GeminiNugget {
  headline: string;
  text: string;
  kind: "artist" | "track" | "discovery";
  listenFor: boolean;
  imageSearchQuery?: string;
  imageCaption?: string;
  source: {
    type: "youtube" | "article" | "interview";
    title: string;
    publisher: string;
    sourceUrl?: string;
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
  userTopTracks: string[] = [],
  exaContext?: string,
  exaCitations?: ExaCitation[],
): Promise<{ nuggets: GeminiNugget[]; groundingChunks: any[]; exaCitations?: ExaCitation[] }> {
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

  // Pick random thematic angles for this generation
  const angles = pickAngles(tier, listenCount);
  const angleInstruction = `\nTHEMATIC ANGLES: For the artist and track nuggets, explore these angles: ${angles.join(", ")}. Use these as creative direction — the nugget should still be surprising and specific, not a generic take on the angle.`;

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

DEPTH CONTEXT: ${depthInstruction}${angleInstruction}${nonRepeatInstruction}
${tasteContext}
TONE & STYLE: ${tierConfig.tone}
ASSUMED KNOWLEDGE: ${tierConfig.assumedKnowledge}
SOURCE EXPECTATIONS: Prefer sources from ${tierConfig.sourceExpectation}.

${exaContext ? `RESEARCHED SOURCE MATERIAL (verified — cite by [CIT N] index):

${exaContext}

CRITICAL SOURCE RULES:
- For each nugget, include "citIndex" — the [CIT N] number of your primary source
- Do NOT invent or modify URLs — they will be resolved from the citation index
- Do NOT include "sourceUrl" — the URL will be attached automatically from [CIT N]
- Use the researched material above as your primary factual basis
- You may add creative framing/tone but all facts must come from the research above` : ""}
${transcriptContext ? `${exaContext ? "\nADDITIONAL CONTEXT — YouTube interview/breakdown transcripts:" : "Real transcript content:"}\n${videoListContext ? `${videoListContext}\n` : ""}
${transcriptContext}
` : (exaContext ? "" : `${videoListContext ? `Available YouTube videos:\n${videoListContext}\n` : ""}No transcripts available — use your knowledge and Google Search to find real sources.`)}
STRUCTURE — always exactly 3 nuggets in this order:
1. **Nugget 1 — kind: "artist"**: About the artist/band ${artist}. ${tierConfig.artistFocus}. listenFor: false.
2. **Nugget 2 — kind: "track"**: About the song "${title}" by ${artist}. ${tierConfig.trackFocus}. listenFor: true.
3. **Nugget 3 — kind: "discovery"**: ${tierConfig.discoveryFocus}. Be opinionated and specific like a knowledgeable friend. listenFor: false.

CRITICAL RULES:
- Each nugget MUST have TWO text fields:
  - "headline": 1-2 sentences that spark curiosity and make the reader WANT to learn more. Don't write a dry fact — write something that teases a surprising detail or asks an implicit question. Examples: "The cash register sounds at the start? Roger Waters recorded them by throwing coins into a mixing bowl in his pottery shed." or "There's a reason this song feels unsettling — and it has nothing to do with the lyrics." Make the reader think "wait, really?" or "tell me more."
  - "text": The full 2-3 sentence explanation that delivers on the headline's promise with rich detail and context.
- For nugget 3 (discovery): The headline should feel like a friend nudging you with genuine enthusiasm, e.g. "If this groove hit you right, you need to hear what Nile Rodgers did on this other track."
- For YouTube sources from videos above: set type "youtube", include videoIndex, include a real quote
- For article/interview sources: cite REAL publications with real article titles. Include "sourceUrl" — the direct URL to the page you found via Google Search grounding. This lets us verify the source.
- Include locator (timestamp for videos, section for articles) when possible
- Be factually accurate — do not fabricate quotes or facts
- If you cannot find a specific real source for a fact, set publisher to "General Knowledge" — this is better than fabricating an article that doesn't exist
- NEVER invent specific studio names, gear model numbers, or personnel names — if unsure, describe generally
- ALWAYS include "imageSearchQuery" and "imageCaption" for EVERY nugget:
  - For artist nuggets: search for the artist, a key collaborator, the recording studio, or a relevant era photo. Example: "Stevie Nicks Fleetwood Mac 1977", "Abbey Road Studios London"
  - For track nuggets: search for the specific instrument, production technique, music video, or cultural reference mentioned. Example: "Fender Rhodes electric piano", "Hyperballad Björk music video"
  - For discovery nuggets: search for the recommended artist. Example: "Leila electronic music producer"
  - "imageCaption": short (6-12 words) explaining the image's relevance to the nugget
  - Be SPECIFIC — "Stevie Nicks 1977 Rumours era" is better than "Fleetwood Mac". Name the exact person, place, instrument, or thing.

Return ONLY valid JSON:
{
  "nuggets": [
    {
      "headline": "One punchy complete sentence hook",
      "text": "2-3 sentences of surprising music trivia with full detail",
      "kind": "artist|track|discovery",
      "listenFor": false,
      "imageSearchQuery": "HBO Insecure TV show",
      "imageCaption": "The HBO series that featured this track",
      "source": {
        "type": "youtube|article|interview",
        "title": "Real source title",
        "publisher": "Real publisher/channel name",${exaContext ? `
        "citIndex": 0,` : `
        "sourceUrl": "https://example.com/the-actual-article-url",`}
        "quoteSnippet": "Real or closely paraphrased quote",
        "locator": "3:12",
        "videoIndex": 0
      }
    }
  ]
}`;

  const body: any = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: { temperature: tierConfig.temperature },
  };

  // Only use Google Search grounding when Exa is NOT providing source context
  if (!exaContext) {
    body.tools = [{ google_search: {} }];
  }

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
        throw new RecitationError();
      }

      const text = candidate?.content?.parts?.[0]?.text || "";
      const groundingChunks = candidate?.groundingMetadata?.groundingChunks || [];

      if (!text.trim()) {
        console.error("Gemini returned empty text. Candidate:", JSON.stringify(candidate));
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
      return { nuggets: parsed.nuggets || [], groundingChunks, exaCitations };
    }

    if (res.status === 429 && attempt < 2) {
      const errData = await res.json().catch(() => null);
      const retryInfo = errData?.error?.details?.find((d: any) => d["@type"]?.includes("RetryInfo"));
      const retryDelay = retryInfo?.retryDelay || "5s";
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
    const EXA_API_KEY = Deno.env.get("EXA_API_KEY");
    let exaPromptContext: string | undefined;
    let exaCitations: ExaCitation[] | undefined;

    // Exa enrichment: every request when Exa key is configured
    if (EXA_API_KEY) {
      console.log(`[Exa] Asking Exa about "${artist} - ${title}" (${tier} tier, listen #${safeListenCount})`);
      const angles = pickAngles(tier, safeListenCount);
      const questions = buildExaQuestions(artist, title, album, tier, angles);

      const [artistResult, trackResult, discoveryResult] = await Promise.allSettled([
        askExa(questions.artistQ, "artist", EXA_API_KEY, 0),
        askExa(questions.trackQ, "track", EXA_API_KEY, 10),
        askExa(questions.discoveryQ, "discovery", EXA_API_KEY, 20),
      ]);

      const answers: ExaAnswer[] = [];
      let totalCost = 0;
      for (const r of [artistResult, trackResult, discoveryResult]) {
        if (r.status === "fulfilled" && r.value.answer) {
          answers.push(r.value);
          totalCost += r.value.costDollars;
        }
      }

      if (answers.length > 0) {
        const { context, allCitations } = buildExaPromptContext(answers);
        exaPromptContext = context;
        exaCitations = allCitations;
        console.log(`[Exa] ${answers.length} answers, ${allCitations.length} citations, $${totalCost.toFixed(3)}`);
      } else {
        console.log(`[Exa] No answers returned, falling back to Google grounding`);
      }
    }

    // YouTube search + transcripts only on repeat listens (listenCount >= 2).
    // First listen uses Exa (if configured) or Gemini + Google Search grounding alone.
    let videos: YTVideo[] = [];
    const transcripts = new Map<string, string>();

    if (safeListenCount >= 2) {
      // Step 1: Search YouTube for interviews/breakdowns
      try {
        const searchQuery = `"${artist}" "${title}" interview OR breakdown OR behind the scenes`;
        videos = await searchYouTube(searchQuery, YOUTUBE_API_KEY);
      } catch (e) {
        console.warn("YouTube search skipped:", e);
      }

      console.log(`Found ${videos.length} YouTube videos for "${artist} - ${title}"`);

      // Step 2: Fetch transcripts in parallel (top 3)
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
    } else {
      console.log(`First listen — skipping YouTube search, Gemini + grounding only`);
    }

    // Step 3: Generate nuggets with Gemini + Google Search grounding
    let rawNuggets: any[];
    let groundingChunks: any[];
    try {
      const result = await generateWithGemini(
        artist, title, album, videos, transcripts, GOOGLE_AI_API_KEY, safeListenCount, safePreviousNuggets, tier, safeTopArtists, safeTopTracks,
        exaPromptContext, exaCitations
      );
      rawNuggets = result.nuggets;
      groundingChunks = result.groundingChunks;
    } catch (e) {
      if (e instanceof RecitationError) {
        console.log("Retrying without transcripts to avoid RECITATION block...");
        const result = await generateWithGemini(
          artist, title, album, videos, new Map(), GOOGLE_AI_API_KEY, safeListenCount, safePreviousNuggets, tier, safeTopArtists, safeTopTracks,
          exaPromptContext, exaCitations
        );
        rawNuggets = result.nuggets;
        groundingChunks = result.groundingChunks;
      } else {
        throw e;
      }
    }

    console.log(`[Grounding] ${groundingChunks.length} chunks for "${artist} - ${title}":`,
      groundingChunks.map((c: any) => ({ title: c?.web?.title, uri: c?.web?.uri })));

    // Enforce kind order: exactly [artist, track, discovery]
    // Gemini sometimes returns wrong kinds — force them based on position
    const expectedKinds = ["artist", "track", "discovery"] as const;
    for (let i = 0; i < rawNuggets.length && i < 3; i++) {
      if (rawNuggets[i].kind !== expectedKinds[i]) {
        console.log(`[KindFix] Nugget ${i}: "${rawNuggets[i].kind}" → "${expectedKinds[i]}"`);
        rawNuggets[i].kind = expectedKinds[i];
      }
    }

    // Step 3.5: Resolve contextual images from Wikipedia/Commons in parallel
    // Auto-generate image queries for nuggets where Gemini didn't provide one
    for (const n of rawNuggets) {
      if (!n.imageSearchQuery) {
        if (n.kind === "artist") {
          n.imageSearchQuery = `${artist} musician`;
          n.imageCaption = n.imageCaption || artist;
        } else if (n.kind === "track") {
          n.imageSearchQuery = `${artist} ${title} song`;
          n.imageCaption = n.imageCaption || `${title} by ${artist}`;
        } else if (n.kind === "discovery") {
          // Try to extract the recommended artist name from the text
          const recMatch = n.text?.match(/(?:artist|musician|producer|band)\s+(\w[\w\s]+?)(?:\s+shares|\s+is|\s+has|,|\.|'s)/i);
          n.imageSearchQuery = recMatch ? `${recMatch[1]} musician` : `${artist} related artists`;
          n.imageCaption = n.imageCaption || "Recommended artist";
        }
      }
    }
    const imageResults = await Promise.allSettled(
      rawNuggets.map(async (n) => {
        if (!n.imageSearchQuery) return null;
        return resolveNuggetImage(n.imageSearchQuery);
      })
    );
    // Attach resolved images back to rawNuggets
    for (let i = 0; i < rawNuggets.length; i++) {
      const result = imageResults[i];
      if (result.status === "fulfilled" && result.value) {
        rawNuggets[i]._resolvedImageUrl = result.value.url;
        rawNuggets[i]._resolvedImageTitle = result.value.title;
        console.log(`[ImageSearch] Resolved "${rawNuggets[i].imageSearchQuery}" → ${result.value.url}`);
      } else if (rawNuggets[i].imageSearchQuery) {
        console.log(`[ImageSearch] No result for "${rawNuggets[i].imageSearchQuery}"`);
      }
    }

    // Step 4: Assemble response with real video IDs and grounding-sourced URLs
    // Filter grounding chunks once for reuse across all nuggets
    const realChunks = groundingChunks.filter((chunk: any) => {
      const uri = (chunk?.web?.uri || "").toLowerCase();
      const chunkTitle = (chunk?.web?.title || "").toLowerCase();
      return uri && !chunkTitle.includes("vertex ai") && !chunkTitle.includes("grounding api");
    });

    const nuggets = rawNuggets.map((n) => {
      const source = n.source || {};
      const result: any = {
        headline: n.headline,
        text: n.text,
        kind: n.kind,
        listenFor: n.listenFor,
        source: {
          type: source.type || "article",
          title: source.title || `${title} by ${artist}`,
          publisher: source.publisher || "Unknown",
          quoteSnippet: source.quoteSnippet || "",
          locator: source.locator,
        },
      };

      // Contextual image resolved from Wikipedia/Commons
      if (n._resolvedImageUrl) {
        result.imageUrl = n._resolvedImageUrl;
        result.imageCaption = n.imageCaption || n._resolvedImageTitle || n.imageSearchQuery;
      }

      // Exa citation resolution — citIndex maps directly to verified URL
      if (exaCitations?.length && source.citIndex != null) {
        const cit = exaCitations.find((c) => c.citIndex === source.citIndex);
        if (cit) {
          result.source.url = cit.url;
          if (cit.title) result.source.title = cit.title;
          result.source.verified = true;
        }
      }

      // Fallback: Gemini didn't use citIndex but Exa citations exist
      if (!result.source.url && exaCitations?.length) {
        const pubLower = (source.publisher || "").toLowerCase();
        const titleLower = (source.title || "").toLowerCase();
        const match = exaCitations.find((c) =>
          (pubLower && c.title.toLowerCase().includes(pubLower)) ||
          (pubLower && c.url.toLowerCase().includes(pubLower)) ||
          (titleLower && c.title.toLowerCase().includes(titleLower))
        );
        if (match) {
          result.source.url = match.url;
          result.source.title = match.title;
          result.source.verified = true;
        }
      }

      // YouTube sources — use verified video IDs
      if (source.type === "youtube" && source.videoIndex != null) {
        const video = videos[source.videoIndex];
        if (video) {
          result.source.embedId = video.videoId;
          result.source.url = `https://www.youtube.com/watch?v=${video.videoId}`;
          result.source.verified = true;
        }
      }

      // For non-YouTube sources, resolve URL from grounding chunks (trusted) first,
      // then Gemini's sourceUrl only if it matches grounding. Never serve unverified Gemini URLs.
      if (!result.source.url) {
        const geminiUrl = source.sourceUrl || "";
        let geminiHost = "";
        try { if (geminiUrl) geminiHost = new URL(geminiUrl).hostname; } catch { /* invalid */ }

        // Try to match Gemini's URL domain against grounding chunks
        if (geminiHost) {
          const match = realChunks.find((chunk: any) => {
            try { return new URL(chunk.web.uri).hostname === geminiHost; } catch { return false; }
          });
          if (match) {
            result.source.url = match.web.uri;
            if (match.web.title) result.source.title = match.web.title;
            result.source.verified = true;
          }
        }

        // No domain match — use best grounding chunk (real URL from Google Search)
        if (!result.source.url && realChunks.length > 0) {
          // Try to find a grounding chunk whose title/URL relates to this nugget's publisher
          const pubLower = (source.publisher || "").toLowerCase();
          const relevantChunk = realChunks.find((chunk: any) => {
            const chunkTitle = (chunk?.web?.title || "").toLowerCase();
            const chunkUri = (chunk?.web?.uri || "").toLowerCase();
            return pubLower && (chunkTitle.includes(pubLower) || chunkUri.includes(pubLower));
          }) || realChunks.find((chunk: any) => {
            // Fall back to any chunk mentioning the artist or title
            const chunkTitle = (chunk?.web?.title || "").toLowerCase();
            return chunkTitle.includes(artist.toLowerCase()) || chunkTitle.includes(title.toLowerCase());
          }) || realChunks[0];

          result.source.url = relevantChunk.web.uri;
          if (relevantChunk.web.title) result.source.title = relevantChunk.web.title;
          result.source.verified = true;
        }

        // Final fallback — targeted Google Search so the user can find the real page
        if (!result.source.url) {
          const q = `${source.title || ""} ${source.publisher || ""} ${artist} ${title}`.trim();
          result.source.url = `https://www.google.com/search?q=${encodeURIComponent(q)}`;
          result.source.verified = false;
        }
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
