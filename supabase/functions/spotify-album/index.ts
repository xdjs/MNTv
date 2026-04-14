import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getSpotifyAppToken, clearSpotifyAppToken } from "../_shared/spotify-token.ts";
import { getAppleDeveloperToken } from "../_shared/apple-token.ts";
import {
  appleGet,
  buildAppleSongUri,
  isAppleService,
  isValidAppleCatalogId,
  resolveArtworkUrl,
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
    // Verify request comes through Supabase gateway (apikey header required)
    const apikey = req.headers.get("apikey");
    if (!apikey) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { albumId, market, service, storefront: rawStorefront } = await req.json();

    if (isAppleService(service)) {
      // Await so a rejection from handleAppleAlbum flows through the
      // outer try/catch. Returning the Promise unawaited would escape
      // to Deno's default error handler instead of the custom JSON 500.
      return await handleAppleAlbum({ albumId, storefront: rawStorefront });
    }

    // ── Spotify path (default) ───────────────────────────────────────
    if (!albumId || typeof albumId !== "string" || !/^[a-zA-Z0-9]{20,25}$/.test(albumId)) {
      return new Response(
        JSON.stringify({ error: "albumId required (22-char Spotify ID)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
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
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      return new Response(
        JSON.stringify({ error: `Spotify API error: ${res.status}` }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
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
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

// ── Apple Music path ────────────────────────────────────────────────────

interface AppleAlbumDetailResponse {
  data?: Array<{
    id?: string;
    attributes?: {
      name?: string;
      artistName?: string;
      artwork?: { url?: string };
      releaseDate?: string;
      isSingle?: boolean;
      trackCount?: number;
      genreNames?: string[];
      recordLabel?: string;
    };
    relationships?: {
      artists?: {
        data?: Array<{ id?: string; attributes?: { name?: string } }>;
      };
      tracks?: {
        data?: Array<{
          id?: string;
          attributes?: {
            name?: string;
            artistName?: string;
            albumName?: string;
            artwork?: { url?: string };
            durationInMillis?: number;
            trackNumber?: number;
          };
        }>;
      };
    };
  }>;
}

async function handleAppleAlbum(args: {
  albumId?: string;
  storefront?: string;
}): Promise<Response> {
  const { albumId, storefront: rawStorefront } = args;

  if (!isValidAppleCatalogId(albumId)) {
    return new Response(
      JSON.stringify({ error: "albumId required (numeric Apple Music catalog ID)" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const storefront = safeStorefront(rawStorefront);
  const devToken = await getAppleDeveloperToken();

  // Explicitly request the `tracks` and `artists` relationships instead
  // of relying on Apple's undocumented default behavior. A silent default
  // change would leave this endpoint returning empty tracks / empty
  // artist data without a shape break — much harder to detect.
  //
  // `limit[tracks]=300` is a cheap first-pass mitigation for long albums
  // (compilations, boxsets, DJ mixes). 300 covers every album in the
  // Apple catalog today; full pagination via the `next` cursor would be
  // the proper fix and is tracked as a follow-up.
  const data = await appleGet<AppleAlbumDetailResponse>(
    `/catalog/${storefront}/albums/${albumId}?include=tracks,artists&limit[tracks]=300`,
    devToken,
  );

  const album = data?.data?.[0];
  if (!album) {
    return new Response(
      JSON.stringify({ found: false }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const a = album.attributes || {};
  const coverUrl = resolveArtworkUrl(a.artwork);
  const artistRel = album.relationships?.artists?.data?.[0];
  const artistName = artistRel?.attributes?.name || a.artistName || "";

  const rawTracks = album.relationships?.tracks?.data || [];
  const tracks = rawTracks.map((t) => {
    const ta = t.attributes || {};
    return {
      title: ta.name || "",
      artist: ta.artistName || artistName,
      album: ta.albumName || a.name || "",
      imageUrl: resolveArtworkUrl(ta.artwork) || coverUrl,
      uri: buildAppleSongUri(t.id),
      durationMs: ta.durationInMillis || 0,
      trackNumber: ta.trackNumber || 0,
    };
  });

  const result = {
    found: true,
    album: {
      id: album.id || "",
      name: a.name || "",
      imageUrl: coverUrl,
      releaseDate: a.releaseDate || "",
      albumType: a.isSingle ? "single" : "album",
      totalTracks: a.trackCount || tracks.length,
      artist: {
        id: artistRel?.id || "",
        name: artistName,
      },
      genres: a.genreNames || [],
      label: a.recordLabel || "",
    },
    tracks,
  };

  return new Response(JSON.stringify(result), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
