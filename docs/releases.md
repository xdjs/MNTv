# Main-only releases

`main` is the only persistent development branch. Create short-lived branches from current
`main`, open PRs to `main`, pass `test` and `build`, resolve review findings, and squash merge.
Feature branches retain Vercel Preview deployments. Merging is not production approval.

This workflow is adapted from [MusicNerdWeb's release workflow](https://github.com/xdjs/MusicNerdWeb/blob/d4a417d4923e7840063146e881935bf5e66dfcbd/.github/workflows/ci.yml)
and [release runner](https://github.com/xdjs/MusicNerdWeb/blob/d4a417d4923e7840063146e881935bf5e66dfcbd/scripts/release/runRelease.mjs).
MMTV is a Vite SPA, so its smoke checks verify build identity, the HTML application shell,
and its JavaScript entry asset instead of MusicNerdWeb's server-side `/api/health` endpoint.

## Release sequence

1. A push to `main` runs the application tests, release regression tests, and frontend build.
   CI also runs for PRs, but PRs cannot release or receive deployment secrets.
2. With repository variable `RELEASES_ENABLED=true`, `staging-release` asks Vercel to build
   that exact commit in its custom `staging` environment. The build requires a Git SHA and
   the frontend configuration. The release runner verifies deployment project, SHA,
   environment and Ready state, then checks `/release.json`, `/`, and the referenced
   JavaScript entry on the immutable deployment URL. It verifies that
   `staging.mntv.musicnerd.xyz` points to this deployment and records the evidence.
3. `production-release` waits for approval in the protected GitHub Environment.
   Any one of `clt`, `p3t3rango`, or `sweetmantech` can approve, including the initiator.
   Admin bypass is disabled. Review the staging URL and release artifact, and verify
   feature-specific login, playback and companion behavior before approving.
4. After approval, the runner rejects stale main commits and rechecks the staged deployment.
   It builds a **separate production candidate from the same SHA**, using production variables.
   Automatic production domain assignment must remain disabled. It smoke-tests the
   immutable candidate, rechecks main, then promotes it through Vercel's API.
5. The job succeeds only after both the production project target and
   `mntv.musicnerd.xyz` point to the candidate. Deployment records are retained as Actions
   artifacts for 90 days and linked in the job summary.

Vite embeds public variables at build time. Never promote a staging/preview build directly
into production. Release jobs use separate staging and production concurrency groups with
cancellation disabled. A delayed approval for an older SHA fails closed; use the latest
passing main run. If a job is cancelled during a remote build, wait for or cancel that
Vercel build before starting another release. Staging's domain is assigned when its build
becomes Ready; failed smoke checks can leave a bad staging site but block production.

## Configuration

- Vercel project: `musicnerd/mntv`; production branch: `main`; system environment variables enabled.
- Build command: unset or `npm run build`; Node.js 24 (matching `.nvmrc`).
- Auto-assign Custom Production Domains: **disabled**.
- `vercel.json` disables Git auto-deployment for `main`; other branches retain previews.
- Custom environment `staging`: no branch matcher, only `staging.mntv.musicnerd.xyz` attached.
  Its frontend variables were copied from the existing Preview configuration.
- GitHub Environments `staging-release` and `production-release`: only branch `main` allowed.
  Production uses the reviewers above; staging has no approval wait.
- Both environments need a `VERCEL_TOKEN` secret scoped to the MMTV project where supported.
  A CLI OAuth login is not a persistent CI token. Record its expiry and rotate it before then.
  If deployment protection is enabled later, add `VERCEL_AUTOMATION_BYPASS_SECRET` to both
  environments. The runner sends that credential only to verified immutable Vercel URLs.
- Repository variables: `VERCEL_PROJECT_ID=prj_n2jwu5D41dc4659izTLU4QDkIrpO`,
  `VERCEL_ORG_ID=team_cdz3kA179XUTUNZgMSfko0x4`, and `RELEASES_ENABLED`.
  Leave releases disabled until the token and Vercel settings are verified. Enabling the
  switch takes effect on the next main push or manual **CI** run on main.
- Main requires GitHub Actions checks `test` and `build`; squash-only merging matches
  MusicNerdWeb's live rules. Existing review integrations continue operating.

The test job supplies dummy public client configuration, allowing tests to run without
production credentials. CI's build is a compilation check; Vercel performs the actual
staging and production builds with their respective environment configuration.

## Backend scope and acceptance

This is a frontend release pipeline. MMTV's existing Preview and Production variables point
to the same backend; custom staging preserves that configuration. It does not provide
isolated staging data, auth or edge functions. The workflow never deploys Supabase functions
or runs database migrations. Backend deployment remains a separate operation; preserve the
existing `generate-nuggets` deployment guard. Confirm backend compatibility before approving
production. The Supabase/storage isolation guards in MusicNerdWeb are specific to that app
and are not represented as passing checks here.

The automated smoke checks establish that the expected frontend build is served, not that
real login, streaming, data writes or AI generation work. Those need feature-specific staging
acceptance. Historical staging-to-main notes in other documents describe the former process;
[AGENTS.md](../AGENTS.md) is the canonical agent guide; this runbook provides the operational details.

## Failure and rollback

A failure before promotion leaves production on its previous deployment. A promotion or
alias-verification failure may occur after a domain has moved: inspect Vercel before retrying.
The pipeline never silently rolls back. For an explicitly authorized rollback, select a
previous **production-built** deployment in Vercel and verify the production domain and
frontend. Use another explicit rollback to restore a newer deployment; Vercel's Undo Rollback
can re-enable automatic domain assignment. Verify that setting remains disabled afterward.

Before this transition, production was deployment `dpl_7NMqd5LfgPdGAcyKfDc1nN51Jf6h`
at SHA `c184b9c7c182a1b8fd5848294a3bc08d3e2cfeac`. The legacy staging branch was at
`c6b6f69b99891fb71168f3f8cbcacbfd92e9466f`, fully reachable from main. Preserve its history
with annotated tag `archive/staging-2026-09-28` before retiring the remote branch, after the
new staging pipeline is verified. Do not delete unrelated feature or backup branches.

## Local verification

```sh
VITE_SUPABASE_URL=https://test-project.supabase.co \
VITE_SUPABASE_PUBLISHABLE_KEY=test-anon-key npm test
npm run test:release
npm run build
```
