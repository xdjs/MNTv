// Does the user currently have a fact ON SCREEN?
//
// This exists because "nuggets arrived" and "the user can see a fact" are
// different events, and the loading pill's contract is about the latter.
// The reveal effect in Listen gates display on `nerdActive`, and for
// cached tracks on playback crossing each nugget's timestamp — so
// `trackNuggets.length > 0` can be true for a while with a blank screen.
// Feeding that to the orchestrator dismisses the "researching…" pill
// before anything appears (Pete: "loading state goes away too early
// before a fact actually appears").
//
// When nerd mode is off no nugget will ever be revealed, so holding the
// pill up would hang it forever — in that case fall back to "nuggets
// exist", which is the correct terminus for a pill that has nothing
// left to wait for.
export function isNuggetOnScreen(params: {
  nerdActive: boolean;
  hasActiveNugget: boolean;
  trackNuggetCount: number;
}): boolean {
  const { nerdActive, hasActiveNugget, trackNuggetCount } = params;
  if (!nerdActive) return trackNuggetCount > 0;
  return hasActiveNugget;
}
