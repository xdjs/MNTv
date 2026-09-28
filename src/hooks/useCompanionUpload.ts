import { useEffect, useRef, useState } from 'react';

/** Coalesce settled snapshots, serialize uploads, and retry without exhausting
 * the three-per-minute verification quota. Failed snapshots are never deduped. */
export function useCompanionUpload(key: string, signature: string, busy: boolean,
  upload: (isCurrent: () => boolean) => Promise<void>) {
  const latest = useRef({ key, upload, generation: 0 });
  const generation = latest.current.generation + (latest.current.key === key ? 0 : 1);
  latest.current = { key, upload, generation };
  const mounted = useRef(false);
  const sent = useRef(new Map<string, string>());
  const attempts = useRef(new Map<string, number>());
  const inFlight = useRef(false);
  const nextAllowed = useRef(0);
  const [revision, setRevision] = useState(0);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    const attemptKey = JSON.stringify([key, signature]);
    if (!key || !signature || busy || inFlight.current || sent.current.get(key) === signature || (attempts.current.get(attemptKey) ?? 0) >= 3) return;
    const timer = setTimeout(async () => {
      inFlight.current = true;
      nextAllowed.current = Date.now() + 65000;
      attempts.current.set(attemptKey, (attempts.current.get(attemptKey) ?? 0) + 1);
      try {
        await latest.current.upload(() => mounted.current && latest.current.generation === generation);
        if (mounted.current && latest.current.generation === generation) sent.current.set(key, signature);
      } catch (error) {
        console.warn('[Companion] Upload failed; retrying after quota cooldown', error);
      } finally {
        inFlight.current = false;
        if (mounted.current) setRevision(value => value + 1);
      }
    }, Math.max(1500, nextAllowed.current - Date.now()));
    return () => clearTimeout(timer);
  }, [key, signature, busy, revision, generation]);
  return !!key && !!signature && !busy && sent.current.get(key) === signature;
}
