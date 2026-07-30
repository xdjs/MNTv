import { describe, it, expect } from "vitest";
import { auditCorpus, checkNugget, type NuggetLike } from "@/lib/constitutionChecks";

// Audits every shipped nugget in the seed corpus against the
// mechanically-checkable constitution rules.
//
// The point is a ratchet, not a pass/fail gate. The corpus predates
// several rules, so demanding zero violations today would just mean
// deleting the test. Instead the current count is locked in: it can go
// down freely, and going UP fails. That turns "are we following our own
// rules?" from something you answer by reading nuggets into something
// you answer by running this.
//
// If a threshold below trips after a legitimate content change, lower it
// — never raise it without a reason recorded in the diff.

/**
 * Measured 2026-07-30 across all 72 seed files: 324 nuggets, 136 clean
 * (42%). The dominant failure is Title Case headlines — 180 of 324, a
 * rule the constitution states explicitly and the corpus ignores at
 * scale. Worth knowing that's an ENFORCEMENT gap, not a missing rule.
 *
 * Numbers here are a ceiling, never a target.
 */
const BASELINE = {
  violatingNuggets: 188,
  byCode: {
    "title-case-headline": 180,
    "describes-sound": 6,
    "hedging": 4,
  },
} as const;

const seedModules = import.meta.glob("../data/seed/*.json", { eager: true }) as Record<
  string,
  { default: { nuggets?: NuggetLike[]; artistSummary?: string } }
>;

interface SeedNugget extends NuggetLike { artist?: string; file: string }

function loadCorpus(): SeedNugget[] {
  const out: SeedNugget[] = [];
  for (const [path, mod] of Object.entries(seedModules)) {
    const file = path.split("/").pop() ?? path;
    // Seed filenames are `artist-title.json`; the leading segment is a
    // good-enough artist hint for the swap test, which only needs to know
    // what NOT to count as a specific anchor.
    const artistHint = (file.replace(/\.json$/, "").split("-")[0] ?? "").replace(/_/g, " ");
    for (const n of mod.default?.nuggets ?? []) {
      out.push({ ...n, artist: artistHint, file });
    }
  }
  return out;
}

const corpus = loadCorpus();

describe("seed corpus — constitution compliance", () => {
  it("loads a non-trivial corpus", () => {
    expect(corpus.length).toBeGreaterThan(50);
  });

  it("reports current compliance", () => {
    const report = auditCorpus(corpus);
    const pct = ((report.clean / report.total) * 100).toFixed(1);

    // Printed on every run so the number is visible in CI output rather
    // than buried in an assertion.
    console.log(
      `\n[Constitution] ${report.clean}/${report.total} nuggets clean (${pct}%)\n` +
      Object.entries(report.violations)
        .sort((a, b) => b[1] - a[1])
        .map(([code, n]) => `  ${String(n).padStart(4)}  ${code}`)
        .join("\n") +
      `\n\nWorst offenders:\n` +
      report.worst.slice(0, 5)
        .map((w) => `  [${w.codes.join(", ")}]\n    ${w.headline}`)
        .join("\n"),
    );

    expect(report.total).toBeGreaterThan(0);
  });

  // ── Ratchets ────────────────────────────────────────────────────────
  // Thresholds are set from the measured baseline. Tighten freely.

  it("does not regress on total violating nuggets", () => {
    const report = auditCorpus(corpus);
    const violating = report.total - report.clean;
    expect(violating).toBeLessThanOrEqual(BASELINE.violatingNuggets);
  });

  it.each(Object.keys(BASELINE.byCode) as (keyof typeof BASELINE.byCode)[])(
    "does not regress on %s",
    (code) => {
      const report = auditCorpus(corpus);
      expect(report.violations[code] ?? 0).toBeLessThanOrEqual(BASELINE.byCode[code]);
    },
  );

  // The two rules with zero tolerance: both describe copy that shipped,
  // embarrassed us, and was rewritten. Nothing should reintroduce them.
  it("has no taste-patronizing copy anywhere in the corpus", () => {
    const offenders = corpus.filter((n) =>
      checkNugget(n, n.artist).some((v) => v.code === "patronizes-taste"),
    );
    expect(offenders.map((o) => `${o.file}: ${o.headline}`)).toEqual([]);
  });

  it("has no meta-commentary about missing information", () => {
    const offenders = corpus.filter((n) =>
      checkNugget(n, n.artist).some((v) => v.code === "meta-commentary-on-absence"),
    );
    expect(offenders.map((o) => `${o.file}: ${o.headline}`)).toEqual([]);
  });
});
