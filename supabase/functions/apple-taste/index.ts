import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getAppleDeveloperToken } from "../_shared/apple-token.ts";
import { appleGet, resolveArtworkUrl, safeStorefront } from "../_shared/apple-utils.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Fetches the user's Apple Music listening taste given a Music User Token.
// Called by the frontend after MusicKit.authorize() resolves.
//
// Apple Music API has no "top artists/tracks" endpoint, so we combine two
// sources and return a Spotify-taste-compatible shape with partial: true
// so the client knows the signal is softer:
//
//   - /me/history/heavy-rotation      — resources the user listens to often
//                                       (mostly albums; no explicit ranking)
//   - /me/recent/played/tracks?limit  — recent plays, frequency becomes the
//                                       signal we rank artists by
//
// Artists are weighted: +1 per recent play, +3 per heavy-rotation hit.

interface AppleSongResource {
  id?: string;
  type?: string;
  attributes?: {
    name?: string;
    artistName?: string;
    artwork?: { url?: string };
  };
}

interface AppleHistoryResource {
  id?: string;
  type?: string;
  attributes?: {
    name?: string;
    artistName?: string;
    artwork?: { url?: string };
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { musicUserToken, storefront: rawStorefront } = body ?? {};

    if (
      !musicUserToken ||
      typeof musicUserToken !== "string" ||
      musicUserToken.length < 10 ||
      musicUserToken.length > 4096
    ) {
      return new Response(JSON.stringify({ error: "Invalid musicUserToken" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const storefront = safeStorefront(rawStorefront);
    const devToken = await getAppleDeveloperToken();

    // Parallel: heavy-rotation resources + recent played tracks
    const [rotation, recent] = await Promise.all([
      appleGet<{ data?: AppleHistoryResource[] }>(
        "/me/history/heavy-rotation?limit=20",
        devToken,
        musicUserToken,
      ),
      appleGet<{ data?: AppleSongResource[] }>(
        "/me/recent/played/tracks?limit=50",
        devToken,
        musicUserToken,
      ),
    ]);

    const recentItems: AppleSongResource[] = recent?.data || [];
    const rotationItems: AppleHistoryResource[] = rotation?.data || [];

    // ── Rank artists by weighted frequency ─────────────────────────────
    const artistCounts: Record<string, number> = {};
    const artistImages: Record<string, string> = {};
    const artistIds: Record<string, string> = {};

    // Recent plays: +1 per occurrence
    for (const song of recentItems) {
      const name = song.attributes?.artistName;
      if (!name) continue;
      artistCounts[name] = (artistCounts[name] || 0) + 1;
      if (!artistImages[name]) {
        const art = resolveArtworkUrl(song.attributes?.artwork);
        if (art) artistImages[name] = art;
      }
    }

    // Heavy rotation: +3 per occurrence — ranks an artist higher than a
    // long tail of one-off plays would on their own. When the resource
    // itself is an artist (rare), capture its id directly.
    for (const item of rotationItems) {
      const name = item.attributes?.artistName || item.attributes?.name;
      if (!name) continue;
      artistCounts[name] = (artistCounts[name] || 0) + 3;
      if (!artistImages[name]) {
        const art = resolveArtworkUrl(item.attributes?.artwork);
        if (art) artistImages[name] = art;
      }
      if (item.type === "artists" && item.id && !artistIds[name]) {
        artistIds[name] = item.id;
      }
    }

    const topArtists = Object.entries(artistCounts)
      .sort(([, ac], [, bc]) => bc - ac)
      .map(([name]) => name)
      .slice(0, 20);

    // ── Build top tracks (unique titles, preserve recent order) ────────
    const seen = new Set<string>();
    const uniqueTracks: Array<{
      title: string;
      artist: string;
      imageUrl: string;
      uri: string;
    }> = [];

    for (const song of recentItems) {
      const title = song.attributes?.name;
      const artist = song.attributes?.artistName;
      if (!title || !artist) continue;
      const key = `${title}::${artist}`;
      if (seen.has(key)) continue;
      seen.add(key);
      uniqueTracks.push({
        title,
        artist,
        imageUrl: resolveArtworkUrl(song.attributes?.artwork),
        uri: song.id ? `apple:song:${song.id}` : "",
      });
      if (uniqueTracks.length >= 15) break;
    }

    const topTrackStrings = uniqueTracks.map((t) => `${t.title} — ${t.artist}`);

    return new Response(
      JSON.stringify({
        topArtists,
        topTracks: topTrackStrings,
        artistImages,
        artistIds,
        trackImages: uniqueTracks,
        displayName: null, // Apple exposes no user display name
        country: storefront.toUpperCase(),
        partial: true, // softer signal than Spotify's explicit top-artists endpoint
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("apple-taste error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
