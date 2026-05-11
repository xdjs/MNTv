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

    // Parallel: top artists (short ~4wk × 2 windows for round-robin
    // pool depth), top tracks (short_term — Pete 2026-05-10: "lets do
    // short term so the rail reflects what the user has been on
    // lately"), liked songs (Liked Songs sorted by added_at desc), and
    // the user's profile. Limits sized to what Browse renders:
    //   - 3 artists per session in "Your artists, lately" with
    //     round-robin across the top-10 pool, so we need ≥10 artists
    //   - Liked tracks fuel the Stories rail with cascade window
    //     (15d → 30d → 60d → 365d → fall back to topTracks)
    //   - Top tracks remain the fallback when liked is empty
    const [artistsShortRes, artistsMediumRes, tracksShortRes, likedRes, profileRes] = await Promise.all([
      fetch("https://api.spotify.com/v1/me/top/artists?limit=10&time_range=short_term", { headers: authHeader }),
      // Backstop: medium_term fills out the artist pool when short_term
      // returns < 10 (newer accounts don't have 4-week play history).
      fetch("https://api.spotify.com/v1/me/top/artists?limit=10&time_range=medium_term", { headers: authHeader }),
      fetch("https://api.spotify.com/v1/me/top/tracks?limit=20&time_range=short_term", { headers: authHeader }),
      // Liked Songs — sorted by added_at desc by Spotify's default. We
      // request 50 to give the cascade window plenty to chew through
      // before falling back to topTracks. Requires user-library-read
      // scope (added 2026-05-10 in useSpotifyAuth.ts).
      fetch("https://api.spotify.com/v1/me/tracks?limit=50", { headers: authHeader }),
      fetch("https://api.spotify.com/v1/me", { headers: authHeader }),
    ]);

    // Use short_term as the primary signal; medium_term is a backstop
    // for newer accounts. We tolerate medium failure (just an empty
    // pool) but bail if BOTH short and medium fail — that means the
    // token is broken.
    if (!artistsShortRes.ok && !artistsMediumRes.ok) {
      const body = await artistsShortRes.text().catch(() => "<unreadable>");
      console.error(
        `[spotify-taste] /me/top/artists failed (both short & medium): status=${artistsShortRes.status} body=${body.slice(0, 500)}`,
      );
      return new Response(
        JSON.stringify({
          error: "Spotify API error",
          spotifyStatus: artistsShortRes.status,
          spotifyBody: body.slice(0, 500),
        }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const [artistsShort, artistsMedium, tracksData, likedData, profileData] = await Promise.all([
      artistsShortRes.ok ? artistsShortRes.json() : { items: [] },
      artistsMediumRes.ok ? artistsMediumRes.json() : { items: [] },
      tracksShortRes.ok ? tracksShortRes.json() : { items: [] },
      likedRes.ok ? likedRes.json() : { items: [] },
      profileRes.ok ? profileRes.json() : {},
    ]);

    // If liked-songs failed because the scope wasn't granted (403) or
    // any other reason, log and continue with empty likedData. The rail
    // falls back to topTracks downstream.
    if (!likedRes.ok) {
      const body = await likedRes.text().catch(() => "<unreadable>");
      console.warn(
        `[spotify-taste] /me/tracks (liked songs) failed: status=${likedRes.status} body=${body.slice(0, 200)} — falling back to top tracks`,
      );
    }

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

    // Cap at 8 artists: first 3 drive the Browse artist-row, remaining
    // 5 seed Last.fm similar-artist recommendations. More than 8 seeds
    // doesn't meaningfully improve recommendation quality.
    const topArtists = [...new Set(allArtists)].slice(0, 8);

    // Build artist images object: { "Artist Name": "https://..." }
    const artistImages: Record<string, string> = {};
    for (const name of topArtists) {
      if (artistImageMap[name]) artistImages[name] = artistImageMap[name];
    }

    // Tracks with album art, URIs, and collaborator structure.
    //   artist: primary (first) artist — used for cache keys + the
    //           server's primary research target. Stable, matches
    //           Spotify's "main" artist for that release.
    //   collaborators: every other artist on the track. Server uses
    //           this to anchor sparse-artist nuggets in the
    //           collaborator's verifiable info (Pete 2026-05-08:
    //           "Pete Rango is a collaborator on this track and there's
    //           plenty of information on Pete Rango so no need to
    //           hallucinate"). Display: rail shows "Ty Symph, Pete
    //           Rango" by joining `artist + collaborators`.
    const topTracks = (tracksData.items || []).slice(0, 15).map((t: any) => {
      const names = Array.isArray(t.artists)
        ? t.artists.map((a: { name?: string }) => a?.name).filter(Boolean)
        : [];
      const primary = names[0] || "";
      const collaborators = names.slice(1);
      return {
        title: t.name as string,
        artist: primary,
        collaborators,
        imageUrl: t.album?.images?.find((i: any) => i.width && i.width <= 320)?.url
          || t.album?.images?.[0]?.url || "",
        uri: t.uri || "",
      };
    });

    // Liked Songs (Saved Tracks) — Spotify returns each item as
    // `{ added_at, track }`. We carry `addedAt` so the client can
    // window the cascade (15d → 30d → 60d → 365d → fall back to
    // topTracks). Same { artist, collaborators } shape as topTracks
    // so downstream code can treat them interchangeably.
    const likedTracks = (likedData.items || []).map((item: any) => {
      const t = item.track || {};
      const names = Array.isArray(t.artists)
        ? t.artists.map((a: { name?: string }) => a?.name).filter(Boolean)
        : [];
      const primary = names[0] || "";
      const collaborators = names.slice(1);
      return {
        title: t.name as string,
        artist: primary,
        collaborators,
        imageUrl: t.album?.images?.find((i: any) => i.width && i.width <= 320)?.url
          || t.album?.images?.[0]?.url || "",
        uri: t.uri || "",
        addedAt: typeof item.added_at === "string" ? item.added_at : null,
      };
    }).filter((t: { uri: string; title: string }) => t.uri && t.title);

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
        likedTracks,
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
