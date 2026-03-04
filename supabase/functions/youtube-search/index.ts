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
    const { query } = await req.json();
    if (!query || typeof query !== "string" || query.trim().length === 0) {
      return new Response(
        JSON.stringify({ videoId: null }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const apiKey = Deno.env.get("YOUTUBE_API_KEY") || Deno.env.get("GOOGLE_AI_API_KEY");
    if (!apiKey) {
      throw new Error("YOUTUBE_API_KEY not set");
    }

    const searchQuery = `${query.trim()} official audio`;
    const params = new URLSearchParams({
      part: "snippet",
      type: "video",
      videoCategoryId: "10",
      maxResults: "1",
      q: searchQuery,
      key: apiKey,
    });

    const res = await fetch(
      `https://www.googleapis.com/youtube/v3/search?${params}`
    );

    if (!res.ok) {
      const text = await res.text();
      console.error("YouTube search failed:", res.status, text);
      throw new Error(`YouTube API error: ${res.status}`);
    }

    const data = await res.json();
    const videoId = data.items?.[0]?.id?.videoId || null;

    return new Response(
      JSON.stringify({ videoId }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("youtube-search error:", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message, videoId: null }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
