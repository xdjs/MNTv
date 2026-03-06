// DEPRECATED: This function is no longer called by the client.
// Image resolution has been replaced by client-side Spotify image assignment
// in useAINuggets.ts — always accurate, zero API calls.
// Kept deployed for safety but can be removed in a future cleanup.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MB_USER_AGENT = "MusicNerd/1.0 (musicnerd-app)";

// ── Provenance metadata for image-caption reconciliation ─────────────
type ProvenanceSource = "spotify_artist" | "spotify_album" | "gemini_wikipedia" | "musicbrainz" | "wikimedia_commons";
type MatchQuality = "exact" | "related" | "generic";

interface Provenance {
  source: ProvenanceSource;
  articleTitle?: string;
  imageFileName?: string;
  matchQuality: MatchQuality;
}

interface ImageResult {
  url: string;
  provenance: Provenance;
}

async function fetchWithRetry(url: string, options?: RequestInit, retries = 2): Promise<Response> {
  for (let i = 0; i < retries; i++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      const res = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timeout);
      return res;
    } catch (e) {
      clearTimeout(timeout);
      if (i === retries - 1) throw e;
      await new Promise((r) => setTimeout(r, 800 * (i + 1)));
    }
  }
  throw new Error("Unreachable");
}

// ── Helper: extract artist name from verbose AI queries ──────────────
function extractArtistName(query: string): string {
  const stopWords = /\b(delivering|performing|playing|in|on|at|with|during|holding|behind|live|the\b.*\b(?:stage|studio|guitar|piano|drums|mic|booth))/i;
  const match = query.split(stopWords)[0].trim();
  const dashSplit = match.split(/\s+[-—–]\s+/)[0].trim();
  return dashSplit || query;
}

// ═══════════════════════════════════════════════════════════════════════
// TIER 1: Spotify API (fast, accurate for artists & albums)
// ═══════════════════════════════════════════════════════════════════════

let spotifyToken: string | null = null;
let spotifyTokenExpiry = 0;

async function getSpotifyToken(): Promise<string | null> {
  if (spotifyToken && Date.now() < spotifyTokenExpiry) return spotifyToken;

  const clientId = Deno.env.get("VITE_SPOTIFY_CLIENT_ID");
  const clientSecret = Deno.env.get("SPOTIFY_CLIENT_SECRET");
  if (!clientId || !clientSecret) return null;

  try {
    const res = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
      },
      body: "grant_type=client_credentials",
    });
    if (!res.ok) return null;
    const data = await res.json();
    spotifyToken = data.access_token;
    spotifyTokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
    return spotifyToken;
  } catch {
    return null;
  }
}

async function spotifyArtistImage(query: string): Promise<ImageResult | null> {
  const token = await getSpotifyToken();
  if (!token) return null;

  const artistName = extractArtistName(query);
  const url = `https://api.spotify.com/v1/search?type=artist&limit=3&q=${encodeURIComponent(artistName)}`;
  const res = await fetchWithRetry(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  const data = await res.json();
  const artists = data?.artists?.items || [];
  if (artists.length === 0) return null;

  const nameLower = artistName.toLowerCase();
  const exactMatch = artists.find((a: any) => a.name.toLowerCase() === nameLower);
  if (!exactMatch) {
    console.log(`[nugget-image] Spotify: no exact match for "${artistName}", skipping`);
    return null;
  }
  const images = exactMatch?.images || [];
  const imgUrl = images[0]?.url;
  if (!imgUrl) return null;
  return { url: imgUrl, provenance: { source: "spotify_artist", articleTitle: exactMatch.name, matchQuality: "exact" } };
}

async function spotifyAlbumImage(query: string, trackArtist?: string): Promise<ImageResult | null> {
  const token = await getSpotifyToken();
  if (!token) return null;

  const searchQuery = trackArtist ? `${query} artist:${trackArtist}` : query;
  const url = `https://api.spotify.com/v1/search?type=album&limit=5&q=${encodeURIComponent(searchQuery)}`;
  const res = await fetchWithRetry(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  const data = await res.json();
  const albums = data?.albums?.items || [];
  if (albums.length === 0) return null;

  if (trackArtist) {
    const artistLower = trackArtist.toLowerCase();
    const match = albums.find((a: any) =>
      (a.artists || []).some((ar: any) => ar.name.toLowerCase() === artistLower)
    );
    if (match) {
      const images = match?.images || [];
      const imgUrl = images[0]?.url;
      if (!imgUrl) return null;
      return { url: imgUrl, provenance: { source: "spotify_album", articleTitle: match.name, matchQuality: "exact" } };
    }
    console.log(`[nugget-image] Spotify album: no match for artist "${trackArtist}" in results for "${query}", skipping`);
    return null;
  }

  const images = albums[0]?.images || [];
  const imgUrl = images[0]?.url;
  if (!imgUrl) return null;
  return { url: imgUrl, provenance: { source: "spotify_album", articleTitle: albums[0].name, matchQuality: "exact" } };
}

// ═══════════════════════════════════════════════════════════════════════
// TIER 2: Gemini AI image search (Wikipedia article images + Commons)
// ═══════════════════════════════════════════════════════════════════════

async function callGemini(prompt: string): Promise<string> {
  const apiKey = Deno.env.get("GOOGLE_AI_API_KEY");
  if (!apiKey) throw new Error("no API key");

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.2,
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
    }
  );

  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const data = await res.json();
  const parts = data.candidates?.[0]?.content?.parts || [];
  const textPart = parts.find((p: any) => typeof p.text === "string");
  return textPart?.text || "";
}

