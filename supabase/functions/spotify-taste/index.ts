import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Fetches the user's top artists + tracks from Spotify given a valid access token.
// Called by the frontend after it completes the PKCE flow client-side.
// The Spotify access token in the request body is the real credential — invalid tokens
// fail at the Spotify API. No Supabase auth required.

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
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

    // Build artist map: name → best image URL, and name → Spotify ID
    const artistImageMap: Record<string, string> = {};
    const artistIdMap: Record<string, string> = {};
    const pickImage = (a: any) => {
      const imgs = a.images as { url: string; width: number }[] | undefined;
      // Prefer ~300px image, fall back to first available
      return imgs?.find((i) => i.width && i.width <= 320)?.url || imgs?.[0]?.url || "";
    };
    for (const a of [...(artistsShort.items || []), ...(artistsMedium.items || [])]) {
      if (!artistImageMap[a.name]) artistImageMap[a.name] = pickImage(a);
      if (!artistIdMap[a.name] && a.id) artistIdMap[a.name] = a.id;
    }

    // Merge artists — short-term (most recent taste) first, then fill from medium-term
    const shortTermNames = new Set((artistsShort.items || []).map((a: any) => a.name as string));
    const allArtists: string[] = [
      ...(artistsShort.items || []).map((a: any) => a.name as string),
      ...(artistsMedium.items || [])
        .filter((a: any) => !shortTermNames.has(a.name))
        .map((a: any) => a.name as string),
    ];

    const topArtists = [...new Set(allArtists)].slice(0, 20);

    // Build artist images object: { "Artist Name": "https://..." }
    const artistImages: Record<string, string> = {};
    for (const name of topArtists) {
      if (artistImageMap[name]) artistImages[name] = artistImageMap[name];
    }

    // Tracks with album art and URIs
    const topTracks = (tracksData.items || []).slice(0, 15).map((t: any) => ({
      title: t.name as string,
      artist: t.artists?.[0]?.name || "",
      imageUrl: t.album?.images?.find((i: any) => i.width && i.width <= 320)?.url
        || t.album?.images?.[0]?.url || "",
      uri: t.uri || "",
    }));

    // Flat track strings for backward compat
    const topTrackStrings = topTracks.map(
      (t: { title: string; artist: string }) => `${t.title} — ${t.artist}`
    );

    return new Response(
      JSON.stringify({
        topArtists,
        topTracks: topTrackStrings,
        artistImages,
        artistIds: artistIdMap,
        trackImages: topTracks,
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
