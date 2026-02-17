import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const MB_USER_AGENT = "MusicNerd/1.0 (musicnerd-app)";

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

  try {
    const { artist, width } = await req.json();

    if (!artist) {
      return new Response(
        JSON.stringify({ error: "artist name is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const imgWidth = width || 600;

    // Step 1: Search MusicBrainz
    const mbid = await searchArtist(artist);
    if (!mbid) {
      return new Response(
        JSON.stringify({ imageUrl: null, reason: "Artist not found on MusicBrainz" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // MusicBrainz rate limit: 1 req/sec
    await new Promise((r) => setTimeout(r, 1100));

    // Step 2: Get Wikidata ID
    const wikidataId = await getWikidataId(mbid);
    if (!wikidataId) {
      return new Response(
        JSON.stringify({ imageUrl: null, mbid, reason: "No Wikidata link found" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Step 3: Get image URL from Wikidata → Wikimedia Commons
    const imageUrl = await getArtistImageUrl(wikidataId, imgWidth);

    return new Response(
      JSON.stringify({ imageUrl, mbid, wikidataId }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
          "Cache-Control": "public, max-age=86400", // Cache for 24h
        },
      }
    );
  } catch (e) {
    console.error("artist-image error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