// Fetch all images from a Wikipedia article via the REST API
async function getWikipediaArticleImages(articleTitle: string): Promise<{ title: string; url: string }[]> {
  const encoded = encodeURIComponent(articleTitle.replace(/ /g, "_"));
  const url = `https://en.wikipedia.org/api/rest_v1/page/media-list/${encoded}`;
  try {
    const res = await fetchWithRetry(url, { headers: { "User-Agent": MB_USER_AGENT } });
    if (!res.ok) return [];
    const data = await res.json();
    const items = data.items || [];
    return items
      .filter((item: any) => {
        const t = (item.title || "").toLowerCase();
        // Skip SVGs, logos, icons, flags, maps
        return !t.endsWith(".svg") && !t.includes("logo") && !t.includes("icon")
          && !t.includes("flag_of") && !t.includes("map_of");
      })
      .map((item: any) => {
        const srcset = item.srcset || [];
        // Pick the largest available size
        const best = srcset.reduce((a: any, b: any) => (b.scale || 1) > (a.scale || 1) ? b : a, srcset[0] || {});
        const src = best?.src || "";
        return {
          title: item.title || "",
          url: src.startsWith("//") ? `https:${src}` : src,
        };
      })
      .filter((item: any) => item.url);
  } catch {
    return [];
  }
}

