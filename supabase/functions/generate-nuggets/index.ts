import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const nuggetTool = {
  type: "function" as const,
  function: {
    name: "return_nuggets",
    description: "Return 3 music trivia nuggets with real sources",
    parameters: {
      type: "object",
      properties: {
        nuggets: {
          type: "array",
          items: {
            type: "object",
            properties: {
              text: { type: "string", description: "1-3 sentences of surprising, accurate music trivia" },
              kind: { type: "string", enum: ["process", "constraint", "pattern", "human", "influence"] },
              listenFor: { type: "boolean", description: "Set exactly ONE nugget to true" },
              source: {
                type: "object",
                properties: {
                  type: { type: "string", enum: ["article", "interview"] },
                  title: { type: "string", description: "Real title of the article or interview" },
                  publisher: { type: "string", description: "Real publisher name (e.g. Pitchfork, Rolling Stone, NME, The Guardian)" },
                  url: { type: "string", description: "A real, working URL to the source" },
                  quoteSnippet: { type: "string", description: "A real or closely paraphrased quote from the source" },
                },
                required: ["type", "title", "publisher", "url", "quoteSnippet"],
                additionalProperties: false,
              },
            },
            required: ["text", "kind", "listenFor", "source"],
            additionalProperties: false,
          },
        },
      },
      required: ["nuggets"],
      additionalProperties: false,
    },
  },
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

Rules:
- Each nugget must be factually accurate and verifiable
- Set exactly ONE nugget's listenFor to true (a "listen for this" audio moment)
- Sources must be REAL articles or interviews from major publications (Rolling Stone, Pitchfork, NME, The Guardian, Billboard, Stereogum, etc.)
- URLs must be real, working links to actual published articles
- DO NOT use YouTube as a source type — only use "article" or "interview"
- Quote snippets should be real or closely paraphrased from the actual source
- Cover diverse kinds across the 3 nuggets`;

    const userPrompt = `Song: "${title}" by ${artist}${album ? ` from the album "${album}"` : ""}

Generate 3 pieces of real, verifiable trivia with real article/interview sources from major music publications.`;

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
        tools: [nuggetTool],
        tool_choice: { type: "function", function: { name: "return_nuggets" } },
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
    
    // Extract from tool call response
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    let parsed;
    
    if (toolCall?.function?.arguments) {
      try {
        parsed = JSON.parse(toolCall.function.arguments);
      } catch {
        console.error("Failed to parse tool call arguments:", toolCall.function.arguments);
        return new Response(
          JSON.stringify({ error: "Failed to parse AI response" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    } else {
      // Fallback: try parsing content directly
      const content = data.choices?.[0]?.message?.content || "";
      try {
        const jsonStr = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
        parsed = JSON.parse(jsonStr);
      } catch {
        console.error("Failed to parse AI response:", content);
        return new Response(
          JSON.stringify({ error: "Failed to parse AI response" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
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
