// Mechanically checkable Music Nerd Constitution rules.
//
// The constitution has lived as prose in the Writer prompt plus a
// server-side validator that is soft, logged-only, and buried in a
// deploy-guarded edge function. That means "is our output actually
// following our own rules?" has only ever been answerable by reading
// nuggets by eye — which is how a violation ships and nobody notices.
//
// These are the subset of rules a machine can judge. Deliberately NOT
// covered: "reveals rather than summarizes", "alters perception",
// "novelty" — those need a reader. What's here is the floor, not the
// ceiling: passing every check does not make a nugget good, but failing
// one means it breaks a rule the team already agreed to.
//
// Kept pure and dependency-free so the same checks can run in a Vitest
// suite, over the seed corpus, and eventually inside the edge function's
// validator rather than being reimplemented there.

export interface NuggetLike {
  headline?: string;
  text?: string;
  kind?: string;
}

export type ViolationCode =
  | "empty-headline"
  | "title-case-headline"
  | "abstract-noun-headline"
  | "hedging"
  | "describes-sound"
  | "meta-commentary-on-absence"
  | "patronizes-taste"
  | "body-restates-headline"
  | "fails-swap-test"
  | "too-long";

export interface Violation {
  code: ViolationCode;
  detail: string;
}

// "Never hedge — state facts or skip them."
const HEDGE_WORDS = [
  "likely", "suggests", "perhaps", "possibly", "arguably",
  "seems to", "appears to", "may have", "might have", "reportedly",
];

// "Never describe sound — the listener can hear it."
const SOUND_DESCRIPTORS = [
  "sonic landscape", "soundscape", "sonic palette", "sonic texture",
  "aural landscape", "sonic journey",
];

// "NO META-COMMENTARY ABOUT ABSENCE." The rule names several of these
// verbatim; the rest are the same move in different words, including
// the two that actually shipped and had to be rewritten.
const ABSENCE_META = [
  "mystery is the story", "without a past", "blank slate", "digital ghost",
  "anti-persona", "no verified facts", "not much press", "little is known",
  "as more sources surface", "as press and credits surface",
  "we'll layer in", "information is scarce", "details are scarce",
];

// "NEVER patronize the listener with their own taste."
const TASTE_PATRONIZING = [
  "you keep coming back to", "already among your top listens",
  "on rotation", "one of your under-the-radar picks", "your under-the-radar",
  "an artist you listen to", "you've been listening to",
  "your top artists", "a favorite of yours",
];

// Abstract nouns the constitution calls out in the "[Name]'s [Abstract
// Noun]" headline pattern.
const ABSTRACT_HEADLINE_NOUNS = [
  "digital footprint", "artistic journey", "creative vision", "creative evolution",
  "musical identity", "sonic identity", "artistic identity", "musical journey",
  "creative journey", "musical legacy", "artistic legacy", "musical tapestry",
  "creative process", "artistic evolution", "musical evolution", "artistic vision",
  "cultural impact", "musical landscape", "creative spirit", "artistic spirit",
];

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "but", "of", "to", "in", "on", "at", "by",
  "for", "with", "from", "as", "is", "was", "were", "be", "been", "are",
  "it", "its", "this", "that", "these", "those", "their", "his", "her",
  "he", "she", "they", "them", "you", "your", "we", "our", "i",
  "has", "had", "have", "not", "no", "so", "if", "then", "than", "when",
  "where", "what", "how", "which", "who", "into", "out", "up", "down",
  "over", "after", "before", "during", "while", "also", "just", "more",
]);

