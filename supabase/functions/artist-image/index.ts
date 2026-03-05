import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MB_USER_AGENT = "MusicNerd/1.0 (musicnerd-app)";

// ── Spotify client credentials (fastest, most reliable for artist photos) ──

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

async function spotifyArtistImage(name: string): Promise<string | null> {
  const token = await getSpotifyToken();
  if (!token) return null;

  try {
    const url = `https://api.spotify.com/v1/search?type=artist&limit=3&q=${encodeURIComponent(name)}`;
    const res = await fetchWithRetry(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const artists = data?.artists?.items || [];
    if (artists.length === 0) return null;

    // Exact match only — prevents wrong-person images for common names
    const nameLower = name.toLowerCase();
    const exactMatch = artists.find((a: any) => a.name.toLowerCase() === nameLower);
    if (!exactMatch) {
      console.log(`[artist-image] Spotify: no exact match for "${name}", skipping`);
      return null;
    }
    const images = exactMatch?.images || [];
    return images[0]?.url || null;
  } catch {
    return null;
  }
}

async function requireAuth(req: Request): Promise<{ userId: string } | Response> {
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

/** Retry-aware fetch for flaky upstream APIs */
async function fetchWithRetry(url: string, options?: RequestInit, retries = 3): Promise<Response> {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, options);
      return res;
    } catch (e) {
      if (i === retries - 1) throw e;
      console.warn(`Fetch attempt ${i + 1} failed for ${url}, retrying...`);
      await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
    }
  }
  throw new Error("Unreachable");
}

/**
 * Step 1: Search MusicBrainz for artist → get MBID
 */
async function searchArtist(name: string): Promise<string | null> {
  const url = `https://musicbrainz.org/ws/2/artist/?query=artist:${encodeURIComponent(name)}&fmt=json&limit=1`;
  const res = await fetchWithRetry(url, {
    headers: { "User-Agent": MB_USER_AGENT },
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.artists?.[0]?.id || null;
}

/**
 * Step 2: Lookup artist with url-rels → find Wikidata relation
 */
async function getWikidataId(mbid: string): Promise<string | null> {
  const url = `https://musicbrainz.org/ws/2/artist/${mbid}?inc=url-rels&fmt=json`;
  const res = await fetchWithRetry(url, {
    headers: { "User-Agent": MB_USER_AGENT },
  });
  if (!res.ok) return null;
  const data = await res.json();

  const relations = data.relations || [];
  for (const rel of relations) {
    if (rel.type === "wikidata" && rel.url?.resource) {
      // Extract Wikidata ID from URL like https://www.wikidata.org/wiki/Q187814
      const match = rel.url.resource.match(/\/wiki\/(Q\d+)/);
      if (match) return match[1];
    }
  }
  return null;
}

/**
 * Step 3: Query Wikidata for image (P18 property)
 */
async function getImageFromWikidata(wikidataId: string): Promise<string | null> {
  const url = `https://www.wikidata.org/wiki/Special:EntityData/${wikidataId}.json`;
  const res = await fetchWithRetry(url);
  if (!res.ok) return null;
  const data = await res.json();

  const entity = data.entities?.[wikidataId];
  const imageClaim = entity?.claims?.P18;
  if (!imageClaim || imageClaim.length === 0) return null;

  const filename = imageClaim[0]?.mainsnak?.datavalue?.value;
  if (!filename) return null;

  // Convert filename to Wikimedia Commons thumbnail URL
  return wikimediaUrl(filename, 600);
}

/**
 * Build a Wikimedia Commons thumbnail URL from a filename
 */
function wikimediaUrl(filename: string, width: number): string {
  const normalized = filename.replace(/ /g, "_");
  const md5 = cyrb53Hash(normalized);
  const hex = md5.toString(16).padStart(2, "0");
  const a = hex[0];
  const ab = hex.substring(0, 2);
  return `https://upload.wikimedia.org/wikipedia/commons/thumb/${a}/${ab}/${encodeURIComponent(normalized)}/${width}px-${encodeURIComponent(normalized)}`;
}

/**
 * Simple hash for Wikimedia Commons path construction
 * Actually, Wikimedia uses MD5. Let's use the proper approach instead.
 */
function cyrb53Hash(_str: string): number {
  // We don't actually need this - let's use the Wikimedia API instead
  return 0;
}

/**
 * Better approach: Use Wikimedia REST API to get the actual image URL
 */
async function getCommonsImageUrl(filename: string, width: number): Promise<string | null> {
  const normalized = filename.replace(/ /g, "_");
  const url = `https://en.wikipedia.org/w/api.php?action=query&titles=File:${encodeURIComponent(normalized)}&prop=imageinfo&iiprop=url&iiurlwidth=${width}&format=json`;
  const res = await fetchWithRetry(url, {
    headers: { "User-Agent": MB_USER_AGENT },
  });
  if (!res.ok) return null;
  const data = await res.json();
  const pages = data.query?.pages;
  if (!pages) return null;
  const page = Object.values(pages)[0] as any;
  return page?.imageinfo?.[0]?.thumburl || page?.imageinfo?.[0]?.url || null;
}

/**
 * Updated Step 3: Query Wikidata for image, then resolve via Wikipedia API
 */
async function getArtistImageUrl(wikidataId: string, width = 600): Promise<string | null> {
  const url = `https://www.wikidata.org/wiki/Special:EntityData/${wikidataId}.json`;
  const res = await fetchWithRetry(url);
  if (!res.ok) return null;
  const data = await res.json();

  const entity = data.entities?.[wikidataId];
  const imageClaim = entity?.claims?.P18;
  if (!imageClaim || imageClaim.length === 0) return null;

  const filename = imageClaim[0]?.mainsnak?.datavalue?.value;
  if (!filename) return null;

  return getCommonsImageUrl(filename, width);
}

// ── Main handler ─────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Auth is optional — companion page may call without a session
  try {
    const { artist, width } = await req.json();

    if (!artist) {
      return new Response(
        JSON.stringify({ error: "artist name is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const imgWidth = width || 600;

    // Tier 1: Spotify (fastest, most reliable for artist photos)
    const spotifyUrl = await spotifyArtistImage(artist);
    if (spotifyUrl) {
      console.log(`[artist-image] ✓ Spotify: "${artist}"`);
      return new Response(
        JSON.stringify({ imageUrl: spotifyUrl, source: "spotify" }),
        {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
            "Cache-Control": "public, max-age=86400",
          },
        }
      );
    }

    // Tier 2: MusicBrainz → Wikidata → Wikimedia Commons
    const mbid = await searchArtist(artist);
    if (!mbid) {
      return new Response(
        JSON.stringify({ imageUrl: null, reason: "Artist not found on MusicBrainz or Spotify" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // MusicBrainz rate limit: 1 req/sec
    await new Promise((r) => setTimeout(r, 1100));

    const wikidataId = await getWikidataId(mbid);
    if (!wikidataId) {
      return new Response(
        JSON.stringify({ imageUrl: null, mbid, reason: "No Wikidata link found" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const imageUrl = await getArtistImageUrl(wikidataId, imgWidth);

    return new Response(
      JSON.stringify({ imageUrl, mbid, wikidataId, source: "wikimedia" }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
          "Cache-Control": "public, max-age=86400",
        },
      }
    );
  } catch (e) {
    console.warn("artist-image soft-fail:", e instanceof Error ? e.message : e);
    return new Response(
      JSON.stringify({ imageUrl: null, reason: "upstream error" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
