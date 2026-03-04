import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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
  const { data, error } = await supabase.auth.getClaims(token);
  if (error || !data?.claims) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  return { userId: data.claims.sub as string };
}

const LASTFM_BASE = "https://ws.audioscrobbler.com/2.0/";

async function getSimilarArtists(
  artistName: string,
  apiKey: string,
  limit = 5
): Promise<{ name: string; imageUrl: string; tags: string[] }[]> {
  const url = new URL(LASTFM_BASE);
  url.searchParams.set("method", "artist.getSimilar");
  url.searchParams.set("artist", artistName);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("autocorrect", "1");

  const res = await fetch(url.toString());
  if (!res.ok) return [];
  const data = await res.json();

  const artists = data?.similarartists?.artist || [];
  return artists.map((a: any) => {
    // Last.fm image array — pick the "extralarge" or largest available
    const images: { "#text": string; size: string }[] = a.image || [];
    const img =
      images.find((i) => i.size === "extralarge")?.["#text"] ||
      images.find((i) => i.size === "large")?.["#text"] ||
      images.find((i) => i["#text"])?.["#text"] ||
      "";
    return {
      name: a.name,
      imageUrl: img && !img.includes("2a96cbd8b46e442fc41c2b86b821562f")
        ? img
        : `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(a.name)}&backgroundColor=1a1a2e&textColor=ffffff&fontSize=38`,
      tags: [],
    };
  });
}

async function getArtistTags(artistName: string, apiKey: string): Promise<string[]> {
  const url = new URL(LASTFM_BASE);
  url.searchParams.set("method", "artist.getTopTags");
  url.searchParams.set("artist", artistName);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("format", "json");
  url.searchParams.set("autocorrect", "1");

  const res = await fetch(url.toString());
  if (!res.ok) return [];
  const data = await res.json();
  return (data?.toptags?.tag || [])
    .slice(0, 2)
    .map((t: any) => t.name as string);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;

  try {
    const { topArtists } = await req.json() as { topArtists: string[] };

    if (!topArtists?.length) {
      return new Response(
        JSON.stringify({ recommendations: [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LASTFM_API_KEY = Deno.env.get("LASTFM_API_KEY");
    if (!LASTFM_API_KEY) {
      return new Response(
        JSON.stringify({ error: "LASTFM_API_KEY not configured" }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get similar artists for up to 5 of the user's top artists (in parallel)
    const seedArtists = topArtists.slice(0, 5);
    const similarResults = await Promise.allSettled(
      seedArtists.map((name) => getSimilarArtists(name, LASTFM_API_KEY, 6))
    );

    // Merge and deduplicate, excluding artists already in the user's list
    const topArtistSet = new Set(topArtists.map((n) => n.toLowerCase()));
    const seen = new Set<string>();
    const merged: { name: string; imageUrl: string; tags: string[] }[] = [];

    for (const result of similarResults) {
      if (result.status !== "fulfilled") continue;
      for (const artist of result.value) {
        const key = artist.name.toLowerCase();
        if (topArtistSet.has(key) || seen.has(key)) continue;
        seen.add(key);
        merged.push(artist);
        if (merged.length >= 20) break;
      }
      if (merged.length >= 20) break;
    }

    // Enrich with genre tags in parallel (first 10 artists)
    await Promise.allSettled(
      merged.slice(0, 10).map(async (artist) => {
        artist.tags = await getArtistTags(artist.name, LASTFM_API_KEY);
      })
    );

    return new Response(
      JSON.stringify({ recommendations: merged }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("lastfm-recommendations error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
