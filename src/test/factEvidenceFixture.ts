import type { FactEvidence } from "../../supabase/functions/_shared/hasFactEvidence";
/** Test-only stand-in for a server-verified claim. Never used by app code. */
export function evidence(fact: { headline?: string; text?: string; body?: string }, url: string): FactEvidence {
  return { version: 1, headline: fact.headline ?? "", text: fact.text ?? fact.body ?? "", url, excerpt: "A retrieved source passage explicitly supporting this test fact." };
}
