import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// In-memory cache for the Client Credentials app token
let cachedToken: string | null = null;
let tokenExpiresAt = 0;

async function getAppToken(): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiresAt) return cachedToken;

  const clientId = Deno.env.get("VITE_SPOTIFY_CLIENT_ID");
  const clientSecret = Deno.env.get("SPOTIFY_CLIENT_SECRET");
  if (!clientId || !clientSecret) {
    throw new Error("Missing Spotify credentials");
  }

  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
    },
    body: "grant_type=client_credentials",
  });

  if (!res.ok) {
    throw new Error(`Spotify token request failed: ${res.status}`);
  }

  const data = await res.json();
  cachedToken = data.access_token;
  // Expire 5 minutes early to avoid edge cases
  tokenExpiresAt = Date.now() + (data.expires_in - 300) * 1000;
  return cachedToken!;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { query, artist, title } = await req.json();
    if ((!query && !title) || (query && typeof query !== "string")) {
      return new Response(
        JSON.stringify({ artists: [], tracks: [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = await getAppToken();

    // Build a precise query using Spotify's field filters when artist+title are provided
    let q: string;
    if (artist && title) {
      // Use Spotify's search field filters for precise matching
      q = encodeURIComponent(`artist:${artist} track:${title}`);
    } else {
      q = encodeURIComponent((query || "").trim());
    }
    const url = `https://api.spotify.com/v1/search?type=artist,track&limit=20&q=${q}`;

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      // If token expired mid-flight, clear cache and retry once
      if (res.status === 401) {
        cachedToken = null;
        tokenExpiresAt = 0;
        const retryToken = await getAppToken();
        const retryRes = await fetch(url, {
          headers: { Authorization: `Bearer ${retryToken}` },
        });
        if (!retryRes.ok) throw new Error(`Spotify search failed: ${retryRes.status}`);
        const retryData = await retryRes.json();
        return new Response(JSON.stringify(normalize(retryData)), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`Spotify search failed: ${res.status}`);
    }

    const data = await res.json();
    return new Response(JSON.stringify(normalize(data)), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("spotify-search error:", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function normalize(data: any) {
  const artists = (data.artists?.items || [])
    .filter((a: any) => !a.name?.toLowerCase().includes(" - topic"))
    .map((a: any) => ({
      id: a.id || "",
      name: a.name,
      imageUrl: a.images?.[0]?.url || a.images?.[1]?.url || "",
    }));

  const tracks = (data.tracks?.items || [])
    .filter((t: any) => !t.artists?.[0]?.name?.toLowerCase().includes(" - topic"))
    .map((t: any) => ({
      title: t.name,
      artist: t.artists?.[0]?.name || "Unknown",
      album: t.album?.name || "",
      imageUrl: t.album?.images?.[0]?.url || t.album?.images?.[1]?.url || "",
      uri: t.uri || "",
    }));

  return { artists, tracks };
}
