// Candidate endpoint; production continues calling artist-updates.
Deno.env.set("MNTV_FUNCTION_CHANNEL", "staging");
await import("../artist-updates/index.ts");
