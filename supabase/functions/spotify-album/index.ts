import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// In-memory token cache. Concurrent cold-start requests may both fetch a token;
// the second write clobbers the first harmlessly (both tokens are valid).
let cachedToken: string | null = null;
let tokenExpiresAt = 0;

async function getAppToken(): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiresAt) return cachedToken;

  const clientId = Deno.env.get("SPOTIFY_CLIENT_ID");
  const clientSecret = Deno.env.get("SPOTIFY_CLIENT_SECRET");
  if (!clientId || !clientSecret) throw new Error("Missing Spotify credentials");

  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
    },
    body: "grant_type=client_credentials",
  });

  if (!res.ok) throw new Error(`Spotify token request failed: ${res.status}`);

  const data = await res.json();
  cachedToken = data.access_token;
  tokenExpiresAt = Date.now() + (data.expires_in - 300) * 1000;
  return cachedToken!;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify request comes through Supabase gateway (apikey header required)
    const apikey = req.headers.get("apikey");
    if (!apikey) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { albumId, market } = await req.json();
    if (!albumId || typeof albumId !== "string" || !/^[a-zA-Z0-9]{20,25}$/.test(albumId)) {
      return new Response(
        JSON.stringify({ error: "albumId required (22-char Spotify ID)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const safeMarket = (typeof market === "string" && /^[A-Z]{2}$/.test(market)) ? market : "US";

    const token = await getAppToken();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(`https://api.spotify.com/v1/albums/${albumId}?market=${safeMarket}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      console.error(`[spotify-album] Spotify API error: ${res.status} for albumId=${albumId}`);
      if (res.status === 404) {
        return new Response(
          JSON.stringify({ found: false }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      return new Response(
        JSON.stringify({ error: `Spotify API error: ${res.status}` }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const album = await res.json();

    const result = {
      found: true,
      album: {
        id: album.id,
        name: album.name,
        imageUrl: album.images?.[0]?.url || album.images?.[1]?.url || "",
        releaseDate: album.release_date || "",
        albumType: album.album_type || "album",
        totalTracks: album.total_tracks || 0,
        artist: {
          id: album.artists?.[0]?.id || "",
          name: album.artists?.[0]?.name || "",
        },
        genres: album.genres || [],
        label: album.label || "",
      },
      tracks: (album.tracks?.items || []).map((t: any) => ({
        title: t.name,
        artist: t.artists?.[0]?.name || album.artists?.[0]?.name || "",
        album: album.name,
        imageUrl: album.images?.[0]?.url || album.images?.[1]?.url || "",
        uri: t.uri || "",
        durationMs: t.duration_ms || 0,
        trackNumber: t.track_number || 0,
      })),
    };

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("spotify-album error:", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
