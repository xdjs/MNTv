import { createContext, useContext, type ReactNode } from "react";
import { useUserProfile } from "@/hooks/useMusicNerdState";
import { usePreGeneratedStories, type Story } from "@/hooks/usePreGeneratedStories";
import { useTierGate } from "@/contexts/TierGateContext";

// Stories state lives here instead of in Browse so pre-generation starts the
// moment the user's profile is hydrated — not when they navigate to Browse.
// This closes the window where onboarding finishes but stories haven't begun
// warming, which was the source of "I got to Browse and the rings were gray."
//
// TierGate: Pete asked for a tier-pick step on every login, BEFORE we burn
// Gemini calls warming stories at whatever tier was last persisted. We pass
// `null` to usePreGeneratedStories (which no-ops gracefully) until the user
// has confirmed tier this session — that gating happens on /preparing.
interface StoriesContextValue {
  stories: Story[];
  loading: boolean;
}

const StoriesContext = createContext<StoriesContextValue>({ stories: [], loading: false });

export function StoriesProvider({ children }: { children: ReactNode }) {
  const { profile } = useUserProfile();
  const { tierConfirmed } = useTierGate();
  const tier = (profile?.calculatedTier as "casual" | "curious" | "nerd") || "casual";
  // Pass `null` profile until tier-gate clears, which suppresses pre-gen.
  // The hook is built to no-op on null, so this also covers the
  // pre-onboarding window before profile exists.
  const profileForPreGen = tierConfirmed ? profile : null;
  const { stories, loading } = usePreGeneratedStories(profileForPreGen, { tier });
  return (
    <StoriesContext.Provider value={{ stories, loading }}>
      {children}
    </StoriesContext.Provider>
  );
}

export function useStoriesContext(): StoriesContextValue {
  return useContext(StoriesContext);
}
