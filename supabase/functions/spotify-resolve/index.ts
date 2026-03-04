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
    const { artists } = await req.json();
    if (!Array.isArray(artists) || artists.length === 0) {
      return new Response(
        JSON.stringify({ resolved: {} }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = await getAppToken();
    const batch = artists.slice(0, 20);

    const results = await Promise.allSettled(
      batch.map(async (name: string) => {
        const q = encodeURIComponent(name.trim());
        const res = await fetch(
          `https://api.spotify.com/v1/search?type=artist&limit=1&q=${q}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (!res.ok) return { name, id: null, imageUrl: null };
        const data = await res.json();
        const artist = data.artists?.items?.[0];
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
