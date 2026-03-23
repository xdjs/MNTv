import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

let cachedToken: string | null = null;
let tokenExpiresAt = 0;

async function getAppToken(): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiresAt) return cachedToken;

  const clientId = Deno.env.get("VITE_SPOTIFY_CLIENT_ID");
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
    const { albumId } = await req.json();
    if (!albumId || typeof albumId !== "string") {
      return new Response(
        JSON.stringify({ error: "albumId required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = await getAppToken();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(`https://api.spotify.com/v1/albums/${albumId}?market=US`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      return new Response(
        JSON.stringify({ found: false }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
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
