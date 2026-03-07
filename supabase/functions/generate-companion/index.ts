import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

// ── Auth helper ───────────────────────────────────────────────────────
async function requireAuth(req: Request, corsHeaders: Record<string, string>): Promise<{ userId: string } | Response> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );
  const token = authHeader.replace("Bearer ", "");
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  return { userId: user.id };
}

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

const knownDomains: Record<string, string> = {
  "pitchfork": "pitchfork.com", "rolling stone": "rollingstone.com",
  "nme": "nme.com", "the guardian": "theguardian.com",
  "consequence of sound": "consequenceofsound.net", "stereogum": "stereogum.com",
  "billboard": "billboard.com", "spin": "spin.com",
  "allmusic": "allmusic.com", "songfacts": "songfacts.com",
  "discogs": "discogs.com", "musicbrainz": "musicbrainz.org",
  "reddit": "reddit.com", "genius": "genius.com",
  "bandcamp daily": "daily.bandcamp.com", "fact magazine": "factmag.com",
  "the wire": "thewire.co.uk", "resident advisor": "ra.co",
  "sound on sound": "soundonsound.com", "tape op": "tapeop.com",
};

function publisherDomain(publisher: string): string {
  return knownDomains[publisher.toLowerCase()] || publisher.toLowerCase().replace(/\s+/g, "") + ".com";
}

