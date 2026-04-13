import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { CACHE_TTL_MS } from "../_shared/config.ts";
import { getSpotifyAppToken, clearSpotifyAppToken } from "../_shared/spotify-token.ts";
import { getAppleDeveloperToken } from "../_shared/apple-token.ts";
import {
  appleGet,
  isValidAppleCatalogId,
  normalizeAppleArtistCompact,
  normalizeAppleAlbumListItem,
  normalizeAppleTrack,
  resolveArtworkUrl,
  safeStorefront,
} from "../_shared/apple-utils.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function getSupabaseAdmin() {
  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  return createClient(url, key);
}

async function generateArtistBio(
  name: string,
  genres: string[],
  topTrackNames: string[],
  albumNames: string[],
): Promise<{ text: string; grounded: boolean }> {
  const apiKey = Deno.env.get("GOOGLE_AI_API_KEY");
  if (!apiKey) return { text: "", grounded: false };

  const genreStr = genres.length ? genres.join(", ") : "unknown genre";
  const trackStr = topTrackNames.slice(0, 5).join(", ") || "unknown";
  const albumStr = albumNames.slice(0, 5).join(", ") || "unknown";

  const prompt = `Write a concise, engaging 3-4 sentence biography of the musician/band "${name}".
Genre: ${genreStr}. Notable tracks: ${trackStr}. Albums: ${albumStr}.
Focus on specific facts: where they're from, when they formed/started, key career moments, and what makes them distinctive.
Be factual and vivid. No hedging ("is known for", "is considered"). No markdown. Plain text only.`;

  try {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    const baseBody = {
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.7, maxOutputTokens: 400, thinkingConfig: { thinkingBudget: 0 } },
    };

    const totalBudgetMs = 25_000;
    const startTime = Date.now();

    // First attempt: with Google Search grounding
    const controller1 = new AbortController();
    const timer1 = setTimeout(() => controller1.abort(), totalBudgetMs);
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...baseBody, tools: [{ google_search: {} }] }),
      signal: controller1.signal,
    });
    clearTimeout(timer1);
    if (!res.ok) return { text: "", grounded: false };
    const data = await res.json();

    const finishReason = data.candidates?.[0]?.finishReason;
    if (finishReason === "RECITATION") {
      // Retry without grounding — RECITATION means grounding triggered copyright filter
      console.warn(`[spotify-artist] RECITATION for "${name}", retrying without grounding`);
      const elapsed = Date.now() - startTime;
      const remaining = totalBudgetMs - elapsed;
      if (remaining < 3_000) {
        console.warn(`[spotify-artist] Only ${remaining}ms left after RECITATION — skipping retry`);
        return { text: "", grounded: false };
      }
      const controller2 = new AbortController();
      const timer2 = setTimeout(() => controller2.abort(), remaining);
      const retryRes = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(baseBody),
        signal: controller2.signal,
      });
      clearTimeout(timer2);
      if (!retryRes.ok) return { text: "", grounded: false };
      const retryData = await retryRes.json();
      return { text: retryData.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "", grounded: false };
    }

    return { text: data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "", grounded: true };
  } catch {
    return { text: "", grounded: false };
  }
}

async function spotifyGet(path: string, token: string) {
  let res = await fetch(`https://api.spotify.com/v1${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  // Retry once on 401 (stale token in shared cache)
  if (res.status === 401) {
    clearSpotifyAppToken();
    const freshToken = await getSpotifyAppToken();
    res = await fetch(`https://api.spotify.com/v1${path}`, {
      headers: { Authorization: `Bearer ${freshToken}` },
    });
  }
  if (!res.ok) return null;
  return res.json();
}

// ── Cross-service cache helpers ─────────────────────────────────────────

type ArtistCacheRow = { data: unknown; created_at: string };

function isFreshCacheRow(row: ArtistCacheRow | null | undefined): boolean {
  if (!row) return false;
  return Date.now() - new Date(row.created_at).getTime() < CACHE_TTL_MS;
}

function isValidArtistCachePayload(data: unknown): data is { artist: { bio?: string; bioGrounded?: boolean }; topTracks: unknown } {
  return !!data && typeof data === "object" && "artist" in data && "topTracks" in data;
}

