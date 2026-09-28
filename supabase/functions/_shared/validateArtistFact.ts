export interface ArtistFactSource { title: string; url: string; text: string }

/** Keep the model's explicit source association only when its evidence exists
 * in that source. Catalog pages identify recordings, not editorial claims. */
export function validateArtistFact(value: unknown, sources: ArtistFactSource[]) {
  if (!value || typeof value !== "object") return null;
  const fact = value as Record<string, unknown>;
  if (typeof fact.headline !== "string" || typeof fact.body !== "string" ||
      !fact.headline.trim() || !fact.body.trim() || !Number.isInteger(fact.sourceNumber) ||
      typeof fact.evidence !== "string") return null;
  const source = sources[(fact.sourceNumber as number) - 1];
  if (!source) return null;
  try {
    const url = new URL(source.url);
    if (!["https:", "http:"].includes(url.protocol)) return null;
    if (["spotify.com", "apple.com"].some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`))) return null;
  } catch { return null; }
  const normalize = (text: string) => text.normalize("NFKC").replace(/\s+/g, " ").trim();
  const evidence = normalize(fact.evidence);
  if (evidence.length < 40 || !normalize(source.text).includes(evidence)) return null;
  return { headline: fact.headline, body: fact.body, citation: { title: source.title, url: source.url } };
}
