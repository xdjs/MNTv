import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useBackgroundTasteRefresh } from "@/hooks/useBackgroundTasteRefresh";
import { useArtistUpdatesContext } from "@/contexts/ArtistUpdatesContext";

/**
 * Aggregates the user-visible refresh signals into one place so a single
 * indicator can surface them. Each source still owns its own loading
 * state (artist-updates skeletons in their rail); this context exists so
 * a global header indicator can show "something is refreshing" without
 * those sources having to coordinate.
 *
 * What's NOT included here: pre-generated stories. Stories pre-gen is
 * opportunistic background work (warms the per-track nugget cache so a
 * future tap is instant) — not user-blocking. Including it made the
 * indicator linger for 60-120s after first paint while Gemini pre-gen
 * burned through 5 cold-start calls, which made it feel like Browse
 * wasn't done loading even though it was fully usable.
 *
 * Mounted near the top of the tree (in App.tsx) so all sources are
 * already in scope.
 */

interface RefreshIndicatorState {
  tasteRefreshing: boolean;
  artistUpdatesRefreshing: boolean;
  /** Convenience — true if any user-visible refresh is in flight. */
  any: boolean;
  /** Human-readable label describing what's loading. Picks one signal
   *  (taste > artist updates) so the user sees a specific message
   *  rather than a generic "loading". */
  label: string | null;
}

const RefreshIndicatorContext = createContext<RefreshIndicatorState | null>(null);

export function RefreshIndicatorProvider({ children }: { children: ReactNode }) {
  const { refreshing: tasteRefreshing } = useBackgroundTasteRefresh();
  const { loading: artistUpdatesRefreshing } = useArtistUpdatesContext();

  const value = useMemo<RefreshIndicatorState>(() => {
    const any = tasteRefreshing || artistUpdatesRefreshing;
    const label = tasteRefreshing
      ? "Refreshing your library"
      : artistUpdatesRefreshing
        ? "Loading artist updates"
        : null;
    return { tasteRefreshing, artistUpdatesRefreshing, any, label };
  }, [tasteRefreshing, artistUpdatesRefreshing]);

  return (
    <RefreshIndicatorContext.Provider value={value}>
      {children}
    </RefreshIndicatorContext.Provider>
  );
}

export function useRefreshIndicator(): RefreshIndicatorState {
  const ctx = useContext(RefreshIndicatorContext);
  if (!ctx) {
    throw new Error("useRefreshIndicator must be used within RefreshIndicatorProvider");
  }
  return ctx;
}
