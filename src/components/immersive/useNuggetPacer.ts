import { useCallback, useEffect, useRef } from "react";

interface NuggetIdentity {
  id: string;
}

interface UseNuggetPacerOptions<T extends NuggetIdentity> {
  nuggets: T[];
  unlockedIds: Set<string>;
  trackKey: string;
  onShow: (index: number) => void;
  minDisplayMs?: number;
}

// Paces nugget reveal for the immersive view. Newly-unlocked nuggets are
// queued and dispatched via onShow one at a time, with at least
// minDisplayMs between dispatches, so fast-arriving streams don't yank
// the reader mid-sentence or silently drop intermediate entries.
//
// The track-change reset is authoritative: when trackKey flips, the queue,
// pending timer, prevUnlockedCount, and user-takeover flag are all cleared
// before the next unlockedIds tick runs.
//
// cancelPending() hands control back to the user (e.g. on a manual swipe):
// the pending queue and timer are cleared, and the pacer stops auto-advancing
// for the rest of the track so arrivals that land after the swipe don't yank
// the reader off the nugget they chose.
export function useNuggetPacer<T extends NuggetIdentity>({
  nuggets,
  unlockedIds,
  trackKey,
  onShow,
  minDisplayMs = 10_000,
}: UseNuggetPacerOptions<T>) {
  const pendingQueueRef = useRef<number[]>([]);
  const advanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nuggetShownAtRef = useRef(0);
  const prevUnlockedCountRef = useRef(0);
  const prevTrackKeyRef = useRef(trackKey);
  const userTookOverRef = useRef(false);

  // Keep onShow in a ref so the effect doesn't re-run each render as the
  // parent recreates the callback.
  const onShowRef = useRef(onShow);
  useEffect(() => {
    onShowRef.current = onShow;
  }, [onShow]);

  const clearAdvanceTimer = () => {
    if (advanceTimerRef.current) {
      clearTimeout(advanceTimerRef.current);
      advanceTimerRef.current = null;
    }
  };

  const scheduleNext = () => {
    if (userTookOverRef.current) return;
    if (advanceTimerRef.current) return;
    if (pendingQueueRef.current.length === 0) return;
    const elapsed = Date.now() - nuggetShownAtRef.current;
    const wait = Math.max(0, minDisplayMs - elapsed);
    advanceTimerRef.current = setTimeout(() => {
      advanceTimerRef.current = null;
      if (userTookOverRef.current) return;
      const next = pendingQueueRef.current.shift();
      if (next !== undefined) {
        nuggetShownAtRef.current = Date.now();
        onShowRef.current(next);
        scheduleNext();
      }
    }, wait);
  };

  // Stable reference so callers can list this in useCallback deps without
  // causing a new identity every render. The body only reads refs, which
  // are themselves stable, so an empty dep list is safe.
  const cancelPending = useCallback(() => {
    pendingQueueRef.current = [];
    if (advanceTimerRef.current) {
      clearTimeout(advanceTimerRef.current);
      advanceTimerRef.current = null;
    }
    userTookOverRef.current = true;
  }, []);

  // Track change: reset before any unlockedIds effect runs for the new track.
  useEffect(() => {
    if (trackKey !== prevTrackKeyRef.current) {
      prevTrackKeyRef.current = trackKey;
      pendingQueueRef.current = [];
      clearAdvanceTimer();
      prevUnlockedCountRef.current = 0;
      nuggetShownAtRef.current = 0;
      userTookOverRef.current = false;
    }
  }, [trackKey]);

  useEffect(() => {
    const unlockedIndices: number[] = [];
    for (let i = 0; i < nuggets.length; i++) {
      if (unlockedIds.has(nuggets[i].id)) unlockedIndices.push(i);
    }
    const newCount = unlockedIndices.length;
    const oldCount = prevUnlockedCountRef.current;
    if (newCount <= oldCount) {
      // Defensive: if nuggets ever shrink mid-track we just sync the counter.
      // Track-change reset is the authoritative zeroing path.
      prevUnlockedCountRef.current = newCount;
      return;
    }

    const newlyAdded = unlockedIndices.slice(oldCount);
    prevUnlockedCountRef.current = newCount;

    // After a manual swipe we don't auto-advance for the rest of the track,
    // but we still update prevUnlockedCount so a future track-change reset
    // starts fresh.
    if (userTookOverRef.current) return;

    if (oldCount === 0) {
      const [first, ...rest] = newlyAdded;
      nuggetShownAtRef.current = Date.now();
      onShowRef.current(first);
      pendingQueueRef.current.push(...rest);
    } else {
      pendingQueueRef.current.push(...newlyAdded);
    }
    scheduleNext();
  }, [unlockedIds, nuggets, minDisplayMs]);

  useEffect(() => () => clearAdvanceTimer(), []);

  return { cancelPending };
}
