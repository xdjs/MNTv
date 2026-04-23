#!/usr/bin/env npx tsx
// Score all seed nuggets against the Music Nerd Constitution criteria.
// Usage: npx tsx scripts/score-seeds.ts

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
// Canonical weights live alongside the runtime Constitution so we can't drift
// on renames (e.g. curiosityGap → factClarity). constitution.ts has no Deno
// APIs, so tsx resolves it fine despite living under supabase/functions/.
import {
  CONSTITUTION_SCORING_CRITERIA,
  MAX_CONSTITUTION_SCORE,
} from "../supabase/functions/generate-nuggets/constitution";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SCORING = CONSTITUTION_SCORING_CRITERIA;
const MAX_SCORE = MAX_CONSTITUTION_SCORE;

const COMMON_WORDS = new Set(["The", "This", "That", "These", "When", "Where", "What", "How", "His", "Her", "Its", "After", "Before", "During", "From", "Into", "With", "About", "Also", "But", "And", "For", "Not", "All", "Any", "Each", "Every", "Both", "Such", "If", "In", "On", "At", "To", "Of", "A", "An", "By", "As", "Or", "So", "He", "She", "It", "They", "We", "You", "I"]);

const HALLUCINATED_PUBLISHERS = ["music data insights", "internal data", "musicdatainsights", "ai music database", "music insights", "artist database", "music analytics", "song insights", "track insights", "musicmetricsvault", "musicmetrics", "metricsvault"];

const VAGUE_HEADLINE_NOUNS = ["digital footprint", "artistic journey", "creative vision", "creative evolution", "musical identity", "sonic identity", "artistic identity", "musical journey", "creative journey", "musical legacy", "artistic legacy", "musical tapestry", "creative process", "artistic evolution", "musical evolution", "artistic vision", "cultural impact", "musical landscape", "creative spirit", "artistic spirit"];

const VAGUE_HEADLINE_VERBS = ["takes shape", "comes to life", "comes alive", "takes flight", "takes center stage", "takes root", "emerges", "unfolds", "evolves", "continues", "begins", "shines through"];

const VAGUE_PATTERNS = [/^the story behind\b/i, /^where .+ meets\b/i, /^a deeper look at\b/i, /^beyond the\b/i, /^inside the\b/i, /^more than just a\b/i, /^how .+ is reshaping\b/i, /\bunique approach\b/i, /^an? emerging voice\b/i, /^the rise of\b/i, /^exploring the\b/i, /^the art of\b/i, /^a journey through\b/i, /^the beauty of\b/i, /^unveiling\b/i, /^the power of\b/i, /^a new chapter\b/i, /\bthis artist\b/i, /\bthis musician\b/i, /^the (sound|music|art) of\b/i, /\bblending .+ and\b/i, /\bpushes? (?:the )?boundar/i, /\bdefies? (?:easy )?categori/i];

const BIOGRAPHY_OPENERS = [/^(born|raised|grew up|hails from|is a|comes from|was born|originally from)\b/i];

function extractProperNouns(text: string, artistLower: string): string[] {
  const matches: string[] = [];
  const re = /\b([A-Z][A-Za-z'.&-]*(?:\s+[A-Z][A-Za-z'.&-]*){0,3})\b/g;
  let match;
  while ((match = re.exec(text)) !== null) {
    const name = match[1].trim();
    const firstWord = name.split(/\s+/)[0];
    if (!COMMON_WORDS.has(firstWord) && name.toLowerCase() !== artistLower && name.length > 2) {
      matches.push(name);
    }
  }
  return [...new Set(matches)];
}

function scoreNugget(n: any, artistLower: string): { score: number; failures: string[] } {
  let score = 0;
  const failures: string[] = [];
  const text = `${n.headline || ""} ${n.text || ""}`;
  const headline = (n.headline || "").toLowerCase();
  const properNouns = extractProperNouns(text, artistLower);

  if (properNouns.length >= 1) score += SCORING.specificity; else failures.push("specificity");
  if (properNouns.length >= 2) score += SCORING.connection; else failures.push("connection");
  if (!BIOGRAPHY_OPENERS.some(p => p.test(headline))) score += SCORING.novelty; else failures.push("novelty");
  const wc = text.split(/\s+/).filter(Boolean).length;
  if (wc <= 120) score += SCORING.brevity; else failures.push(`brevity(${wc}w)`);

  const publisher = (n.source?.publisher || "").toLowerCase();
  const sourceType = (n.source?.type || "").toLowerCase();
  const hallucinatedType = ["internal-data", "internal_data", "database", "editorial"].includes(sourceType);
  const hallucinatedPub = HALLUCINATED_PUBLISHERS.some(hp => publisher.includes(hp));
  if (!hallucinatedType && !hallucinatedPub) score += SCORING.realSource; else failures.push("source");

  let vagueHeadline = VAGUE_HEADLINE_NOUNS.some(n => headline.includes(n)) || VAGUE_HEADLINE_VERBS.some(v => headline.includes(v)) || VAGUE_PATTERNS.some(p => p.test(n.headline || ""));
  if (!vagueHeadline) score += SCORING.factClarity; else failures.push("headline");

  return { score, failures };
}

const seedDir = path.join(__dirname, "..", "src", "data", "seed");
const files = fs.readdirSync(seedDir).filter(f => f.endsWith(".json")).sort();

const results: { file: string; scores: number[]; avg: number; failures: Record<string, number> }[] = [];
const globalFailures: Record<string, number> = {};

for (const file of files) {
  const data = JSON.parse(fs.readFileSync(path.join(seedDir, file), "utf-8"));
  const nuggets = data.nuggets || [];
  const artistLower = file.split("-")[0].toLowerCase();
  const scores: number[] = [];
  const fileFailures: Record<string, number> = {};

  for (const n of nuggets) {
    const { score, failures } = scoreNugget(n, artistLower);
    scores.push(score);
    for (const f of failures) {
      const key = f.replace(/\(\d+w\)/, "");
      fileFailures[key] = (fileFailures[key] || 0) + 1;
      globalFailures[key] = (globalFailures[key] || 0) + 1;
    }
  }

  const avg = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
  results.push({ file, scores, avg, failures: fileFailures });
}

console.log(`\n# Constitution Score Report — ${files.length} seed files\n`);
console.log(`| File | Nuggets | Scores | Avg | Top Failures |`);
console.log(`|------|---------|--------|-----|-------------|`);

for (const r of results) {
  const topFails = Object.entries(r.failures).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${k}(${v})`).join(", ") || "none";
  console.log(`| ${r.file} | ${r.scores.length} | ${r.scores.join(",")} | ${r.avg.toFixed(1)}/${MAX_SCORE} | ${topFails} |`);
}

const allScores = results.flatMap(r => r.scores);
const globalAvg = allScores.length > 0 ? allScores.reduce((a, b) => a + b, 0) / allScores.length : 0;

console.log(`\n**Global average**: ${globalAvg.toFixed(1)}/${MAX_SCORE} across ${allScores.length} nuggets`);
console.log(`\n**Most common failures**:`);
for (const [k, v] of Object.entries(globalFailures).sort((a, b) => b[1] - a[1])) {
  console.log(`- ${k}: ${v}/${allScores.length} nuggets (${(v/allScores.length*100).toFixed(0)}%)`);
}
