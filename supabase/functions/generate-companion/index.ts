import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type Tier = "casual" | "curious" | "nerd";

const TIER_CONFIG: Record<Tier, { model: string; nuggetCount: number; depthLabel: string; sources: string }> = {
  casual: {
    model: "gemini-2.5-flash",
    nuggetCount: 3,
    depthLabel: "accessible, jargon-free, feel-good discoveries. Write like you're telling a friend.",
    sources: "Discogs, MusicBrainz, YouTube",
  },
  curious: {
    model: "gemini-2.5-flash",
    nuggetCount: 3,
    depthLabel: "production details, cultural context, artist history. Engaging storytelling for music fans.",
    sources: "Discogs, Pitchfork, Rolling Stone, AllMusic, YouTube",
  },
  nerd: {
    model: "gemini-2.5-pro",
    nuggetCount: 3,
    depthLabel: "technical breakdowns, obscure influences, deep fan theory angles, Reddit-level deep cuts. Maximum depth for audiophiles.",
    sources: "Discogs, Pitchfork, Reddit, MusicBrainz, AllMusic, The Wire, Fact Magazine, YouTube",
  },
};

function geminiUrl(model: string, apiKey: string): string {
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
}

function publisherDomain(publisher: string): string {
  const map: Record<string, string> = {
    "pitchfork": "pitchfork.com",
    "rolling stone": "rollingstone.com",
    "nme": "nme.com",
    "the guardian": "theguardian.com",
    "consequence of sound": "consequenceofsound.net",
    "stereogum": "stereogum.com",
    "billboard": "billboard.com",
    "spin": "spin.com",
    "allmusic": "allmusic.com",
    "songfacts": "songfacts.com",
    "discogs": "discogs.com",
    "musicbrainz": "musicbrainz.org",
    "reddit": "reddit.com",
    "fact magazine": "factmag.com",
    "the wire": "thewire.co.uk",
  };
  return map[publisher.toLowerCase()] || publisher.toLowerCase().replace(/\s+/g, "") + ".com";
}

