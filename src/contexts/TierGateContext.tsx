import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { useUserProfile } from "@/hooks/useMusicNerdState";
import type { UserProfile } from "@/mock/types";

/**
 * Per-session "tier confirmed for this login" flag.
 *
 * Why: Pete's ask — "I should be able to pick my tier every time I log in,
 * and stories / artist-updates should NOT start warming up until I've
 * confirmed it." Stories pre-gen and artist-updates fan-out are both
 * expensive Gemini calls keyed off tier; if the user wants to switch tier
 * on login, kicking off warm-up at the OLD tier wastes the budget and
 * delays the new-tier results.
 *
 * Backed by sessionStorage so the flag clears when the tab closes (a
 * fresh login is required to set it again). localStorage would persist
 * across sessions, which defeats the "every time I log in" requirement.
 *
 * The flag is *gates pre-gen*, not navigation. Returning users still land
 * on /preparing after sign-in; /preparing renders a tier-pick UI when
 * `tierConfirmed === false`, then transitions to the warmup spinner once
 * the user confirms.
 */

const STORAGE_KEY = "musicnerd_tier_confirmed";

interface TierGateContextValue {
  tierConfirmed: boolean;
  confirmTier: (tier: NonNullable<UserProfile["calculatedTier"]>) => void;
  resetTierConfirmation: () => void;
}

const TierGateContext = createContext<TierGateContextValue>({
  tierConfirmed: false,
  confirmTier: () => {},
  resetTierConfirmation: () => {},
});

function readSessionFlag(): boolean {
  try {
    return sessionStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    // Storage disabled — degrade to "always require confirmation".
    return false;
  }
}

export function TierGateProvider({ children }: { children: ReactNode }) {
  const { profile, saveProfile } = useUserProfile();
  const [tierConfirmed, setTierConfirmed] = useState<boolean>(() => readSessionFlag());

  // Sync flag across tabs / late-mounting consumers via a custom event.
  // sessionStorage doesn't fire `storage` events for same-document writes,
  // so we dispatch our own.
  useEffect(() => {
    function onConfirmEvent() {
      setTierConfirmed(readSessionFlag());
    }
    window.addEventListener("musicnerd:tier-confirmed", onConfirmEvent);
    return () => window.removeEventListener("musicnerd:tier-confirmed", onConfirmEvent);
  }, []);

  const confirmTier = useCallback(
    (tier: NonNullable<UserProfile["calculatedTier"]>) => {
      // Persist the tier choice into the user's profile if it changed,
      // so a change-and-confirm flow on /preparing actually updates the
      // tier (otherwise the next page would still see the old tier).
      if (profile && profile.calculatedTier !== tier) {
        saveProfile({ ...profile, calculatedTier: tier });
      }
      try {
        sessionStorage.setItem(STORAGE_KEY, "1");
      } catch {
        // Storage disabled — fall through; in-memory state still flips.
      }
      setTierConfirmed(true);
      window.dispatchEvent(new Event("musicnerd:tier-confirmed"));
    },
    [profile, saveProfile],
  );

  const resetTierConfirmation = useCallback(() => {
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // Storage disabled — fall through.
    }
    setTierConfirmed(false);
    window.dispatchEvent(new Event("musicnerd:tier-confirmed"));
  }, []);

  return (
    <TierGateContext.Provider value={{ tierConfirmed, confirmTier, resetTierConfirmation }}>
      {children}
    </TierGateContext.Provider>
  );
}

export function useTierGate(): TierGateContextValue {
  return useContext(TierGateContext);
}
