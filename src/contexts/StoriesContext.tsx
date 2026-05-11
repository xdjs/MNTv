import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useUserProfile } from "@/hooks/useMusicNerdState";
import { usePreGeneratedStories, type Story } from "@/hooks/usePreGeneratedStories";
import { useTierGate } from "@/contexts/TierGateContext";
import { selectStorySource, type StorySourceResult } from "@/lib/storySource";
import { readVisited } from "@/lib/storyVisited";

// Stories state lives here instead of in Browse so pre-generation starts the
// moment the user's profile is hydrated — not when they navigate to Browse.
// This closes the window where onboarding finishes but stories haven't begun
// warming, which was the source of "I got to Browse and the rings were gray."
//
// TierGate: Pete asked for a tier-pick step on every login, BEFORE we burn
// Gemini calls warming stories at whatever tier was last persisted. We pass
// `null` to usePreGeneratedStories (which no-ops gracefully) until the user
// has confirmed tier this session — that gating happens on /preparing.
//
// Source cascade: stories are sourced from the user's recently-liked
// tracks (15d → 30d → 60d → 365d → all liked → fall back to topTracks),
// excluding any track the user has already tapped this session. See
// src/lib/storySource.ts for the full window logic.
const TARGET_STORY_COUNT = 5;

interface StoriesContextValue {
  stories: Story[];
  loading: boolean;
  /** Which cascade stage the current rail is sourced from. Useful for
   *  observability and downstream UI (e.g. "you're on fresh likes"). */
  storySource: StorySourceResult["source"];
}

const StoriesContext = createContext<StoriesContextValue>({
  stories: [],
  loading: false,
  storySource: "empty",
});

export function StoriesProvider({ children }: { children: ReactNode }) {
  const { profile } = useUserProfile();
  const { tierConfirmed } = useTierGate();
  const tier = (profile?.calculatedTier as "casual" | "curious" | "nerd") || "casual";

  // Visited-set version counter. Bumped on each "musicnerd:visited-changed"
  // event so the source selection re-runs (and the rail recomputes its
  // pool) when a story is tapped. Bare ref read won't trigger a render,
  // so we mirror the changes into state.
  const [visitedVersion, setVisitedVersion] = useState(0);
  useEffect(() => {
    function onChanged() { setVisitedVersion((v) => v + 1); }
    window.addEventListener("musicnerd:visited-changed", onChanged);
    window.addEventListener("storage", onChanged); // cross-tab visited writes
    return () => {
      window.removeEventListener("musicnerd:visited-changed", onChanged);
      window.removeEventListener("storage", onChanged);
    };
  }, []);

  // Build the source list synchronously based on current profile +
  // visited state. This is the input to pre-gen.
  const sourceResult = useMemo(() => {
    const visited = readVisited();
    return selectStorySource(profile, TARGET_STORY_COUNT, visited);
    // visitedVersion is intentionally a dep so re-tap recomputes the
    // cascade. profile changes (taste refresh) also re-trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile, profile?.likedTracks, profile?.trackImages, visitedVersion]);

  // Synthesize a stand-in profile for pre-gen — same shape, just with
  // trackImages narrowed to the cascade-selected tracks. The hook
  // already keys off trackImages content; this is the simplest way to
  // route the new source through without changing the hook's signature.
  const profileForPreGen = useMemo(() => {
    if (!tierConfirmed || !profile) return null;
    return { ...profile, trackImages: sourceResult.tracks };
  }, [tierConfirmed, profile, sourceResult.tracks]);

  const { stories, loading } = usePreGeneratedStories(profileForPreGen, { tier, maxStories: TARGET_STORY_COUNT });

  // Production-visible: log which cascade stage we're on.
  useEffect(() => {
    if (!profile || !tierConfirmed) return;
    console.log(`[Stories] source=${sourceResult.source} (${sourceResult.tracks.length} tracks)`);
  }, [sourceResult.source, sourceResult.tracks.length, profile, tierConfirmed]);

  return (
    <StoriesContext.Provider value={{ stories, loading, storySource: sourceResult.source }}>
      {children}
    </StoriesContext.Provider>
  );
}

export function useStoriesContext(): StoriesContextValue {
  return useContext(StoriesContext);
}
