import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Extract likely artist name from a YouTube video title
// e.g. "Radiohead - Karma Police (Official Video)" → "Radiohead"
// e.g. "Karma Police by Radiohead" → "Radiohead"
function parseArtistFromTitle(title: string): string | null {
  // Pattern: "Artist - Track"
  const dashMatch = title.match(/^([^-–]+)\s*[-–]/);
  if (dashMatch) {
    const candidate = dashMatch[1].trim();
    if (candidate.length > 1 && candidate.length < 60) return candidate;
  }
  // Pattern: "Track by Artist"
  const byMatch = title.match(/\sby\s+(.+?)(?:\s*[\(\[|]|$)/i);
  if (byMatch) {
    const candidate = byMatch[1].trim();
    if (candidate.length > 1 && candidate.length < 60) return candidate;
  }
  return null;
}

// Music-related category IDs in YouTube
const MUSIC_CATEGORY_IDS = new Set(["10"]);

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { provider_token } = await req.json();
    const YOUTUBE_API_KEY = Deno.env.get("YOUTUBE_API_KEY");

    if (!YOUTUBE_API_KEY) {
      throw new Error("YOUTUBE_API_KEY not configured");
    }

    if (!provider_token) {
      throw new Error("provider_token is required");
    }

    const artistCounts: Record<string, number> = {};
    const trackTitles: string[] = [];

    // 1. Fetch liked videos using the user's OAuth token
    const likedRes = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=snippet&myRating=like&maxResults=50&key=${YOUTUBE_API_KEY}`,
      {
        headers: { Authorization: `Bearer ${provider_token}` },
      }
    );

    if (likedRes.ok) {
      const likedData = await likedRes.json();
      for (const item of likedData.items ?? []) {
        const snippet = item.snippet;
        const categoryId = snippet?.categoryId;
        const title: string = snippet?.title ?? "";
        const channelTitle: string = snippet?.channelTitle ?? "";

        const isMusic = MUSIC_CATEGORY_IDS.has(categoryId) ||
          /music|vevo|official|lyrics|audio|feat\.|ft\./i.test(title) ||
          /vevo|music|records|official/i.test(channelTitle);

        if (!isMusic) continue;

        // Try to parse artist from title first, fall back to channel name
        const artist = parseArtistFromTitle(title) ?? channelTitle;
        if (artist) {
          artistCounts[artist] = (artistCounts[artist] ?? 0) + 1;
        }
        trackTitles.push(title);
      }
    }

    // 2. Fetch user's music playlists for additional signal
    const playlistsRes = await fetch(
      `https://www.googleapis.com/youtube/v3/playlists?part=snippet&mine=true&maxResults=25&key=${YOUTUBE_API_KEY}`,
      {
        headers: { Authorization: `Bearer ${provider_token}` },
      }
    );

    if (playlistsRes.ok) {
      const playlistsData = await playlistsRes.json();
      for (const playlist of playlistsData.items ?? []) {
        const title: string = playlist.snippet?.title ?? "";
        const artist = parseArtistFromTitle(title);
        if (artist) {
          artistCounts[artist] = (artistCounts[artist] ?? 0) + 1;
        }
      }
    }

    // Sort artists by frequency and return top 20
    const topArtists = Object.entries(artistCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([name]) => name);

    // Top track titles (deduplicated, max 20)
    const topTracks = [...new Set(trackTitles)].slice(0, 20);

    return new Response(
      JSON.stringify({ topArtists, topTracks }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("youtube-taste error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error", topArtists: [], topTracks: [] }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
