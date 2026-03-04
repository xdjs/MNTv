import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Fetches the user's top artists + tracks from Spotify given a valid access token.
// Called by the frontend after it completes the PKCE flow client-side.
// Results are stored in UserProfile and later injected into the RAG prompt in generate-companion.

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  {
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
  }

  try {
    const { accessToken } = await req.json();

    if (
      !accessToken ||
      typeof accessToken !== "string" ||
      accessToken.length < 10 ||
      accessToken.length > 2048 ||
      !/^[A-Za-z0-9\-_=+/.]+$/.test(accessToken)
    ) {
      return new Response(JSON.stringify({ error: "Invalid accessToken" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authHeader = { Authorization: `Bearer ${accessToken}` };

    // Parallel: top artists (medium ~6mo + short ~4wk) and top tracks
    const [artistsMediumRes, artistsShortRes, tracksMediumRes, profileRes] = await Promise.all([
      fetch("https://api.spotify.com/v1/me/top/artists?limit=20&time_range=medium_term", { headers: authHeader }),
      fetch("https://api.spotify.com/v1/me/top/artists?limit=10&time_range=short_term", { headers: authHeader }),
      fetch("https://api.spotify.com/v1/me/top/tracks?limit=20&time_range=medium_term", { headers: authHeader }),
      fetch("https://api.spotify.com/v1/me", { headers: authHeader }),
    ]);

    if (!artistsMediumRes.ok) {
      throw new Error(`Spotify API error: ${artistsMediumRes.status}`);
    }

    const [artistsMedium, artistsShort, tracksData, profileData] = await Promise.all([
      artistsMediumRes.json(),
      artistsShortRes.ok ? artistsShortRes.json() : { items: [] },
      tracksMediumRes.ok ? tracksMediumRes.json() : { items: [] },
      profileRes.ok ? profileRes.json() : {},
    ]);

    // Merge artists — short-term (most recent taste) first, then fill from medium-term
    const shortTermNames = new Set((artistsShort.items || []).map((a: any) => a.name as string));
    const allArtists: string[] = [
      ...(artistsShort.items || []).map((a: any) => a.name as string),
      ...(artistsMedium.items || [])
        .filter((a: any) => !shortTermNames.has(a.name))
        .map((a: any) => a.name as string),
    ];

    const topArtists = [...new Set(allArtists)].slice(0, 20);
    const topTracks = (tracksData.items || [])
      .map((t: any) => `${t.name} — ${t.artists?.[0]?.name || ""}`)
      .slice(0, 15) as string[];

    return new Response(
      JSON.stringify({
        topArtists,
        topTracks,
        displayName: profileData.display_name || null,
        country: profileData.country || null,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("spotify-taste error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
