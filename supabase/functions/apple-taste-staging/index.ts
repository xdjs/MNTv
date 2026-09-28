// Candidate endpoint; production continues calling apple-taste.
Deno.env.set("MNTV_FUNCTION_CHANNEL", "staging");
await import("../apple-taste/index.ts");
