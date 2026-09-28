import { useEffect, useRef, useState } from 'react';

/** Coalesce settled snapshots, serialize uploads, and retry without exhausting
 * the three-per-minute verification quota. Failed snapshots are never deduped. */
export function useCompanionUpload(key: string, signature: string, busy: boolean,
  upload: (isCurrent: () => boolean) => Promise<void>) {
  const latest = useRef({ key, upload });
  latest.current = { key, upload };
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
        await latest.current.upload(() => mounted.current && latest.current.key === key);
        if (mounted.current && latest.current.key === key) sent.current.set(key, signature);
      } catch (error) {
        console.warn('[Companion] Upload failed; retrying after quota cooldown', error);
      } finally {
        inFlight.current = false;
        if (mounted.current) setRevision(value => value + 1);
      }
    }, Math.max(1500, nextAllowed.current - Date.now()));
    return () => clearTimeout(timer);
  }, [key, signature, busy, revision]);
}
