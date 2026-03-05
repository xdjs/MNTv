import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MB_USER_AGENT = "MusicNerd/1.0 (musicnerd-app)";

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

async function spotifyArtistImage(query: string): Promise<string | null> {
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
  const artist = exactMatch || artists[0];
  const images = artist?.images || [];
  return images[0]?.url || null;
}

async function spotifyAlbumImage(query: string): Promise<string | null> {
  const token = await getSpotifyToken();
  if (!token) return null;

  const url = `https://api.spotify.com/v1/search?type=album&limit=3&q=${encodeURIComponent(query)}`;
  const res = await fetchWithRetry(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  const data = await res.json();
  const albums = data?.albums?.items || [];
  if (albums.length === 0) return null;

  const images = albums[0]?.images || [];
  return images[0]?.url || null;
}

// ═══════════════════════════════════════════════════════════════════════
// TIER 2: Google Custom Search Images (broad, relevant for anything)
// ═══════════════════════════════════════════════════════════════════════

async function googleImageSearch(query: string): Promise<string | null> {
  const apiKey = Deno.env.get("GOOGLE_AI_API_KEY");
  const cx = Deno.env.get("GOOGLE_CSE_CX");
  if (!apiKey || !cx) return null;

  try {
    const url = new URL("https://www.googleapis.com/customsearch/v1");
    url.searchParams.set("key", apiKey);
    url.searchParams.set("cx", cx);
    url.searchParams.set("q", query);
    url.searchParams.set("searchType", "image");
    url.searchParams.set("num", "3");
    url.searchParams.set("safe", "active");
    // Prefer medium-large images, exclude tiny icons
    url.searchParams.set("imgSize", "LARGE");

    const res = await fetchWithRetry(url.toString());
    if (!res.ok) {
      console.warn(`[nugget-image] Google CSE error: ${res.status}`);
      return null;
    }
    const data = await res.json();
    const items = data?.items || [];
    if (items.length === 0) return null;

    // Return the first image link
    return items[0]?.link || null;
  } catch (e) {
    console.warn("[nugget-image] Google CSE failed:", e instanceof Error ? e.message : e);
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

async function resolveArtistMB(query: string, width: number): Promise<string | null> {
  const cleaned = extractArtistName(query);
  let mbid = await searchArtist(cleaned);
  if (!mbid && cleaned !== query) {
    mbid = await searchArtist(query);
  }
  if (!mbid) return null;
  await new Promise((r) => setTimeout(r, 1100));
  const wikidataId = await getWikidataId(mbid);
  if (!wikidataId) return null;
  return getArtistImageUrl(wikidataId, width);
}

async function resolveAlbumMB(query: string): Promise<string | null> {
  const url = `https://musicbrainz.org/ws/2/release-group/?query=${encodeURIComponent(query)}&fmt=json&limit=1`;
  const res = await fetchWithRetry(url, { headers: { "User-Agent": MB_USER_AGENT } });
  if (!res.ok) return null;
  const data = await res.json();
  const mbid = data["release-groups"]?.[0]?.id;
  if (!mbid) return null;

  const caaUrl = `https://coverartarchive.org/release-group/${mbid}/front-500`;
  try {
    const caaRes = await fetch(caaUrl, { redirect: "follow" });
    if (caaRes.ok) return caaRes.url;
  } catch { /* CAA can be flaky */ }
  return null;
}

async function resolveWikiCommons(query: string, width: number): Promise<string | null> {
  const url = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrnamespace=6&gsrsearch=${encodeURIComponent(query)}&gsrlimit=3&prop=imageinfo&iiprop=url&iiurlwidth=${width}&format=json`;
  const res = await fetchWithRetry(url, { headers: { "User-Agent": MB_USER_AGENT } });
  if (!res.ok) return null;
  const data = await res.json();
  const pages = data.query?.pages;
  if (!pages) return null;

  for (const page of Object.values(pages) as any[]) {
    const thumbUrl = page?.imageinfo?.[0]?.thumburl;
    if (thumbUrl) return thumbUrl;
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════════════
// Combined resolvers: Spotify → Google → MusicBrainz/Wikimedia
// ═══════════════════════════════════════════════════════════════════════

async function resolveArtist(query: string, width: number): Promise<string | null> {
  const label = extractArtistName(query);

  // Tier 1: Spotify (fast, accurate)
  const spotifyUrl = await spotifyArtistImage(query);
  if (spotifyUrl) {
    console.log(`[nugget-image] ✓ Spotify artist: "${label}"`);
    return spotifyUrl;
  }

  // Tier 2: Google Custom Search Images
  const googleUrl = await googleImageSearch(`${label} musician artist photo`);
  if (googleUrl) {
    console.log(`[nugget-image] ✓ Google artist: "${label}"`);
    return googleUrl;
  }

  // Tier 3: MusicBrainz → Wikidata → Wikimedia Commons
  console.log(`[nugget-image] Trying MusicBrainz for "${label}"`);
  return resolveArtistMB(query, width);
}

async function resolveAlbum(query: string): Promise<string | null> {
  // Tier 1: Spotify
  const spotifyUrl = await spotifyAlbumImage(query);
  if (spotifyUrl) {
    console.log(`[nugget-image] ✓ Spotify album: "${query}"`);
    return spotifyUrl;
  }

  // Tier 2: Google Custom Search Images
  const googleUrl = await googleImageSearch(`${query} album cover art`);
  if (googleUrl) {
    console.log(`[nugget-image] ✓ Google album: "${query}"`);
    return googleUrl;
  }

  // Tier 3: MusicBrainz → Cover Art Archive
  console.log(`[nugget-image] Trying MusicBrainz/CAA for "${query}"`);
  return resolveAlbumMB(query);
}

async function resolveWiki(query: string, width: number): Promise<string | null> {
  // Tier 1: Google Custom Search Images (best for instruments, studios, etc.)
  const googleUrl = await googleImageSearch(query);
  if (googleUrl) {
    console.log(`[nugget-image] ✓ Google wiki: "${query}"`);
    return googleUrl;
  }

  // Tier 2: Wikimedia Commons
  console.log(`[nugget-image] Trying Wikimedia Commons for "${query}"`);
  return resolveWikiCommons(query, width);
}

// ── Main handler ────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { type, query, width } = await req.json();
    const imgWidth = width || 500;

    if (!type || !query) {
      return new Response(
        JSON.stringify({ imageUrl: null, reason: "type and query are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let imageUrl: string | null = null;

    switch (type) {
      case "artist":
        imageUrl = await resolveArtist(query, imgWidth);
        break;
      case "album":
        imageUrl = await resolveAlbum(query);
        break;
      case "wiki":
        imageUrl = await resolveWiki(query, imgWidth);
        break;
      default:
        return new Response(
          JSON.stringify({ imageUrl: null, reason: `Unknown type: ${type}` }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }

    return new Response(
      JSON.stringify({ imageUrl }),
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
      JSON.stringify({ imageUrl: null, reason: "upstream error" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
