import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MB_USER_AGENT = "MusicNerd/1.0 (musicnerd-app)";

// ── Auth helper ───────────────────────────────────────────────────────
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

// ── Artist pipeline: MusicBrainz → Wikidata → Wikimedia Commons ─────

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

async function resolveArtist(query: string, width: number): Promise<string | null> {
  const mbid = await searchArtist(query);
  if (!mbid) return null;
  await new Promise((r) => setTimeout(r, 1100));
  const wikidataId = await getWikidataId(mbid);
  if (!wikidataId) return null;
  return getArtistImageUrl(wikidataId, width);
}

// ── Album pipeline: MusicBrainz → Cover Art Archive ─────────────────

async function resolveAlbum(query: string): Promise<string | null> {
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
  } catch {
    // CAA can be flaky
  }
  return null;
}

// ── Wiki pipeline: Wikimedia Commons search ─────────────────────────

async function resolveWiki(query: string, width: number): Promise<string | null> {
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

// ── Main handler ────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;

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