// Fetch Last.fm context from the lastfm-sync edge function (uses cache internally)
async function getLastFmContext(username: string, supabaseUrl: string, supabaseKey: string): Promise<string> {
  try {
    const syncUrl = `${supabaseUrl}/functions/v1/lastfm-sync`;
    const res = await fetch(syncUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${supabaseKey}`,
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

// ── Build taste context from ALL available sources ────────────────────────────
function buildTasteContext(
  lastFmContext: string,
  spotifyTopArtists: string[] | null,
  spotifyTopTracks: string[] | null,
  streamingService: string | null
): string {
  const lines: string[] = [];

  // Last.fm context (already formatted by getLastFmContext)
  if (lastFmContext) {
    lines.push(lastFmContext.trim());
  }

  // Spotify taste signals
  if (spotifyTopArtists?.length || spotifyTopTracks?.length) {
    lines.push("\nSPOTIFY TASTE PROFILE (use to personalise Explore Next recommendations):");
    if (spotifyTopArtists?.length) {
      lines.push(`Top artists on Spotify: ${spotifyTopArtists.join(", ")}`);
    }
    if (spotifyTopTracks?.length) {
      lines.push(`Top tracks on Spotify: ${spotifyTopTracks.slice(0, 8).join(", ")}`);
    }
    lines.push("(Use these to infer genre preferences and suggest genuinely relevant artists/albums)");
  }

  // Streaming service hint (even without OAuth taste data, helps tailor links)
  if (streamingService && !spotifyTopArtists?.length) {
    lines.push(`\nUser's streaming service: ${streamingService} (tailor external links accordingly)`);
  }

  if (!lines.length) return "";

  return `\n\nUSER TASTE CONTEXT:\n${lines.join("\n")}\n`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Auth is optional for the companion page (accessed via QR code, user may not be logged in).
  // If a valid session exists we use it for personalization; otherwise we proceed anonymously.

  try {
    const {
      artist,
      title,
      album,
      listenCount = 1,
      tier = "casual",
      lastFmUsername,
      spotifyTopArtists = null,
      spotifyTopTracks = null,
      streamingService = null,
      prebuiltNuggets = null,
      coverArtUrl = null,
      artistImage = null,
    } = await req.json();

    // ── Input validation ────────────────────────────────────────────
    const MAX_STR = 300;
    const MAX_USERNAME = 50;
    const MAX_ARRAY = 100;
    const VALID_TIERS = ["casual", "curious", "nerd"];

    if (!artist || typeof artist !== "string" || artist.trim().length === 0 || artist.length > MAX_STR) {
      return new Response(JSON.stringify({ error: "Invalid artist (max 300 chars)" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (!title || typeof title !== "string" || title.trim().length === 0 || title.length > MAX_STR) {
      return new Response(JSON.stringify({ error: "Invalid title (max 300 chars)" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (album !== undefined && album !== null && (typeof album !== "string" || album.length > MAX_STR)) {
      return new Response(JSON.stringify({ error: "Invalid album" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const safeTier = VALID_TIERS.includes(tier) ? tier : "casual";
    const safeListenCount = Math.max(1, Math.min(10, typeof listenCount === "number" ? Math.floor(listenCount) : 1));
    if (lastFmUsername !== undefined && lastFmUsername !== null) {
      if (typeof lastFmUsername !== "string" || lastFmUsername.length > MAX_USERNAME || !/^[a-zA-Z0-9_-]+$/.test(lastFmUsername)) {
        return new Response(JSON.stringify({ error: "Invalid lastFmUsername" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }
    const safeSpotifyTopArtists = Array.isArray(spotifyTopArtists)
      ? spotifyTopArtists.slice(0, MAX_ARRAY).map((s: unknown) => (typeof s === "string" ? s.slice(0, 200) : "")).filter(Boolean)
      : null;
    const safeSpotifyTopTracks = Array.isArray(spotifyTopTracks)
      ? spotifyTopTracks.slice(0, MAX_ARRAY).map((s: unknown) => (typeof s === "string" ? s.slice(0, 200) : "")).filter(Boolean)
      : null;
    const safeStreamingService = typeof streamingService === "string" ? streamingService.slice(0, 50) : null;

    const GOOGLE_AI_API_KEY = Deno.env.get("GOOGLE_AI_API_KEY");
    if (!GOOGLE_AI_API_KEY) throw new Error("GOOGLE_AI_API_KEY is not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const tierConfig = TIER_CONFIG[safeTier as Tier] || TIER_CONFIG.casual;
    const listenTier = Math.min(Math.max(safeListenCount, 1), 3);

    const cacheKey = `${artist}::${title}::${safeTier}::${listenTier}`;

    // Personalised = has ANY taste signals (Last.fm OR Spotify). Skip cache for these.
    const isPersonalised = !!(lastFmUsername || safeSpotifyTopArtists?.length || safeSpotifyTopTracks?.length);

    if (!isPersonalised) {
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

    // ── Validate prebuiltNuggets if provided ─────────────────────────
    let validPrebuiltNuggets: any[] | null = null;
    if (Array.isArray(prebuiltNuggets) && prebuiltNuggets.length > 0) {
      const isValid = prebuiltNuggets.every(
        (n: any) =>
          n &&
          typeof n.id === "string" &&
          typeof n.text === "string" &&
          typeof n.category === "string" &&
          ["track", "history", "explore"].includes(n.category)
      );
      if (isValid) {
        validPrebuiltNuggets = prebuiltNuggets;
        console.log(`Using ${validPrebuiltNuggets.length} prebuilt nuggets from Listen page`);
      } else {
        console.warn("prebuiltNuggets failed validation, falling back to full generation");
      }
    }

    // Fetch Last.fm context (served from lastfm_cache, near-instant)
    const lastFmContext = lastFmUsername
      ? await getLastFmContext(lastFmUsername, supabaseUrl, supabaseKey)
      : "";

    // Merge all taste signals into one context block
    const tasteContext = buildTasteContext(lastFmContext, safeSpotifyTopArtists, safeSpotifyTopTracks, safeStreamingService);

    // Build streaming-service-aware external links hint
    const streamingLinkHint = safeStreamingService === "Apple Music"
      ? 'For external links, include Apple Music search instead of Spotify.'
      : safeStreamingService === "YouTube Music"
      ? 'For external links, include YouTube Music search instead of Spotify.'
      : 'For external links, include Spotify search.';

    // ── Fast path: prebuilt nuggets — only generate summary + links ──
    let prompt: string;
    if (validPrebuiltNuggets) {
      prompt = `You are a music historian API. Output ONLY a valid JSON object. No markdown, no prose, no explanation. Start with { end with }.

Track: "${title}" by ${artist}${album ? ` from "${album}"` : ""}
Tier: ${safeTier.toUpperCase()} — ${tierConfig.depthLabel}${tasteContext}

Generate:
1. "artistSummary": 2 punchy sentences capturing the artist's essence.
2. "trackStory": 1 short paragraph (3-4 sentences) about this track's creation, meaning, cultural impact.
3. "externalLinks": 3 useful links (Wikipedia, streaming service, YouTube Music).

RULES:
- ${streamingLinkHint}
- Be factually accurate.

OUTPUT: Raw JSON only. No backticks.`;
    } else {
      // ── Full path: generate everything including nuggets ──
      // Depth instruction based on listen count
      let depthInstruction: string;
      if (safeListenCount <= 1) {
        depthInstruction = "First listen. Set the stage, introduce the world of this track.";
      } else if (safeListenCount === 2) {
        depthInstruction = "Second listen. Go deeper — production choices, lesser-known connections.";
      } else {
        depthInstruction = `Listen #${safeListenCount}. Maximum depth — obscure influences, technical breakdowns, unexpected connections.`;
      }

      const nuggetsPerCategory = Math.floor(tierConfig.nuggetCount / 3);
      const now = Date.now();

      prompt = `You are a music historian API. Output ONLY a valid JSON object. No markdown, no prose, no explanation. Start with { end with }.

Track: "${title}" by ${artist}${album ? ` from "${album}"` : ""}
Tier: ${safeTier.toUpperCase()} — ${tierConfig.depthLabel}
Depth: ${depthInstruction}
Sources to use: ${tierConfig.sources}${tasteContext}

Generate:
1. "artistSummary": 2 punchy sentences capturing the artist's essence.
2. "trackStory": 1 short paragraph (3-4 sentences) about this track's creation, meaning, cultural impact.
3. "nuggets": Exactly ${tierConfig.nuggetCount} nuggets — ${nuggetsPerCategory} per category ("track", "history", "explore").
4. "externalLinks": 3 useful links (Wikipedia, streaming service, YouTube Music).

NUGGET SCHEMA (each nugget):
{
  "id": "unique-string-id",
  "timestamp": <integer ms — stagger them: subtract 0-${tierConfig.nuggetCount * 60000} from ${now}>,
  "headline": "1 curiosity-sparking sentence",
  "text": "2-3 sentences delivering rich detail",
  "category": "track" | "history" | "explore",
  "listenUnlockLevel": ${safeListenCount},
  "sourceName": "Real source name e.g. Pitchfork, Discogs, Reddit",
  "sourceUrl": "A DIRECT real URL to the source page — NOT a Google search URL. Use the actual domain."
}

RULES:
- Every sourceUrl must be a direct link (e.g. https://pitchfork.com/reviews/..., https://www.discogs.com/..., https://reddit.com/r/...).
- If you cannot provide a direct URL, use the most targeted search on that source's own search (e.g. https://www.discogs.com/search/?q=...).
- Be factually accurate. Cite REAL articles, real Reddit threads, real Discogs entries.
- Each nugget covers a DIFFERENT angle — no two nuggets share the same fact.
- All nuggets in this set share the same "listenUnlockLevel": ${safeListenCount}. A fresh set of nuggets is generated for each listen count.
- Timestamps must be staggered so reverse-chronological sort within each category works correctly.
${tasteContext ? "- Use the USER TASTE CONTEXT above to make 'explore' category recommendations genuinely relevant to this listener — not generic suggestions." : ""}
- ${streamingLinkHint}

OUTPUT: Raw JSON only. No backticks.`;
    }

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

        // Merge prebuilt nuggets or post-process Gemini-generated ones
        if (validPrebuiltNuggets) {
          // Use Listen page nuggets directly — they have real grounded URLs
          parsed.nuggets = validPrebuiltNuggets;
        } else if (parsed.nuggets) {
          const now = Date.now();
          for (const n of parsed.nuggets) {
            if (!n.sourceUrl || n.sourceUrl.includes("google.com/search?btnI")) {
              // Use site-scoped Google search instead of guessing direct URLs
              const pubLower = (n.sourceName || "").toLowerCase();
              const domain = knownDomains[pubLower];
              if (domain) {
                const q = `site:${domain} ${artist} ${title}`;
                n.sourceUrl = `https://www.google.com/search?q=${encodeURIComponent(q)}`;
              } else if (pubLower && pubLower !== "unknown" && pubLower !== "general knowledge") {
                const q = `"${n.sourceName}" ${artist} ${title}`;
                n.sourceUrl = `https://www.google.com/search?q=${encodeURIComponent(q)}`;
              } else {
                n.sourceUrl = `https://www.google.com/search?q=${encodeURIComponent(`${artist} ${title}`)}`;
              }
            }
            if (!n.id) n.id = crypto.randomUUID();
            if (!n.timestamp || typeof n.timestamp !== "number") {
              n.timestamp = now - Math.random() * tierConfig.nuggetCount * 60000;
            }
          }

          // Accumulate nuggets from previous listen tiers so the companion page
          // shows all nuggets across listens, not just the current tier's batch.
          if (listenTier > 1) {
            const previousNuggets: any[] = [];
            for (let t = 1; t < listenTier; t++) {
              const prevKey = `${artist}::${title}::${safeTier}::${t}`;
              const { data: prevCached } = await supabase
                .from("companion_cache")
                .select("content")
                .eq("track_key", prevKey)
                .eq("listen_count_tier", t)
                .maybeSingle();
              if (prevCached?.content?.nuggets) {
                previousNuggets.push(...prevCached.content.nuggets);
              }
            }
            if (previousNuggets.length > 0) {
              // Deduplicate by id (prebuilt nuggets may overlap)
              const existingIds = new Set(parsed.nuggets.map((n: any) => n.id));
              const unique = previousNuggets.filter((n: any) => !existingIds.has(n.id));
              parsed.nuggets = [...unique, ...parsed.nuggets];
            }
          }
        }

        // Normalize externalLinks field names (Gemini sometimes uses "name" instead of "label")
        if (parsed.externalLinks?.length) {
          for (const link of parsed.externalLinks) {
            if (!link.label && link.name) {
              link.label = link.name;
              delete link.name;
            }
          }
        }

        // Build service-appropriate external links fallback
        if (!parsed.externalLinks?.length) {
          const encodedQuery = encodeURIComponent(`${artist} ${title}`);
          const encodedArtist = encodeURIComponent(artist).replace(/%20/g, "_");
          const streamingLink =
            safeStreamingService === "Apple Music"
              ? { label: "Apple Music", url: `https://music.apple.com/search?term=${encodedQuery}` }
              : safeStreamingService === "YouTube Music"
              ? { label: "YouTube Music", url: `https://music.youtube.com/search?q=${encodedQuery}` }
              : { label: "Spotify", url: `https://open.spotify.com/search/${encodedQuery}` };
          parsed.externalLinks = [
            { label: "Wikipedia", url: `https://en.wikipedia.org/wiki/${encodedArtist}` },
            streamingLink,
            { label: "YouTube Music", url: `https://music.youtube.com/search?q=${encodedQuery}` },
          ];
          if (safeStreamingService === "YouTube Music") {
            parsed.externalLinks = [
              { label: "Wikipedia", url: `https://en.wikipedia.org/wiki/${encodedArtist}` },
              streamingLink,
              { label: "Spotify", url: `https://open.spotify.com/search/${encodedQuery}` },
            ];
          }
        }

        // Attach image URLs so companion page works for unauthenticated QR users
        if (coverArtUrl && typeof coverArtUrl === "string") parsed.coverArtUrl = coverArtUrl;
        if (artistImage && typeof artistImage === "string") parsed.artistImage = artistImage;

        // Cache only non-personalised responses
        if (!isPersonalised) {
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