/** Look up a cached artist bio by canonical name across services. Used
 *  when an Apple lookup misses the `(id, apple)` cache but the artist is
 *  already cached under Spotify (or vice-versa). AI bios are expensive —
 *  reuse across services whenever possible. */
async function findCrossServiceBio(
  db: ReturnType<typeof createClient>,
  canonicalName: string,
  excludeService: "spotify" | "apple",
): Promise<{ bio: string; grounded: boolean } | null> {
  if (!canonicalName) return null;
  const { data, error } = await db
    .from("artist_cache")
    .select("data, service")
    .eq("canonical_name", canonicalName)
    .neq("service", excludeService)
    .limit(1);
  if (error || !data || !data.length) return null;
  const row = data[0] as { data: unknown; service: string };
  const payload = row.data;
  if (!payload || typeof payload !== "object" || !("artist" in payload)) return null;
  const artist = (payload as { artist?: { bio?: string; bioGrounded?: boolean } }).artist;
  if (!artist?.bio) return null;
  return { bio: artist.bio, grounded: !!artist.bioGrounded };
}

// ── Main handler ────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { artistId: providedId, artistName, service, storefront: rawStorefront } = body;
    const isApple = service === "apple" || service === "apple-music";

    if (!providedId && (!artistName || typeof artistName !== "string")) {
      return new Response(
        JSON.stringify({ error: "artistId or artistName required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const db = getSupabaseAdmin();

    if (isApple) {
      return handleAppleArtist({
        db,
        providedId: typeof providedId === "string" ? providedId : undefined,
        artistName: typeof artistName === "string" ? artistName : undefined,
        storefront: rawStorefront,
      });
    }

    // ── Spotify path (default) ────────────────────────────────────────

    // Early cache check when we already have a Spotify ID — avoids Spotify API call entirely
    if (providedId && typeof providedId === "string") {
      const { data: cached } = await db
        .from("artist_cache")
        .select("data, created_at")
        .eq("artist_id", providedId)
        .eq("service", "spotify")
        .single();

      if (isFreshCacheRow(cached) && isValidArtistCachePayload(cached!.data)) {
        return new Response(JSON.stringify(cached!.data), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (cached && !isValidArtistCachePayload(cached.data)) {
        console.warn(`[spotify-artist] Malformed cache for ${providedId}, refetching`);
      }
    }

    const token = await getSpotifyAppToken();

    let artist: any;
    let artistId: string;

    if (providedId && typeof providedId === "string") {
      // Direct lookup by Spotify ID — no search ambiguity
      const directData = await spotifyGet(`/artists/${providedId}`, token);
      if (!directData) {
        return new Response(
          JSON.stringify({ found: false }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      artist = directData;
      artistId = directData.id;
    } else {
      // Fallback: search by name (backward compat for real:: URLs)
      const q = encodeURIComponent(artistName.trim());
      const searchData = await spotifyGet(`/search?type=artist&limit=5&q=${q}`, token);
      const candidates = searchData?.artists?.items || [];
      artist = candidates.find((a: any) => a.name.toLowerCase() === artistName.trim().toLowerCase())
        || candidates[0];

      if (!artist) {
        return new Response(
          JSON.stringify({ found: false }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      artistId = artist.id;

      // Cache check for name-resolved ID (couldn't check earlier without the ID)
      const { data: cached } = await db
        .from("artist_cache")
        .select("data, created_at")
        .eq("artist_id", artistId)
        .eq("service", "spotify")
        .single();

      if (isFreshCacheRow(cached) && isValidArtistCachePayload(cached!.data)) {
        return new Response(JSON.stringify(cached!.data), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (cached && !isValidArtistCachePayload(cached.data)) {
        console.warn(`[spotify-artist] Malformed cache for ${artistId}, refetching`);
      }
    }

    // Fetch top tracks, albums, and related artists in parallel. Spotify deprecated
    // related-artists and top-tracks for dev-mode apps in Feb 2026 — we handle nulls
    // gracefully and fall back to album-track mining.
    const [topTracksData, albumsData, relatedData] = await Promise.all([
      spotifyGet(`/artists/${artistId}/top-tracks?market=US`, token),
      spotifyGet(`/artists/${artistId}/albums?include_groups=album,single&limit=20&market=US`, token),
      spotifyGet(`/artists/${artistId}/related-artists`, token),
    ]);

    let topTracks: any[] = [];
    if (topTracksData?.tracks?.length) {
      topTracks = topTracksData.tracks.slice(0, 10).map((t: any) => ({
        title: t.name,
        artist: t.artists?.[0]?.name || artist.name,
        album: t.album?.name || "",
        imageUrl: t.album?.images?.[0]?.url || t.album?.images?.[1]?.url || "",
        uri: t.uri || "",
        durationMs: t.duration_ms || 0,
      }));
    } else if (albumsData?.items?.length) {
      const albumIds = albumsData.items.slice(0, 3).map((a: any) => a.id);
      for (const albumId of albumIds) {
        if (topTracks.length >= 10) break;
        const albumDetail = await spotifyGet(`/albums/${albumId}`, token);
        if (albumDetail?.tracks?.items) {
          for (const t of albumDetail.tracks.items) {
            if (topTracks.length >= 10) break;
            topTracks.push({
              title: t.name,
              artist: t.artists?.[0]?.name || artist.name,
              album: albumDetail.name || "",
              imageUrl: albumDetail.images?.[0]?.url || albumDetail.images?.[1]?.url || "",
              uri: t.uri || "",
              durationMs: t.duration_ms || 0,
            });
          }
        }
      }
    }

    // Cross-service bio reuse: if Apple has already cached a bio for this
    // artist (matched by canonical name), skip the expensive Gemini call.
    const canonicalName = (artist.name || "").toLowerCase().trim();
    const reusedBio = await findCrossServiceBio(db, canonicalName, "spotify");
    const bioResult = reusedBio
      ? { text: reusedBio.bio, grounded: reusedBio.grounded }
      : await generateArtistBio(
        artist.name,
        artist.genres || [],
        topTracks.map((t: any) => t.title),
        (albumsData?.items || []).slice(0, 5).map((a: any) => a.name),
      );

    // Normalize response
    const result = {
      found: true,
      artist: {
        id: artistId,
        name: artist.name,
        imageUrl: artist.images?.[0]?.url || artist.images?.[1]?.url || "",
        genres: artist.genres || [],
        followers: artist.followers?.total || 0,
        bio: bioResult.text,
        bioGrounded: bioResult.grounded,
      },
      topTracks,
      albums: (albumsData?.items || []).map((a: any) => ({
        name: a.name,
        imageUrl: a.images?.[0]?.url || a.images?.[1]?.url || "",
        releaseDate: a.release_date || "",
        albumType: a.album_type || "album",
        totalTracks: a.total_tracks || 0,
        uri: a.uri || "",
      })),
      relatedArtists: (relatedData?.artists || []).slice(0, 10).map((a: any) => ({
        id: a.id || "",
        name: a.name,
        imageUrl: a.images?.[0]?.url || a.images?.[1]?.url || "",
        genres: (a.genres || []).slice(0, 2),
      })),
    };

    // Write to cache (fire-and-forget — don't block response)
    // Concurrent cold-cache requests for the same artist will both generate
    // a bio, but upsert is idempotent so the second write overwrites with
    // equivalent data.
    db.from("artist_cache")
      .upsert({
        artist_id: artistId,
        service: "spotify",
        canonical_name: canonicalName || null,
        data: result,
        created_at: new Date().toISOString(),
      })
      .then(({ error }: { error: unknown }) => {
        if (error) console.error("[spotify-artist] cache write failed:", (error as { message?: string }).message);
      })
      .catch((err: unknown) => console.error("[spotify-artist] cache write exception:", err));

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("spotify-artist error:", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

// ── Apple Music path ────────────────────────────────────────────────────

interface AppleArtistViews {
  "top-songs"?: { data?: Array<{ id?: string; attributes?: Record<string, unknown> }> };
  "similar-artists"?: { data?: Array<{ id?: string; attributes?: Record<string, unknown> }> };
}

interface AppleArtistResource {
  id?: string;
  type?: string;
  attributes?: {
    name?: string;
    genreNames?: string[];
    artwork?: { url?: string };
  };
  views?: AppleArtistViews;
}

async function handleAppleArtist(args: {
  db: ReturnType<typeof createClient>;
  providedId?: string;
  artistName?: string;
  storefront?: string;
}): Promise<Response> {
  const { db, providedId, artistName, storefront: rawStorefront } = args;
  const storefront = safeStorefront(rawStorefront);
  const devToken = await getAppleDeveloperToken();

  // Resolve an Apple catalog ID. Direct ID → skip search.
  let artistId: string | undefined = providedId;

  if (!artistId && artistName) {
    const q = encodeURIComponent(artistName.trim());
    const searchData = await appleGet<{
      results?: { artists?: { data?: Array<{ id?: string; attributes?: { name?: string } }> } };
    }>(
      `/catalog/${storefront}/search?types=artists&limit=5&term=${q}`,
      devToken,
    );
    const candidates = searchData?.results?.artists?.data || [];
    const target = artistName.trim().toLowerCase();
    const match = candidates.find((a) => (a.attributes?.name || "").toLowerCase() === target)
      || candidates[0];
    artistId = match?.id;
  }

  if (!artistId || !isValidAppleCatalogId(artistId)) {
    return new Response(
      JSON.stringify({ found: false }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // Cache check — composite key (artist_id, 'apple')
  const { data: cached } = await db
    .from("artist_cache")
    .select("data, created_at")
    .eq("artist_id", artistId)
    .eq("service", "apple")
    .single();

  if (isFreshCacheRow(cached as ArtistCacheRow | null) && isValidArtistCachePayload((cached as ArtistCacheRow).data)) {
    return new Response(JSON.stringify((cached as ArtistCacheRow).data), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Fetch artist base + top-songs + similar-artists in one call, albums separately.
  const [artistData, albumsData] = await Promise.all([
    appleGet<{ data?: AppleArtistResource[] }>(
      `/catalog/${storefront}/artists/${artistId}?views=top-songs,similar-artists`,
      devToken,
    ),
    appleGet<{ data?: Array<{ id?: string; attributes?: Record<string, unknown> }> }>(
      `/catalog/${storefront}/artists/${artistId}/albums?limit=20`,
      devToken,
    ),
  ]);

  const artist = artistData?.data?.[0];
  if (!artist) {
    return new Response(
      JSON.stringify({ found: false }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const attrs = artist.attributes || {};
  const name = attrs.name || "";
  const canonicalName = name.toLowerCase().trim();
  const imageUrl = resolveArtworkUrl(attrs.artwork);
  const genres = attrs.genreNames || [];

  // Top tracks from views
  const topSongs = artist.views?.["top-songs"]?.data || [];
  const topTracks = topSongs.slice(0, 10).map((s) => normalizeAppleTrack(s));

  // Related artists from views
  const similar = artist.views?.["similar-artists"]?.data || [];
  const relatedArtists = similar.slice(0, 10).map((a) => {
    const compact = normalizeAppleArtistCompact(a);
    const g = (a.attributes as { genreNames?: string[] } | undefined)?.genreNames || [];
    return { ...compact, genres: g.slice(0, 2) };
  });

  // Albums
  const rawAlbums = albumsData?.data || [];
  const albums = rawAlbums.map((al) => normalizeAppleAlbumListItem(al));

  // Cross-service bio reuse: check if Spotify already cached a bio for
  // this artist (matched by canonical name). Bio generation is expensive
  // (~20s Gemini call with grounding), so reuse whenever possible.
  const reusedBio = await findCrossServiceBio(db, canonicalName, "apple");
  const bioResult = reusedBio
    ? { text: reusedBio.bio, grounded: reusedBio.grounded }
    : await generateArtistBio(
      name,
      genres,
      topTracks.map((t) => t.title),
      albums.slice(0, 5).map((a) => a.name),
    );

  const result = {
    found: true,
    artist: {
      id: artistId,
      name,
      imageUrl,
      genres,
      followers: 0, // Apple Music has no follower count
      bio: bioResult.text,
      bioGrounded: bioResult.grounded,
    },
    topTracks,
    albums,
    relatedArtists,
  };

  // Fire-and-forget cache write
  db.from("artist_cache")
    .upsert({
      artist_id: artistId,
      service: "apple",
      canonical_name: canonicalName || null,
      data: result,
      created_at: new Date().toISOString(),
    })
    .then(({ error }: { error: unknown }) => {
      if (error) console.error("[spotify-artist] apple cache write failed:", (error as { message?: string }).message);
    })
    .catch((err: unknown) => console.error("[spotify-artist] apple cache write exception:", err));

  return new Response(JSON.stringify(result), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
