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
    const { artist, title, album } = await req.json();

    if (!artist || !title) {
      return new Response(
        JSON.stringify({ error: "artist and title are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const systemPrompt = `You are a music historian and trivia expert. Given a song, generate exactly 3 fascinating, accurate pieces of trivia about the song, artist, or recording process.

For each nugget, provide:
- "text": 1-3 sentences of surprising, deeply informed trivia
- "kind": one of "process" (how it was made), "constraint" (creative limitations), "pattern" (musical patterns/stats), "human" (personal stories), "influence" (cultural impact)
- "listenFor": boolean — set exactly ONE nugget to true (a "listen for this" moment)
- "source": an object describing the REAL source where this information comes from. This must be a real, verifiable source. Include:
  - "type": "youtube" | "article" | "interview"
  - "title": the real title of the video/article/interview
  - "publisher": the real publisher/channel name
  - "url": the real URL to the source (must be a real, working URL)
  - "embedId": for YouTube sources ONLY, the real YouTube video ID (the part after v= in a youtube URL). This MUST be a real video ID for a video that actually exists and is related to the song/artist. Do NOT use placeholder IDs.
  - "quoteSnippet": a short real or paraphrased quote from the source
  - "locator": where in the source (e.g. "3:12" for video timestamp, "Paragraph 6" for articles)

CRITICAL: All YouTube video IDs must be REAL IDs from actual existing YouTube videos about this artist/song. Search your knowledge for real documentary, interview, or music analysis videos. If you can't find a real YouTube video ID, use type "article" instead with a real article URL.

Return ONLY valid JSON in this exact format:
{
  "nuggets": [
    {
      "text": "...",
      "kind": "process",
      "listenFor": false,
      "source": {
        "type": "youtube",
        "title": "Real Video Title",
        "publisher": "Real Channel Name",
        "url": "https://www.youtube.com/watch?v=REAL_ID",
        "embedId": "REAL_ID",
        "quoteSnippet": "...",
        "locator": "3:12"
      }
    }
  ]
}`;

    const userPrompt = `Song: "${title}" by ${artist}${album ? ` from the album "${album}"` : ""}

Remember: Only use REAL YouTube video IDs from actual videos you know exist. For Radiohead, look for real documentary/analysis videos like those from Middle 8, Polyphonic, or classic albums documentaries. If unsure about a video ID, use an article source instead.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again shortly." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted. Please add credits." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errText = await response.text();
      console.error("AI gateway error:", response.status, errText);
      return new Response(
        JSON.stringify({ error: "AI generation failed" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";

    let parsed;
    try {
      const jsonStr = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      parsed = JSON.parse(jsonStr);
    } catch {
      console.error("Failed to parse AI response:", content);
      return new Response(
        JSON.stringify({ error: "Failed to parse AI response", raw: content }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-nuggets error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
