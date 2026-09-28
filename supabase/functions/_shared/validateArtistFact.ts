export interface ArtistFactSource { title: string; url: string; text: string }

/** Resolve an explicit retrieved-source selection. This is not verification:
 * verifyFactSources must check the complete claim before it can be displayed. */
export function validateArtistFact(value: unknown, sources: ArtistFactSource[]) {
  if (!value || typeof value !== "object") return null;
  const fact = value as Record<string, unknown>;
  if (typeof fact.headline !== "string" || typeof fact.body !== "string" ||
      !fact.headline.trim() || !fact.body.trim() || !Number.isInteger(fact.sourceNumber)) return null;
  const source = sources[(fact.sourceNumber as number) - 1];
  if (!source) return null;
  try {
    const url = new URL(source.url);
    if (!["https:", "http:"].includes(url.protocol)) return null;
    if (["spotify.com", "apple.com"].some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`))) return null;
  } catch { return null; }
  if (source.text.trim().length < 40) return null;
  return { headline: fact.headline, body: fact.body, citation: { title: source.title, url: source.url } };
}
