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
    const { artists } = await req.json();
    if (!Array.isArray(artists) || artists.length === 0) {
      return new Response(
        JSON.stringify({ resolved: {} }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let token = await getSpotifyAppToken();
    const batch = artists.slice(0, 20);

    const results = await Promise.allSettled(
      batch.map(async (name: string) => {
        const q = encodeURIComponent(name.trim());
        let res = await fetch(
          `https://api.spotify.com/v1/search?type=artist&limit=5&q=${q}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        // Retry once on 401 (stale shared token cache)
        if (res.status === 401) {
          clearSpotifyAppToken();
          token = await getSpotifyAppToken();
          res = await fetch(
            `https://api.spotify.com/v1/search?type=artist&limit=5&q=${q}`,
            { headers: { Authorization: `Bearer ${token}` } }
          );
        }
        if (!res.ok) return { name, id: null, imageUrl: null };
        const data = await res.json();
        const candidates = data.artists?.items || [];
        const artist = candidates.find((a: any) => a.name.toLowerCase() === name.trim().toLowerCase())
              || candidates[0];
        if (!artist) return { name, id: null, imageUrl: null };
        return {
          name,
          id: artist.id as string,
          imageUrl: (artist.images?.[0]?.url || artist.images?.[1]?.url || "") as string,
        };
      })
    );

    const resolved: Record<string, { id: string; imageUrl: string }> = {};
    for (const r of results) {
      if (r.status === "fulfilled" && r.value.id) {
        resolved[r.value.name] = { id: r.value.id, imageUrl: r.value.imageUrl! };
      }
    }

    return new Response(
      JSON.stringify({ resolved }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("spotify-resolve error:", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
