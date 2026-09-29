# Targeted live generator patch

The 2026-09-28 citation fix was applied to downloaded live source, preserving its deployed constitution and Apple-token module. The repository generator still contains unrelated unshipped work; its deploy guard remains in force.

`fact-source-integrity.patch` records the exact index.ts delta, including source verification, removal of guessed citations and synthetic fallback claims, evidence-aware cache merging, and a pre-existing out-of-scope retry tracker fix needed for Deno checking. Add the repository `_shared/hasFactEvidence.ts`, `_shared/verifyFactSources.ts`, `_shared/generateVerifiedDeepDive.ts` , `_shared/persistStreamedNuggets.ts` , `_shared/normalizeCacheDuration.ts` and `_shared/authorizePaidVerification.ts` to that bundle.

Base index SHA-256: `f0d56fc7534919e85c6b61b6b37e7194b9b6ca04ad2e1bb012eb1168f131dbf4`. Patched index SHA-256: `100387e8c52021f3d8a8c9f7e70971b4c70961ba987796391f7074b0f90d0ba9`. Verify the deployed base before applying; never apply blindly to a newer deployment.

The post-release deep-dive authorization addition is prepared, not deployed. The downloaded live index still hashes to `90aa8ff0919b257bfbbac466d2a343948611dd3def3bf8063c29b1b91215017d`. The candidate adds only the shared authorization import and the gate before the deep-dive helper; keep the deployed constitution and Apple-token module unchanged. Deploy the companion cache-write error check with its shared authorization helper in the same backend update. No migration is needed: both paid paths share the existing durable quota.