// Fetch Last.fm context from the lastfm-sync edge function (uses cache internally)
async function getLastFmContext(username: string, supabaseUrl: string, supabaseKey: string): Promise<string> {
  try {
    const syncUrl = `${supabaseUrl}/functions/v1/lastfm-sync`;
    const res = await fetch(syncUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": supabaseKey,
      },
      body: JSON.stringify({ username }),
    });

    if (!res.ok) {
      console.warn(`lastfm-sync returned ${res.status} for ${username}`);
      return "";
    }

    const data = await res.json();
    if (data.error) {
      console.warn("lastfm-sync error:", data.error);
      return "";
    }

    const lines: string[] = [];

    if (data.userInfo?.playcount) {
      lines.push(`Last.fm profile: ${username} — ${data.userInfo.playcount.toLocaleString()} total scrobbles`);
      if (data.userInfo.country) lines.push(`Country: ${data.userInfo.country}`);
    }

    if (data.topArtists?.length) {
      const artists = data.topArtists.map((a: any) => `${a.name} (${a.playcount} plays)`).join(", ");
      lines.push(`Top artists this month: ${artists}`);
    }

    if (data.recentTracks?.length) {
      const tracks = data.recentTracks.map((t: any) => `"${t.name}" by ${t.artist}`).join(", ");
      lines.push(`Recently played: ${tracks}`);
      lines.push(`(Avoid recommending things too similar to their recently played tracks in Explore suggestions)`);
    }

    return lines.length
      ? `\n\nLAST.FM USER CONTEXT (use to personalise Explore Next recommendations):\n${lines.join("\n")}\n`
      : "";
  } catch (e) {
    console.warn("Failed to fetch Last.fm context:", e);
    return "";
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const {
      artist,
      title,
      album,
      listenCount = 1,
      tier = "casual",
      lastFmUsername,
    } = await req.json();

    if (!artist || !title) {
      return new Response(
        JSON.stringify({ error: "artist and title are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const GOOGLE_AI_API_KEY = Deno.env.get("GOOGLE_AI_API_KEY");
    if (!GOOGLE_AI_API_KEY) throw new Error("GOOGLE_AI_API_KEY is not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const tierConfig = TIER_CONFIG[tier as Tier] || TIER_CONFIG.casual;
    const listenTier = Math.min(Math.max(listenCount, 1), 3);

    const cacheKey = `${artist}::${title}::${tier}::${listenTier}`;

    // Check companion cache (but skip if user has Last.fm — their cache is personalised)
    if (!lastFmUsername) {
      const { data: cached } = await supabase
        .from("companion_cache")
        .select("content")
        .eq("track_key", cacheKey)
        .eq("listen_count_tier", listenTier)
        .maybeSingle();

      if (cached?.content) {
        console.log(`Cache hit: ${cacheKey}`);
        return new Response(JSON.stringify(cached.content), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Fetch Last.fm context (served from cache 99% of the time)
    const lastFmContext = lastFmUsername
      ? await getLastFmContext(lastFmUsername, supabaseUrl, supabaseKey)
      : "";

    // Depth instruction based on listen count
    let depthInstruction: string;
    if (listenCount <= 1) {
      depthInstruction = "First listen. Set the stage, introduce the world of this track.";
    } else if (listenCount === 2) {
      depthInstruction = "Second listen. Go deeper — production choices, lesser-known connections.";
    } else {
      depthInstruction = `Listen #${listenCount}. Maximum depth — obscure influences, technical breakdowns, unexpected connections.`;
    }

    const nuggetsPerCategory = Math.floor(tierConfig.nuggetCount / 3);
    const now = Date.now();

    const prompt = `You are a music historian API. Output ONLY a valid JSON object. No markdown, no prose, no explanation. Start with { end with }.

Track: "${title}" by ${artist}${album ? ` from "${album}"` : ""}
Tier: ${tier.toUpperCase()} — ${tierConfig.depthLabel}
Depth: ${depthInstruction}
Sources to use: ${tierConfig.sources}${lastFmContext}

Generate:
1. "artistSummary": 2 punchy sentences capturing the artist's essence.
2. "trackStory": 1 short paragraph (3-4 sentences) about this track's creation, meaning, cultural impact.
3. "nuggets": Exactly ${tierConfig.nuggetCount} nuggets — ${nuggetsPerCategory} per category ("track", "history", "explore").
4. "externalLinks": 3 useful links (Wikipedia, Spotify, YouTube Music).

NUGGET SCHEMA (each nugget):
{
  "id": "unique-string-id",
  "timestamp": <integer ms — stagger them: subtract 0-${tierConfig.nuggetCount * 60000} from ${now}>,
  "headline": "1 curiosity-sparking sentence",
  "text": "2-3 sentences delivering rich detail",
  "category": "track" | "history" | "explore",
  "listenUnlockLevel": 1 (for first ${Math.ceil(tierConfig.nuggetCount / 3)} nuggets), 2 (middle), or 3 (deepest),
  "sourceName": "Real source name e.g. Pitchfork, Discogs, Reddit",
  "sourceUrl": "A DIRECT real URL to the source page — NOT a Google search URL. Use the actual domain."
}

RULES:
- Every sourceUrl must be a direct link (e.g. https://pitchfork.com/reviews/..., https://www.discogs.com/..., https://reddit.com/r/...).
- If you cannot provide a direct URL, use the most targeted search on that source's own search (e.g. https://www.discogs.com/search/?q=...).
- Be factually accurate. Cite REAL articles, real Reddit threads, real Discogs entries.
- Each nugget covers a DIFFERENT angle — no two nuggets share the same fact.
- "listenUnlockLevel" distribution: first ${Math.ceil(tierConfig.nuggetCount / 3)} nuggets = level 1, next = level 2, rest = level 3.
- Timestamps must be staggered so reverse-chronological sort within each category works correctly.
${lastFmContext ? "- Use the Last.fm user context to make 'explore' category recommendations genuinely relevant to this listener's taste — not generic suggestions." : ""}

OUTPUT: Raw JSON only. No backticks.`;

    const apiUrl = geminiUrl(tierConfig.model, GOOGLE_AI_API_KEY);

    for (let attempt = 0; attempt < 3; attempt++) {
      const res = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          tools: [{ google_search: {} }],
          generationConfig: { temperature: tier === "nerd" ? 0.8 : 0.65 },
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const candidate = data.candidates?.[0];
        const finishReason = candidate?.finishReason;

        if (finishReason === "SAFETY" || finishReason === "RECITATION") {
          if (attempt < 2) { await new Promise((r) => setTimeout(r, 2000)); continue; }
          throw new Error(`Gemini blocked: ${finishReason}`);
        }

        const text = candidate?.content?.parts?.[0]?.text || "";
        if (!text.trim()) {
          if (attempt < 2) { await new Promise((r) => setTimeout(r, 2000)); continue; }
          throw new Error("Gemini returned empty response");
        }

        let parsed: any;
        try {
          let cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
          const firstBrace = cleaned.indexOf("{");
          const lastBrace = cleaned.lastIndexOf("}");
          if (firstBrace !== -1 && lastBrace > firstBrace) {
            cleaned = cleaned.substring(firstBrace, lastBrace + 1);
          }
          parsed = JSON.parse(cleaned);
        } catch {
          if (attempt < 2) { await new Promise((r) => setTimeout(r, 2000)); continue; }
          throw new Error("Failed to parse Gemini response");
        }

        // Post-process nuggets
        if (parsed.nuggets) {
          for (const n of parsed.nuggets) {
            if (!n.sourceUrl || n.sourceUrl.includes("google.com/search")) {
              const domain = publisherDomain(n.sourceName || "");
              const q = encodeURIComponent(`${artist} ${title} ${n.sourceName || ""}`);
              n.sourceUrl = `https://${domain}/search/?q=${q}`;
            }
            if (!n.id) n.id = crypto.randomUUID();
            if (!n.timestamp || typeof n.timestamp !== "number") {
              n.timestamp = now - Math.random() * tierConfig.nuggetCount * 60000;
            }
          }
        }

        // Fallback external links
        if (!parsed.externalLinks?.length) {
          const encodedQuery = encodeURIComponent(`${artist} ${title}`);
          const encodedArtist = encodeURIComponent(artist).replace(/%20/g, "_");
          parsed.externalLinks = [
            { label: "Wikipedia", url: `https://en.wikipedia.org/wiki/${encodedArtist}` },
            { label: "Spotify", url: `https://open.spotify.com/search/${encodedQuery}` },
            { label: "YouTube Music", url: `https://music.youtube.com/search?q=${encodedQuery}` },
          ];
        }

        // Cache result (only for non-personalised responses)
        if (!lastFmUsername) {
          await supabase.from("companion_cache").upsert(
            { track_key: cacheKey, listen_count_tier: listenTier, content: parsed },
            { onConflict: "track_key,listen_count_tier" }
          );
        }

        return new Response(JSON.stringify(parsed), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (res.status === 429 && attempt < 2) {
        const errData = await res.json().catch(() => null);
        const retryInfo = errData?.error?.details?.find((d: any) => d["@type"]?.includes("RetryInfo"));
        const delaySec = parseFloat((retryInfo?.retryDelay || "5s").replace("s", "")) || 5;
        await new Promise((r) => setTimeout(r, Math.min((delaySec + 2) * 1000, 55000)));
        continue;
      }

      const errText = await res.text();
      console.error("Gemini error:", res.status, errText);
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
