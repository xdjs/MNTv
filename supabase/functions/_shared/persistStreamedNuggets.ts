import { normalizeCacheDuration } from "./normalizeCacheDuration.ts";
import { hasFactEvidence } from "./hasFactEvidence.ts";
type Fact = { id?: string; headline?: string; text?: string; sourceId?: string; source?: Record<string, unknown>; [key: string]: unknown };
type Row = { nuggets?: Fact[]; sources?: Record<string, unknown> };
type CacheClient = { from(table: string): {
  select(columns: string): { eq(column: string, value: string): { maybeSingle(): PromiseLike<{ data: unknown; error: unknown }> } };
  upsert(row: Record<string, unknown>, options: { onConflict: string }): PromiseLike<{ error: unknown }>;
} };
/** Persist a completed stream with backend privileges, replacing unsupported
 * legacy rows while preserving supported facts from previous waves. */
export async function persistStreamedNuggets(client: CacheClient | null, options: {
  artist: string; title: string; uri: string; tier: string; listenCount: number;
  durationSec: number; nuggets: Fact[]; externalLinks?: unknown[];
}): Promise<boolean> {
  if (!client) return false;
  const durationSec = normalizeCacheDuration(options.durationSec);
  const supported = options.nuggets.filter(n => hasFactEvidence(n, n.source));
  if (!supported.length) return false;
  const trackId = `real::${options.artist}::${options.title}::::${options.uri}`;
  const key = `${trackId}::${options.tier}`;
  try {
    const { data, error } = await client.from("nugget_cache").select("nuggets, sources").eq("track_id", key).maybeSingle();
    if (error) return false; // An unread row may hold earlier supported waves.
    const prior = data as Row | null;
    const priorFacts = (Array.isArray(prior?.nuggets) ? prior.nuggets : []).filter(n => hasFactEvidence(n, prior?.sources?.[n.sourceId ?? ""] ?? n.source));
    const sources: Record<string, unknown> = { ...(prior?.sources ?? {}), artistSummary: "", externalLinks: options.externalLinks ?? [] };
    const incoming = supported.map((n, i) => {
      const sourceId = `ai-src-${trackId}-L${options.listenCount}-${i}`;
      sources[sourceId] = { ...n.source, id: sourceId };
      return { ...n, source: undefined, id: `ai-nug-${trackId}-L${options.listenCount}-${i}`, trackId, sourceId,
        timestampSec: Math.max(0, Math.min(Math.floor(i * Math.max(durationSec - 15, 30) / Math.max(supported.length - 1, 1)), durationSec - 10)), durationMs: 7000 };
    });
    const ids = new Set(incoming.map(n => n.id));
    const headlines = new Set(incoming.map(n => n.headline?.trim().toLowerCase()));
    const nuggets = [...priorFacts.filter(n => !ids.has(n.id ?? "") && !headlines.has(n.headline?.trim().toLowerCase())), ...incoming];
    const { error: writeError } = await client.from("nugget_cache").upsert({ track_id: key, nuggets, sources, status: "ready" }, { onConflict: "track_id" });
    if (writeError) return false;
    return true;
  } catch { return false; }
}
