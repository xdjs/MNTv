# Targeted live generator patch

The 2026-09-28 citation fix was applied to downloaded live source, preserving its deployed constitution and Apple-token module. The repository generator still contains unrelated unshipped work; its deploy guard remains in force.

`fact-source-integrity.patch` records the exact index.ts delta, including source verification, removal of guessed citations and synthetic fallback claims, evidence-aware cache merging, and a pre-existing out-of-scope retry tracker fix needed for Deno checking. Add the repository `_shared/hasFactEvidence.ts`, `_shared/verifyFactSources.ts`, `_shared/generateVerifiedDeepDive.ts` , `_shared/persistStreamedNuggets.ts` and `_shared/normalizeCacheDuration.ts` to that bundle.

Base index SHA-256: `f0d56fc7534919e85c6b61b6b37e7194b9b6ca04ad2e1bb012eb1168f131dbf4`. Patched index SHA-256: `90aa8ff0919b257bfbbac466d2a343948611dd3def3bf8063c29b1b91215017d`. Verify the deployed base before applying; never apply blindly to a newer deployment.