async function geminiImageSearch(query: string, trackArtist?: string, trackTitle?: string): Promise<ImageResult | null> {
  if (!Deno.env.get("GOOGLE_AI_API_KEY")) return null;

  try {
    // Step 1: Ask Gemini for the best Wikipedia article title(s) for this subject
    const contextLine = trackArtist && trackTitle
      ? `\nContext: This is for the song "${trackTitle}" by ${trackArtist}.\n`
      : "";
    const prompt = `For an image search about: "${query}"
${contextLine}
Suggest 1-3 Wikipedia article titles that would contain the most relevant images.
Think broadly — for "Prince performing Purple Rain guitar solo" you might suggest:
- "Prince (musician)" (main article with performance photos)
- "Purple Rain (album)" (album-specific imagery)
- "Purple Rain (film)" (film stills)

For "Fender Stratocaster" you might suggest:
- "Fender Stratocaster" (instrument photos)
- "Jimi Hendrix" (famous player photos with the guitar)

IMPORTANT: Only suggest Wikipedia articles that you are CONFIDENT exist. If the subject is an obscure or unknown person who is unlikely to have a Wikipedia article, return {"articles": []} — do NOT guess or suggest articles about different people with similar names.

Return ONLY valid JSON: {"articles": ["Article_Title_1", "Article_Title_2"]}`;

    const text = await callGemini(prompt);
    const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const parsed = JSON.parse(cleaned);
    const articles: string[] = parsed.articles || [];

    if (articles.length === 0) return null;

    // Step 2: Fetch images from all suggested articles in parallel, tracking which article each image came from
    const allImages: { title: string; url: string; articleTitle: string }[] = [];
    const imageResults = await Promise.allSettled(
      articles.map((a) => getWikipediaArticleImages(a).then(imgs => imgs.map(img => ({ ...img, articleTitle: a }))))
    );
    for (const result of imageResults) {
      if (result.status === "fulfilled") {
        allImages.push(...result.value);
      }
    }

    if (allImages.length === 0) return null;

    // Step 3: Ask Gemini to pick the best image from the available options
    const imageList = allImages
      .slice(0, 25)
      .map((img, i) => `${i + 1}. ${img.title} (from article: "${img.articleTitle}")`)
      .join("\n");

    const pickPrompt = `From these Wikipedia article images, pick the ONE most relevant for: "${query}"

Available images:
${imageList}

Pick the image that best matches the specific context of the query.
- Prefer action/performance/contextual photos over headshots or logos
- If the query mentions a specific era, instrument, or event, pick an image that matches

Return ONLY the number of your pick as JSON: {"pick": 4}`;

    const pickText = await callGemini(pickPrompt);
    const pickCleaned = pickText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const pickParsed = JSON.parse(pickCleaned);
    const pickIndex = (pickParsed.pick || 1) - 1;

    const chosen = allImages[Math.min(pickIndex, allImages.length - 1)];
    if (chosen?.url) {
      console.log(`[nugget-image] ✓ Gemini picked: "${chosen.title}" from "${chosen.articleTitle}" for "${query}"`);

      // Determine match quality: does the article directly match the query subject?
      const queryLower = query.toLowerCase();
      const articleLower = chosen.articleTitle.toLowerCase();
      const artistLower = (trackArtist || "").toLowerCase();
      const isExact = articleLower.includes(artistLower) && artistLower.length > 0
        || queryLower.includes(articleLower)
        || articleLower.includes(queryLower.split(" ")[0]);
      const matchQuality: MatchQuality = isExact ? "exact" : "related";

      return {
        url: chosen.url,
        provenance: {
          source: "gemini_wikipedia",
          articleTitle: chosen.articleTitle,
          imageFileName: chosen.title,
          matchQuality,
        },
      };
    }

    return null;
  } catch (e) {
    console.warn("[nugget-image] Gemini image search failed:", e instanceof Error ? e.message : e);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════
// TIER 3: MusicBrainz / Wikimedia Commons (free, open-source fallback)
// ═══════════════════════════════════════════════════════════════════════

async function searchArtist(name: string): Promise<string | null> {
  const url = `https://musicbrainz.org/ws/2/artist/?query=artist:${encodeURIComponent(name)}&fmt=json&limit=1`;
  const res = await fetchWithRetry(url, { headers: { "User-Agent": MB_USER_AGENT } });
  if (!res.ok) return null;
  const data = await res.json();
  return data.artists?.[0]?.id || null;
}

async function getWikidataId(mbid: string): Promise<string | null> {
  const url = `https://musicbrainz.org/ws/2/artist/${mbid}?inc=url-rels&fmt=json`;
  const res = await fetchWithRetry(url, { headers: { "User-Agent": MB_USER_AGENT } });
  if (!res.ok) return null;
  const data = await res.json();
  for (const rel of data.relations || []) {
    if (rel.type === "wikidata" && rel.url?.resource) {
      const match = rel.url.resource.match(/\/wiki\/(Q\d+)/);
      if (match) return match[1];
    }
  }
  return null;
}

async function getCommonsImageUrl(filename: string, width: number): Promise<string | null> {
  const normalized = filename.replace(/ /g, "_");
  const url = `https://en.wikipedia.org/w/api.php?action=query&titles=File:${encodeURIComponent(normalized)}&prop=imageinfo&iiprop=url&iiurlwidth=${width}&format=json`;
  const res = await fetchWithRetry(url, { headers: { "User-Agent": MB_USER_AGENT } });
  if (!res.ok) return null;
  const data = await res.json();
  const pages = data.query?.pages;
  if (!pages) return null;
  const page = Object.values(pages)[0] as any;
  return page?.imageinfo?.[0]?.thumburl || page?.imageinfo?.[0]?.url || null;
}

async function getArtistImageUrl(wikidataId: string, width = 500): Promise<string | null> {
  const url = `https://www.wikidata.org/wiki/Special:EntityData/${wikidataId}.json`;
  const res = await fetchWithRetry(url);
  if (!res.ok) return null;
  const data = await res.json();
  const entity = data.entities?.[wikidataId];
  const imageClaim = entity?.claims?.P18;
  if (!imageClaim?.length) return null;
  const filename = imageClaim[0]?.mainsnak?.datavalue?.value;
  if (!filename) return null;
  return getCommonsImageUrl(filename, width);
}

async function resolveArtistMB(query: string, width: number): Promise<ImageResult | null> {
  const cleaned = extractArtistName(query);
  let mbid = await searchArtist(cleaned);
  if (!mbid && cleaned !== query) {
    mbid = await searchArtist(query);
  }
  if (!mbid) return null;
  await new Promise((r) => setTimeout(r, 1100));
  const wikidataId = await getWikidataId(mbid);
  if (!wikidataId) return null;
  const imgUrl = await getArtistImageUrl(wikidataId, width);
  if (!imgUrl) return null;
  return { url: imgUrl, provenance: { source: "musicbrainz", articleTitle: cleaned, matchQuality: "exact" } };
}

async function resolveAlbumMB(query: string): Promise<ImageResult | null> {
  const url = `https://musicbrainz.org/ws/2/release-group/?query=${encodeURIComponent(query)}&fmt=json&limit=1`;
  const res = await fetchWithRetry(url, { headers: { "User-Agent": MB_USER_AGENT } });
  if (!res.ok) return null;
  const data = await res.json();
  const rg = data["release-groups"]?.[0];
  const mbid = rg?.id;
  if (!mbid) return null;

  const caaUrl = `https://coverartarchive.org/release-group/${mbid}/front-500`;
  try {
    const caaRes = await fetch(caaUrl, { redirect: "follow" });
    if (caaRes.ok) return { url: caaRes.url, provenance: { source: "musicbrainz", articleTitle: rg.title || query, matchQuality: "exact" } };
  } catch { /* CAA can be flaky */ }
  return null;
}

async function resolveWikiCommons(query: string, width: number): Promise<ImageResult | null> {
  const url = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrnamespace=6&gsrsearch=${encodeURIComponent(query)}&gsrlimit=3&prop=imageinfo&iiprop=url&iiurlwidth=${width}&format=json`;
  const res = await fetchWithRetry(url, { headers: { "User-Agent": MB_USER_AGENT } });
  if (!res.ok) return null;
  const data = await res.json();
  const pages = data.query?.pages;
  if (!pages) return null;

  for (const page of Object.values(pages) as any[]) {
    const thumbUrl = page?.imageinfo?.[0]?.thumburl;
    if (thumbUrl) return { url: thumbUrl, provenance: { source: "wikimedia_commons", imageFileName: page.title, matchQuality: "generic" } };
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════════════
// Combined resolvers: Gemini → Spotify → MusicBrainz/Wikimedia
// ═══════════════════════════════════════════════════════════════════════

async function resolveArtist(query: string, width: number, trackArtist?: string, trackTitle?: string): Promise<ImageResult | null> {
  const label = extractArtistName(query);

  const geminiResult = await geminiImageSearch(query, trackArtist, trackTitle);
  if (geminiResult) {
    console.log(`[nugget-image] ✓ Gemini artist: "${label}"`);
    return geminiResult;
  }

  const spotifyResult = await spotifyArtistImage(query);
  if (spotifyResult) {
    console.log(`[nugget-image] ✓ Spotify artist: "${label}"`);
    return spotifyResult;
  }

  console.log(`[nugget-image] Trying MusicBrainz for "${label}"`);
  return resolveArtistMB(query, width);
}

async function resolveAlbum(query: string, trackArtist?: string): Promise<ImageResult | null> {
  const geminiResult = await geminiImageSearch(`${query} album cover art`);
  if (geminiResult) {
    console.log(`[nugget-image] ✓ Gemini album: "${query}"`);
    return geminiResult;
  }

  const spotifyResult = await spotifyAlbumImage(query, trackArtist);
  if (spotifyResult) {
    console.log(`[nugget-image] ✓ Spotify album: "${query}"`);
    return spotifyResult;
  }

  console.log(`[nugget-image] Trying MusicBrainz/CAA for "${query}"`);
  return resolveAlbumMB(query);
}

async function resolveWiki(query: string, width: number): Promise<ImageResult | null> {
  const geminiResult = await geminiImageSearch(query);
  if (geminiResult) {
    console.log(`[nugget-image] ✓ Gemini wiki: "${query}"`);
    return geminiResult;
  }

  console.log(`[nugget-image] Trying Wikimedia Commons for "${query}"`);
  return resolveWikiCommons(query, width);
}

// ── Main handler ────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { type, query, width, artist: trackArtist, title: trackTitle } = await req.json();
    const imgWidth = width || 500;

    if (!type || !query) {
      return new Response(
        JSON.stringify({ imageUrl: null, reason: "type and query are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let result: ImageResult | null = null;

    switch (type) {
      case "artist":
        result = await resolveArtist(query, imgWidth, trackArtist, trackTitle);
        break;
      case "album":
        result = await resolveAlbum(query, trackArtist);
        break;
      case "wiki":
        result = await resolveWiki(query, imgWidth);
        break;
      default:
        return new Response(
          JSON.stringify({ imageUrl: null, provenance: null, reason: `Unknown type: ${type}` }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }

    return new Response(
      JSON.stringify({ imageUrl: result?.url || null, provenance: result?.provenance || null }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
          "Cache-Control": "public, max-age=86400",
        },
      }
    );
  } catch (e) {
    console.warn("nugget-image error:", e instanceof Error ? e.message : e);
    return new Response(
      JSON.stringify({ imageUrl: null, provenance: null, reason: "upstream error" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
