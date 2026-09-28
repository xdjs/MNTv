/** Only staging builds opt into the isolated candidate edge functions. */
export function edgeFunctionName(name: "spotify-artist" | "artist-updates" | "apple-taste"): string {
  return import.meta.env.VITE_EDGE_FUNCTION_CHANNEL === "staging" ? `${name}-staging` : name;
}
