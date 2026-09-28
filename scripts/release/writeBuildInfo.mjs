import { mkdirSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

// Public identity only. Never serialize process.env or credentials into the bundle.
export function buildInfo(env = process.env) {
  const environment = env.VERCEL_TARGET_ENV || env.VERCEL_ENV || 'local';
  const sha = env.VERCEL_GIT_COMMIT_SHA || env.GITHUB_SHA || null;
  if (['staging', 'production'].includes(environment) && !/^[a-f0-9]{40}$/.test(sha || '')) {
    throw new Error('Release builds require a Vercel Git commit SHA');
  }
  if (['staging', 'production'].includes(environment)) {
    for (const key of ['VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY', 'VITE_SPOTIFY_CLIENT_ID']) {
      if (!env[key]?.trim()) throw new Error(`Release builds require ${key}`);
    }
  }
  return { sha, environment };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const info = buildInfo();
  mkdirSync('public', { recursive: true });
  writeFileSync('public/release.json', JSON.stringify(info) + '\n');
}
