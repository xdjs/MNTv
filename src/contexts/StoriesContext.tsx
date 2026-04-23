import { createContext, useContext, type ReactNode } from "react";
import { useUserProfile } from "@/hooks/useMusicNerdState";
import { usePreGeneratedStories, type Story } from "@/hooks/usePreGeneratedStories";

// Stories state lives here instead of in Browse so pre-generation starts the
// moment the user's profile is hydrated — not when they navigate to Browse.
// This closes the window where onboarding finishes but stories haven't begun
// warming, which was the source of "I got to Browse and the rings were gray."
interface StoriesContextValue {
  stories: Story[];
  loading: boolean;
}

const StoriesContext = createContext<StoriesContextValue>({ stories: [], loading: false });

export function StoriesProvider({ children }: { children: ReactNode }) {
  const { profile } = useUserProfile();
  const tier = (profile?.calculatedTier as "casual" | "curious" | "nerd") || "casual";
  // usePreGeneratedStories no-ops gracefully when profile is null, so we can
  // mount the provider unconditionally above the protected routes.
  const { stories, loading } = usePreGeneratedStories(profile, { tier });
  return (
    <StoriesContext.Provider value={{ stories, loading }}>
      {children}
    </StoriesContext.Provider>
  );
}

export function useStoriesContext(): StoriesContextValue {
  return useContext(StoriesContext);
}
