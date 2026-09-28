import { useEffect, useRef, useState } from 'react';
type UploadSession = { accepted: Map<string, string>; nextAllowed: number };
// Page-session cache survives route unmounts; never persisted across reloads.
const uploadSession: UploadSession = { accepted: new Map(), nextAllowed: 0 };

/** Coalesce settled snapshots, serialize uploads, and retry without exhausting
 * the three-per-minute verification quota. Failed snapshots are never deduped. */
export function useCompanionUpload(key: string, signature: string, busy: boolean,
  upload: (isCurrent: () => boolean, signal: AbortSignal) => Promise<void>, session: UploadSession = uploadSession) {
  const latest = useRef({ key, upload, generation: 0 });
  const generation = latest.current.generation + (latest.current.key === key ? 0 : 1);
  latest.current = { key, upload, generation };
  const mounted = useRef(false);
  const activeRequest = useRef<AbortController | null>(null);
  const attempts = useRef(new Map<string, number>());
  const inFlight = useRef(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; activeRequest.current?.abort(); }; }, []);
  useEffect(() => {
    const attemptKey = JSON.stringify([key, signature]);
    if (!key || !signature || busy || inFlight.current || session.accepted.get(key) === signature || (attempts.current.get(attemptKey) ?? 0) >= 3) return;
    const timer = setTimeout(async () => {
      inFlight.current = true;
      session.nextAllowed = Date.now() + 65000;
      attempts.current.set(attemptKey, (attempts.current.get(attemptKey) ?? 0) + 1);
      const controller = new AbortController();
      activeRequest.current = controller;
      const isCurrent = () => !controller.signal.aborted && mounted.current && latest.current.generation === generation;
      let timeout: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          latest.current.upload(isCurrent, controller.signal),
          new Promise<never>((_, reject) => {
            timeout = setTimeout(() => {
              controller.abort();
              reject(new Error('Companion upload timed out'));
            }, 60000);
          }),
        ]);
        if (isCurrent()) {
          session.accepted.set(key, signature);
          if (session.accepted.size > 100) session.accepted.delete(session.accepted.keys().next().value!);
        }
      } catch (error) {
        console.warn('[Companion] Upload failed; retrying after quota cooldown', error);
      } finally {
        clearTimeout(timeout);
        activeRequest.current = null;
        inFlight.current = false;
        if (mounted.current) setRevision(value => value + 1);
      }
    }, Math.max(1500, session.nextAllowed - Date.now()));
    return () => clearTimeout(timer);
  }, [key, signature, busy, revision, generation, session]);
  return !!key && !!signature && !busy && session.accepted.get(key) === signature;
}
