import test from 'node:test';
import assert from 'node:assert/strict';
import { buildInfo } from './writeBuildInfo.mjs';

const sha = 'a'.repeat(40);
const frontend = { VITE_SUPABASE_URL: 'https://test-project.supabase.co',
  VITE_SUPABASE_PUBLISHABLE_KEY: 'test-anon-key', VITE_SPOTIFY_CLIENT_ID: 'test-client' };
test('custom staging takes precedence over the preview target and excludes secrets', () => {
  assert.deepEqual(buildInfo({ ...frontend, VERCEL_TARGET_ENV: 'staging', VERCEL_ENV: 'preview',
    VERCEL_GIT_COMMIT_SHA: sha, SECRET: 'private' }), { sha, environment: 'staging' });
});
test('release builds reject missing frontend configuration without printing values', () => {
  for (const key of Object.keys(frontend)) {
    assert.throws(() => buildInfo({ ...frontend, [key]: '', VERCEL_TARGET_ENV: 'production',
      VERCEL_GIT_COMMIT_SHA: sha }), { message: `Release builds require ${key}` });
  }
});
test('production and staging fail closed without source identity', () => {
  for (const environment of ['staging', 'production']) {
    assert.throws(() => buildInfo({ VERCEL_TARGET_ENV: environment }), /commit SHA/);
    assert.throws(() => buildInfo({ VERCEL_TARGET_ENV: environment, VERCEL_GIT_COMMIT_SHA: 'bad' }), /commit SHA/);
  }
});
test('local builds need no Vercel credentials', () => {
  assert.deepEqual(buildInfo({}), { sha: null, environment: 'local' });
});
