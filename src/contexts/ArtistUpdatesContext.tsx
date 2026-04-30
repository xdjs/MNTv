import { createContext, useContext, type ReactNode } from "react";
import { useUserProfile } from "@/hooks/useMusicNerdState";
import {
  useArtistUpdates,
  type ArtistUpdateGroup,
} from "@/hooks/useArtistUpdates";
import { useTierGate } from "@/contexts/TierGateContext";

/**
 * Hoists the "Your artists, lately" fetch above the route tree so
 * pre-generation starts the moment the user's profile is hydrated —
 * before they navigate to Browse. Same idea as `StoriesProvider`:
 * close the gap between onboarding finishing and Browse rendering,
 * so the first Browse paint has tiles ready instead of skeletons.
 *
 * For returning users, the profile is in localStorage at mount time,
 * so pre-gen fires immediately and Browse is usually warm by first
 * render. For new users, pre-gen fires as soon as `handleTierSelect`
 * saves the profile — during the ~1–2s navigation to Browse, the
 * edge function is already working. On cold starts it's still racey
 * (Gemini's ~5s latency vs. page navigation), but the skeleton state
 * in `ArtistUpdatesSection` masks the gap.
 *
 * `useArtistUpdates` no-ops gracefully when profile is null, so we
 * can mount the provider unconditionally above the protected routes.
 */

interface ArtistUpdatesContextValue {
  groups: ArtistUpdateGroup[];
  loading: boolean;
  totalCount: number;
  readyCount: number;
}

const ArtistUpdatesContext = createContext<ArtistUpdatesContextValue>({
  groups: [],
  loading: false,
  totalCount: 0,
  readyCount: 0,
});

export function ArtistUpdatesProvider({ children }: { children: ReactNode }) {
  const { profile } = useUserProfile();
  const { tierConfirmed } = useTierGate();
  const tier = (profile?.calculatedTier as "casual" | "curious" | "nerd") || "casual";
  // Mirror StoriesProvider: hold off on the artist-updates fan-out until
  // the user has confirmed tier this session, so the warm-up runs at the
  // right tier and we don't burn Gemini at the previously-persisted tier
  // when the user intends to switch on this login.
  const profileForUpdates = tierConfirmed ? profile : null;
  const { groups, loading, totalCount, readyCount } = useArtistUpdates(profileForUpdates, { tier });
  return (
    <ArtistUpdatesContext.Provider value={{ groups, loading, totalCount, readyCount }}>
      {children}
    </ArtistUpdatesContext.Provider>
  );
}

export function useArtistUpdatesContext(): ArtistUpdatesContextValue {
  return useContext(ArtistUpdatesContext);
}
