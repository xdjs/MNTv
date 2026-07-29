// Does the user currently have a fact ON SCREEN?
//
// This exists because "nuggets arrived" and "the user can see a fact" are
// different events, and the loading pill's contract is about the latter.
// The reveal effect in Listen gates display on `nerdActive`, and for
// cached tracks on playback crossing each nugget's timestamp — so
// "nuggets exist" can be true for a while with a blank screen. Feeding
// that to the orchestrator dismisses the "researching…" pill before
// anything appears.
//
// The active nugget must also belong to the CURRENT track. `activeNugget`
// is React state that only resets an effect-tick after the route changes,
// while the track's nugget list is a memo that recomputes synchronously.
// So during a track change the PREVIOUS track's nugget is briefly still
// active; counting that as "a fact is on screen" dismisses the pill the
// instant the new track loads, and the user never sees that research
// started (Pete: "we got a new track playing from an already playing
// track, but the researching loading state isn't there").
//
// When nerd mode is off no nugget will ever be revealed, so holding the
// pill up would hang it forever — fall back to "nuggets exist", the
// correct terminus for a pill with nothing left to wait for.
export function isNuggetOnScreen(params: {
  nerdActive: boolean;
  activeNuggetId: string | null | undefined;
  trackNuggets: readonly { id: string }[];
}): boolean {
  const { nerdActive, activeNuggetId, trackNuggets } = params;
  if (!nerdActive) return trackNuggets.length > 0;
  if (!activeNuggetId) return false;
  return trackNuggets.some((n) => n.id === activeNuggetId);
}