function words(s: string): string[] {
  return (s.toLowerCase().match(/[a-z0-9']+/g) ?? []).filter((w) => !STOPWORDS.has(w));
}

/**
 * Title Case is banned; sentence case is required. Judged on the count
 * of capitalised words rather than any single one, so a headline that
 * legitimately starts with a proper noun isn't flagged.
 */
function isTitleCase(headline: string): boolean {
  const tokens = headline.split(/\s+/).filter((t) => /[A-Za-z]/.test(t));
  // Below ~6 words the signal is unusable: "Billie Eilish Ocean Eyes" is
  // 100% capitalised and entirely proper nouns. Short headlines get the
  // benefit of the doubt rather than a false positive.
  if (tokens.length < 6) return false;
  const capitalised = tokens.filter((t) => /^[A-Z]/.test(t.replace(/^["'(]+/, "")));
  // Proper nouns alone rarely push a sentence past ~70% capitalised.
  return capitalised.length / tokens.length > 0.7;
}

/**
 * "BODY-ADDS-NEW-FACT: the body must contain at least one load-bearing
 * noun OR verb that does not appear in the headline."
 */
function bodyAddsNothing(headline: string, text: string): boolean {
  const headlineWords = new Set(words(headline));
  const bodyWords = words(text);
  if (bodyWords.length === 0) return true;
  return !bodyWords.some((w) => w.length > 3 && !headlineWords.has(w));
}

/**
 * SWAP TEST proxy: a nugget that names no specific entity beyond the
 * artist could be about anyone. Approximated by looking for a proper
 * noun, a year, or a quoted title — the concrete anchors the rule is
 * really asking for.
 */
function hasSpecificAnchor(all: string, artist?: string): boolean {
  if (/\b(19|20)\d{2}\b/.test(all)) return true;
  if (/["“'][^"”']{2,}["”']/.test(all)) return true;
  const artistLower = (artist ?? "").trim().toLowerCase();
  const properNouns = all.match(/\b[A-Z][A-Za-z'.&-]{2,}\b/g) ?? [];
  return properNouns.some((n) => {
    const low = n.toLowerCase();
    return low !== artistLower && !artistLower.includes(low) && !STOPWORDS.has(low);
  });
}

function findPhrase(haystack: string, needles: string[]): string | null {
  const low = haystack.toLowerCase();
  for (const n of needles) if (low.includes(n)) return n;
  return null;
}

/** Every violation a nugget commits. Empty array means it passes the floor. */
export function checkNugget(nugget: NuggetLike, artist?: string): Violation[] {
  const out: Violation[] = [];
  const headline = (nugget.headline ?? "").trim();
  const text = (nugget.text ?? "").trim();
  const all = `${headline} ${text}`;

  if (!headline) {
    out.push({ code: "empty-headline", detail: "no headline" });
  } else {
    if (isTitleCase(headline)) {
      out.push({ code: "title-case-headline", detail: headline.slice(0, 60) });
    }
    const abstract = findPhrase(headline, ABSTRACT_HEADLINE_NOUNS);
    if (abstract) out.push({ code: "abstract-noun-headline", detail: abstract });
  }

  const hedge = findPhrase(all, HEDGE_WORDS);
  if (hedge) out.push({ code: "hedging", detail: hedge });

  const sound = findPhrase(all, SOUND_DESCRIPTORS);
  if (sound) out.push({ code: "describes-sound", detail: sound });

  const absence = findPhrase(all, ABSENCE_META);
  if (absence) out.push({ code: "meta-commentary-on-absence", detail: absence });

  const taste = findPhrase(all, TASTE_PATRONIZING);
  if (taste) out.push({ code: "patronizes-taste", detail: taste });

  if (headline && text && bodyAddsNothing(headline, text)) {
    out.push({ code: "body-restates-headline", detail: text.slice(0, 60) });
  }

  if (!hasSpecificAnchor(all, artist)) {
    out.push({ code: "fails-swap-test", detail: "no proper noun, year, or quoted title" });
  }

  // "Brevity with weight" — the constitution's own ceiling.
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  if (wordCount > 120) out.push({ code: "too-long", detail: `${wordCount} words` });

  return out;
}

export interface CorpusReport {
  total: number;
  clean: number;
  violations: Record<string, number>;
  worst: { headline: string; codes: ViolationCode[] }[];
}

/** Aggregate compliance across a set of nuggets. */
export function auditCorpus(
  nuggets: readonly (NuggetLike & { artist?: string })[],
): CorpusReport {
  const violations: Record<string, number> = {};
  const offenders: { headline: string; codes: ViolationCode[] }[] = [];
  let clean = 0;

  for (const n of nuggets) {
    const found = checkNugget(n, n.artist);
    if (found.length === 0) { clean++; continue; }
    for (const v of found) violations[v.code] = (violations[v.code] ?? 0) + 1;
    offenders.push({ headline: (n.headline ?? "").slice(0, 70), codes: found.map((f) => f.code) });
  }

  offenders.sort((a, b) => b.codes.length - a.codes.length);
  return { total: nuggets.length, clean, violations, worst: offenders.slice(0, 10) };
}
