/** A shared display name alone cannot establish that a source is about this artist. */
export function matchesArtistResearch(
  source: { title?: string; text?: string; highlights?: string[]; url?: string },
  identity: { id: string; name: string; service: "apple" | "spotify"; titles: string[] },
): boolean {
  const normalize = (value: string) => value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  const text = normalize([source.title, source.text, ...(source.highlights ?? [])].filter(Boolean).join(" "));
  const hasPhrase = (phrase: string) => ` ${text} `.includes(` ${normalize(phrase)} `);
  if (!hasPhrase(identity.name)) return false;
  try {
    const url = new URL(source.url ?? "");
    if (identity.service === "spotify" && url.hostname === "open.spotify.com" && url.pathname === `/artist/${identity.id}`) return true;
    if (identity.service === "apple" && url.hostname === "music.apple.com" && url.pathname.includes("/artist/") && url.pathname.split("/").at(-1) === identity.id) return true;
  } catch { /* A textual catalog match can still identify the source. */ }
  // Short/generic song names are weak evidence; require a distinctive title.
  return identity.titles.some((title) => normalize(title).length >= 12 && normalize(title) !== normalize(identity.name) && hasPhrase(title));
}
