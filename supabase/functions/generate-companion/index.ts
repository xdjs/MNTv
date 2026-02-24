import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { artist, title, album, listenCount = 1 } = await req.json();

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

    // Determine nugget count based on listen count
    const nuggetsPerKind = Math.min(Math.max(listenCount, 1), 3);
    const totalNuggets = nuggetsPerKind * 3;

    // Depth tier instructions
    let depthInstruction: string;
    if (listenCount <= 1) {
      depthInstruction = "This is the listener's FIRST TIME. Be introductory and welcoming. Set the stage.";
    } else if (listenCount === 2) {
      depthInstruction = "The listener has heard this before. Go deeper — surprising production details, lesser-known connections.";
    } else {
      depthInstruction = `Listen #${listenCount}. Deep cuts — obscure influences, technical breakdowns, unexpected cultural connections.`;
    }

    const nuggetStructure = Array.from({ length: nuggetsPerKind }, (_, i) => {
      const idx = i + 1;
      return [
        `- Nugget (artist ${idx}): kind "artist" — about the artist's story, philosophy, creative world.`,
        `- Nugget (track ${idx}): kind "track" — about this specific track's production, meaning, history.`,
        `- Nugget (discovery ${idx}): kind "discovery" — a specific recommendation with a genuine musical connection.`,
      ].join("\n");
    }).join("\n");

    const prompt = `You are a music historian and trivia expert. Generate content about "${title}" by ${artist}${album ? ` from "${album}"` : ""}.

DEPTH CONTEXT: ${depthInstruction}

Generate the following:

1. "artistSummary": 2-3 paragraphs about the artist — their story, significance, creative evolution. Rich and engaging.

2. "trackStory": 2-3 paragraphs about this specific track — its creation, meaning, cultural impact, notable production details.

3. "nuggets": Exactly ${totalNuggets} nuggets in this repeating pattern (${nuggetsPerKind} of each kind):
${nuggetStructure}

Each nugget must vary in angle — no two should cover the same fact or theme.

4. "externalLinks": Array of useful links for further exploration.

CRITICAL RULES FOR NUGGETS:
- Each nugget has:
  - "headline": 1-2 curiosity-sparking sentences that tease a surprising detail
  - "text": 2-3 sentences delivering on the headline's promise with rich detail
  - "kind": "artist" | "track" | "discovery"
  - "source": object with:
    - "type": "youtube" | "article" | "interview"
    - "title": Real source title (real publication, real article)
    - "publisher": Real publisher/channel name
    - "url": A real URL. For YouTube: a real youtube.com/watch?v= link. For articles: a real URL to the publication.
    - "quoteSnippet": A relevant quote or close paraphrase from the source

- Be factually accurate — cite REAL sources with real titles and publishers
- For articles, use real publication names (Pitchfork, Rolling Stone, NME, The Guardian, etc.)

Return ONLY valid JSON:
{
  "artistSummary": "...",
  "trackStory": "...",
  "nuggets": [...],
  "externalLinks": [
    { "label": "Wikipedia", "url": "https://en.wikipedia.org/wiki/..." },
    { "label": "Spotify", "url": "https://open.spotify.com/search/..." },
    { "label": "YouTube Music", "url": "https://music.youtube.com/search?q=..." }
  ]
}`;

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GOOGLE_AI_API_KEY}`;

    // Retry up to 3 times
    for (let attempt = 0; attempt < 3; attempt++) {
      const res = await fetch(geminiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          tools: [{ google_search: {} }],
          generationConfig: { temperature: 1.0 },
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const candidate = data.candidates?.[0];
        const finishReason = candidate?.finishReason;

        if (finishReason === "SAFETY" || finishReason === "RECITATION") {
          console.warn(`Gemini blocked: ${finishReason}`);
          if (attempt < 2) {
            await new Promise((r) => setTimeout(r, 2000));
            continue;
          }
          throw new Error(`Gemini blocked: ${finishReason}`);
        }

        const text = candidate?.content?.parts?.[0]?.text || "";
        if (!text.trim()) {
          if (attempt < 2) {
            await new Promise((r) => setTimeout(r, 2000));
            continue;
          }
          throw new Error("Gemini returned empty response");
        }

        let parsed;
        try {
          const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
          parsed = JSON.parse(cleaned);
        } catch {
          console.error("Failed to parse:", text.slice(0, 500));
          if (attempt < 2) {
            await new Promise((r) => setTimeout(r, 2000));
            continue;
          }
          throw new Error("Failed to parse Gemini response");
        }

        // Ensure source URLs exist — build Google Search fallbacks for articles
        if (parsed.nuggets) {
          for (const n of parsed.nuggets) {
            if (n.source && !n.source.url) {
              const q = `"${n.source.title}" ${n.source.publisher} ${artist}`.trim();
              n.source.url = `https://www.google.com/search?q=${encodeURIComponent(q)}`;
            }
          }
        }

        // Ensure external links exist
        if (!parsed.externalLinks || !parsed.externalLinks.length) {
          const encodedArtist = encodeURIComponent(artist);
          const encodedQuery = encodeURIComponent(`${artist} ${title}`);
          parsed.externalLinks = [
            { label: "Wikipedia", url: `https://en.wikipedia.org/wiki/${encodedArtist.replace(/%20/g, "_")}` },
            { label: "Spotify", url: `https://open.spotify.com/search/${encodedQuery}` },
            { label: "YouTube Music", url: `https://music.youtube.com/search?q=${encodedQuery}` },
          ];
        }

        return new Response(JSON.stringify(parsed), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (res.status === 429 && attempt < 2) {
        const errData = await res.json().catch(() => null);
        const retryInfo = errData?.error?.details?.find((d: any) => d["@type"]?.includes("RetryInfo"));
        const retryDelay = retryInfo?.retryDelay || "5s";
        const delaySec = parseFloat(retryDelay.replace("s", "")) || 5;
        const waitMs = Math.min((delaySec + 2) * 1000, 55000);
        console.log(`Rate limited, waiting ${waitMs / 1000}s...`);
        await new Promise((r) => setTimeout(r, waitMs));
        continue;
      }

      const errText = await res.text();
      console.error("Gemini API error:", res.status, errText);
      throw new Error(`Gemini API error: ${res.status}`);
    }

    throw new Error("Gemini API failed after retries");
  } catch (e) {
    console.error("generate-companion error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
