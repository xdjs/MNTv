// Candidate endpoint; production continues calling spotify-artist.
Deno.env.set("MNTV_FUNCTION_CHANNEL", "staging");
await import("../spotify-artist/index.ts");
