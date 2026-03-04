import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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
    const { action, accessToken, code, codeVerifier, redirectUri } = await req.json();

    // ── Action: get Spotify client config (client ID is public) ──
    if (action === "config") {
      const clientId = Deno.env.get("SPOTIFY_CLIENT_ID");
      if (!clientId) throw new Error("SPOTIFY_CLIENT_ID not configured");
      return new Response(JSON.stringify({ clientId }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Action: exchange PKCE code for access token ──────────────
    if (action === "exchange") {
      if (!code || !codeVerifier || !redirectUri) {
        return new Response(JSON.stringify({ error: "code, codeVerifier, redirectUri required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const clientId = Deno.env.get("SPOTIFY_CLIENT_ID");
      if (!clientId) throw new Error("SPOTIFY_CLIENT_ID not configured");

      const tokenRes = await fetch("https://accounts.spotify.com/api/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          redirect_uri: redirectUri,
          client_id: clientId,
          code_verifier: codeVerifier,
        }),
      });

      if (!tokenRes.ok) {
        const err = await tokenRes.text();
        console.error("Spotify token exchange failed:", err);
        throw new Error(`Token exchange failed: ${tokenRes.status}`);
      }

      const tokenData = await tokenRes.json();
      return new Response(JSON.stringify(tokenData), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Action: fetch taste profile (top artists + tracks) ───────
    if (action === "taste") {
      if (!accessToken) {
        return new Response(JSON.stringify({ error: "accessToken required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const authHeader = { Authorization: `Bearer ${accessToken}` };

      // Fetch top artists (medium term = ~6 months) and short term (last 4 weeks)
      // Also fetch top tracks for extra signal
      const [artistsMedium, artistsShort, tracksMedium] = await Promise.all([
        fetch("https://api.spotify.com/v1/me/top/artists?limit=20&time_range=medium_term", { headers: authHeader }),
        fetch("https://api.spotify.com/v1/me/top/artists?limit=10&time_range=short_term", { headers: authHeader }),
        fetch("https://api.spotify.com/v1/me/top/tracks?limit=20&time_range=medium_term", { headers: authHeader }),
      ]);

      if (!artistsMedium.ok || !tracksMedium.ok) {
        const err = await artistsMedium.text();
        console.error("Spotify API error:", err);
        throw new Error(`Spotify API error: ${artistsMedium.status}`);
      }

      const [artistsMediumData, artistsShortData, tracksData] = await Promise.all([
        artistsMedium.json(),
        artistsShort.ok ? artistsShort.json() : { items: [] },
        tracksMedium.json(),
      ]);

      // Merge and deduplicate artists, prioritising short-term (most recent) at top
      const shortTermNames = new Set((artistsShortData.items || []).map((a: any) => a.name));
      const allArtists: string[] = [];

      // Short-term first (most recent taste)
      for (const a of artistsShortData.items || []) {
        allArtists.push(a.name);
      }
      // Medium-term — add those not already in list
      for (const a of artistsMediumData.items || []) {
        if (!shortTermNames.has(a.name)) allArtists.push(a.name);
      }

      const topArtists = [...new Set(allArtists)].slice(0, 20);
      const topTracks = (tracksData.items || []).map((t: any) => `${t.name} — ${t.artists?.[0]?.name || ""}`).slice(0, 15);

      // Also get user's display name
      const profileRes = await fetch("https://api.spotify.com/v1/me", { headers: authHeader });
      const profileData = profileRes.ok ? await profileRes.json() : {};

      return new Response(
        JSON.stringify({
          topArtists,
          topTracks,
          displayName: profileData.display_name || null,
          country: profileData.country || null,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("spotify-taste error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
