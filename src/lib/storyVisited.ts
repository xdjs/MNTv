// Visited-stories tracking. Single source of truth for "the user has
// tapped this story recently." Both StoriesContext (cascade pool
// exclusion) and StoriesRail (display filter — visited stories
// disappear) read from here so they stay in sync.
//
// Storage: localStorage. 7d TTL (Pete 2026-05-10) — long enough that
// a user who circles back later in the week doesn't see the same
// story they already explored, short enough that a tap from the prior
// month doesn't permanently bury a track. Entries older than the TTL
// are pruned on read. Per-device (no DB roundtrip needed for the rail
// to react to taps).

const VISITED_KEY = "musicnerd_visited_stories";
const VISITED_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type VisitedMap = Map<string, number>;

export function readVisited(): VisitedMap {
  try {
    const raw = localStorage.getItem(VISITED_KEY);
    if (!raw) return new Map();
    const parsed = JSON.parse(raw) as Record<string, number>;
    const now = Date.now();
    const out = new Map<string, number>();
    for (const [k, ts] of Object.entries(parsed)) {
      if (typeof ts === "number" && now - ts < VISITED_TTL_MS) out.set(k, ts);
    }
    return out;
  } catch {
    return new Map();
  }
}

export function writeVisited(m: VisitedMap): void {
  try {
    const obj: Record<string, number> = {};
    m.forEach((v, k) => { obj[k] = v; });
    localStorage.setItem(VISITED_KEY, JSON.stringify(obj));
  } catch { /* noop */ }
}

export function isVisited(trackKey: string, m?: VisitedMap): boolean {
  const map = m ?? readVisited();
  return map.has(trackKey);
}

/** Mark a story visited and persist. Returns the updated map for callers
 *  that hold reactive state (e.g. StoriesRail). */
export function markVisited(trackKey: string, m?: VisitedMap): VisitedMap {
  const next = new Map(m ?? readVisited());
  next.set(trackKey, Date.now());
  writeVisited(next);
  // Notify other consumers in the same tab. Cross-tab is handled by
  // localStorage's native `storage` event automatically.
  try {
    window.dispatchEvent(new Event("musicnerd:visited-changed"));
  } catch { /* SSR safety */ }
  return next;
}
