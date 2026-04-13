import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getSpotifyAppToken, clearSpotifyAppToken } from "../_shared/spotify-token.ts";
import { getAppleDeveloperToken } from "../_shared/apple-token.ts";
import {
  appleGet,
  normalizeAppleArtistCompact,
  normalizeAppleTrack,
  safeStorefront,
} from "../_shared/apple-utils.ts";

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
    const { query, artist, title, recommend, service, storefront: rawStorefront } = await req.json();
    const isApple = service === "apple" || service === "apple-music";

    if (isApple) {
      return handleAppleSearch({ query, artist, title, recommend, storefront: rawStorefront });
    }

    // ── Spotify path (default) ───────────────────────────────────────
    const token = await getSpotifyAppToken();

    // ── Recommendations mode: seed by track ID ──────────────────────
    if (recommend) {
      // Accept a Spotify URI (spotify:track:ABC) or bare track ID
      const trackId = recommend.replace("spotify:track:", "");
      const url = `https://api.spotify.com/v1/recommendations?seed_tracks=${encodeURIComponent(trackId)}&limit=20`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        if (res.status === 401) {
          clearSpotifyAppToken();
          const retryToken = await getSpotifyAppToken();
          const retryRes = await fetch(url, { headers: { Authorization: `Bearer ${retryToken}` } });
          if (!retryRes.ok) throw new Error(`Spotify recommendations failed: ${retryRes.status}`);
          const retryData = await retryRes.json();
          return new Response(JSON.stringify({ tracks: normalizeRecommendations(retryData) }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        throw new Error(`Spotify recommendations failed: ${res.status}`);
      }
      const data = await res.json();
      return new Response(JSON.stringify({ tracks: normalizeRecommendations(data) }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Search mode ─────────────────────────────────────────────────
    if ((!query && !title) || (query && typeof query !== "string")) {
      return new Response(
        JSON.stringify({ artists: [], tracks: [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Build a precise query using Spotify's field filters when artist+title are provided
    let q: string;
    if (artist && title) {
      q = encodeURIComponent(`artist:${artist} track:${title}`);
    } else {
      q = encodeURIComponent((query || "").trim());
    }
    const url = `https://api.spotify.com/v1/search?type=artist,track&limit=20&q=${q}`;

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      if (res.status === 401) {
        clearSpotifyAppToken();
        const retryToken = await getSpotifyAppToken();
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
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

// ── Apple Music path ────────────────────────────────────────────────────

async function handleAppleSearch(args: {
  query?: string;
  artist?: string;
  title?: string;
  recommend?: string;
  storefront?: string;
}): Promise<Response> {
  const { query, artist, title, recommend, storefront: rawStorefront } = args;
  const storefront = safeStorefront(rawStorefront);
  const devToken = await getAppleDeveloperToken();

  // Apple Music has no seed-based recommendations endpoint. Return an empty
  // tracks array — clients are expected to fall back to Last.fm similar
  // tracks for recommendations when the active service is Apple Music.
  if (recommend) {
    return new Response(JSON.stringify({ tracks: [] }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if ((!query && !title) || (query && typeof query !== "string")) {
    return new Response(
      JSON.stringify({ artists: [], tracks: [] }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // Build the search term. Apple Music has no field filters, so for
  // precise {artist, title} lookups we concatenate them — the engine
  // handles that as well as most short free-form queries.
  let term: string;
  if (artist && title) term = `${artist} ${title}`;
  else term = (query || "").trim();

  const data = await appleGet<{
    results?: {
      artists?: {
        data?: Array<{ id?: string; attributes?: { name?: string; artwork?: { url?: string } } }>;
      };
      songs?: {
        data?: Array<{
          id?: string;
          attributes?: {
            name?: string;
            artistName?: string;
            albumName?: string;
            artwork?: { url?: string };
            durationInMillis?: number;
          };
        }>;
      };
    };
  }>(
    `/catalog/${storefront}/search?types=artists,songs&limit=20&term=${encodeURIComponent(term)}`,
    devToken,
  );

  const artistData = data?.results?.artists?.data || [];
  const songData = data?.results?.songs?.data || [];

  const artists = artistData.map((a) => normalizeAppleArtistCompact(a));
  const tracks = songData.map((s) => {
    const t = normalizeAppleTrack(s);
    // Search results don't include trackNumber; omit it to match Spotify search shape.
    const { trackNumber: _tn, ...rest } = t;
    return rest;
  });

  return new Response(JSON.stringify({ artists, tracks }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function normalizeRecommendations(data: any) {
  return (data.tracks || [])
    .filter((t: any) => !t.artists?.[0]?.name?.toLowerCase().includes(" - topic"))
    .map((t: any) => ({
      title: t.name,
      artist: t.artists?.[0]?.name || "Unknown",
      album: t.album?.name || "",
      imageUrl: t.album?.images?.[0]?.url || t.album?.images?.[1]?.url || "",
      uri: t.uri || "",
    }));
}

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
