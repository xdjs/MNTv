import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getSpotifyAppToken, clearSpotifyAppToken } from "../_shared/spotify-token.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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

    let token = await getSpotifyAppToken();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    let res = await fetch(`https://api.spotify.com/v1/albums/${albumId}?market=${safeMarket}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    // Retry once on 401 (stale token in shared cache)
    if (res.status === 401) {
      clearSpotifyAppToken();
      token = await getSpotifyAppToken();
      res = await fetch(`https://api.spotify.com/v1/albums/${albumId}?market=${safeMarket}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
    }

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
      tracks: (album.tracks?.items || []).map((t: { name: string; artists?: { name: string }[]; uri?: string; duration_ms?: number; track_number?: number }) => ({
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
