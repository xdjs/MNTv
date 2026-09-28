export interface FactEvidence {
  version: 1;
  headline: string;
  text: string;
  url: string;
  excerpt: string;
}

/** Bind verification to this exact claim AND URL, never a reusable source badge. */
export function hasFactEvidence(fact: { headline?: string; text?: string; body?: string }, source: unknown): boolean {
  if (!fact || typeof fact !== "object") return false;
  const body = fact.text ?? fact.body;
  if (typeof body !== "string" || !body.trim()) return false;
  if (!source || typeof source !== "object") return false;
  const s = source as { url?: unknown; citation?: FactEvidence };
  const proof = s.citation;
  if (!proof || proof.version !== 1 || typeof s.url !== "string") return false;
  try { if (!["http:", "https:"].includes(new URL(s.url).protocol)) return false; } catch { return false; }
  return proof.url === s.url && proof.headline === (fact.headline ?? "") &&
    proof.text === (fact.text ?? fact.body ?? "") && typeof proof.excerpt === "string" && proof.excerpt.length >= 40;
}
