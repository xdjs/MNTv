import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { CACHE_TTL_MS } from "../_shared/config.ts";

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

// Reuse the same Client Credentials flow as spotify-search
let cachedToken: string | null = null;
let tokenExpiresAt = 0;

async function getAppToken(): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiresAt) return cachedToken;

  const clientId = Deno.env.get("SPOTIFY_CLIENT_ID");
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

    // First attempt: with Google Search grounding
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...baseBody, tools: [{ google_search: {} }] }),
    });
    if (!res.ok) return { text: "", grounded: false };
    const data = await res.json();

    const finishReason = data.candidates?.[0]?.finishReason;
    if (finishReason === "RECITATION") {
      // Retry without grounding — RECITATION means grounding triggered copyright filter
      console.warn(`[spotify-artist] RECITATION for "${name}", retrying without grounding`);
      const retryRes = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(baseBody),
      });
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
  const res = await fetch(`https://api.spotify.com/v1${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  return res.json();
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { artistId: providedId, artistName } = body;

    if (!providedId && (!artistName || typeof artistName !== "string")) {
      return new Response(
        JSON.stringify({ error: "artistId or artistName required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const db = getSupabaseAdmin();

    // Early cache check when we already have a Spotify ID — avoids Spotify API call entirely
    if (providedId && typeof providedId === "string") {
      const { data: cached } = await db
        .from("artist_cache")
        .select("data, created_at")
        .eq("artist_id", providedId)
        .single();

      if (cached && Date.now() - new Date(cached.created_at).getTime() < CACHE_TTL_MS) {
        return new Response(JSON.stringify(cached.data), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const token = await getAppToken();

    let artist: any;
    let artistId: string;

    if (providedId && typeof providedId === "string") {
      // Direct lookup by Spotify ID — no search ambiguity
      const directData = await spotifyGet(`/artists/${providedId}`, token);
      if (!directData) {
        return new Response(
          JSON.stringify({ found: false }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      artist = directData;
      artistId = directData.id;
    } else {
      // Fallback: search by name (backward compat for real:: URLs)
      const q = encodeURIComponent(artistName.trim());
      const searchData = await spotifyGet(`/search?type=artist&limit=1&q=${q}`, token);
      artist = searchData?.artists?.items?.[0];

      if (!artist) {
        return new Response(
          JSON.stringify({ found: false }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      artistId = artist.id;

      // Cache check for name-resolved ID (couldn't check earlier without the ID)
      const { data: cached } = await db
        .from("artist_cache")
        .select("data, created_at")
        .eq("artist_id", artistId)
        .single();

      if (cached && Date.now() - new Date(cached.created_at).getTime() < CACHE_TTL_MS) {
        return new Response(JSON.stringify(cached.data), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // 2. Fetch top tracks, albums, and related artists in parallel
    // Some endpoints may be unavailable (Spotify deprecated related-artists and
    // top-tracks for dev-mode apps in Feb 2026), so we handle nulls gracefully.
    const [topTracksData, albumsData, relatedData] = await Promise.all([
      spotifyGet(`/artists/${artistId}/top-tracks?market=US`, token),
      spotifyGet(`/artists/${artistId}/albums?include_groups=album,single&limit=20&market=US`, token),
      spotifyGet(`/artists/${artistId}/related-artists`, token),
    ]);

    // Build top tracks from album tracks if top-tracks endpoint is unavailable
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
      // Fallback: fetch tracks from the first few albums
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

    // 3. Generate AI bio with track/album context for grounding (prevents hallucination)
    const bioResult = await generateArtistBio(
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
    // Note: concurrent cold-cache requests for the same artist will both generate a bio,
    // but upsert is idempotent so the second write just overwrites with equivalent data.
    db.from("artist_cache")
      .upsert({ artist_id: artistId, data: result, created_at: new Date().toISOString() })
      .then(({ error }) => { if (error) console.error("[spotify-artist] cache write failed:", error.message); })
      .catch((err) => console.error("[spotify-artist] cache write exception:", err));

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("spotify-artist error:", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
