import { useState, useRef, useCallback, useEffect } from "react";

export function usePlayback(durationSec: number, onEnded?: () => void) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [fadingIn, setFadingIn] = useState(false);
  const intervalRef = useRef<number | null>(null);
  const onEndedRef = useRef(onEnded);
  onEndedRef.current = onEnded;

  const tick = useCallback(() => {
    setCurrentTime((prev) => {
      if (prev >= durationSec) {
        setIsPlaying(false);
        onEndedRef.current?.();
        return durationSec;
      }
      return prev + 0.25;
    });
  }, [durationSec]);

  useEffect(() => {
    if (isPlaying) {
      intervalRef.current = window.setInterval(tick, 250);
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isPlaying, tick]);

  const play = useCallback(() => setIsPlaying(true), []);
  const pause = useCallback(() => setIsPlaying(false), []);
  const seek = useCallback((t: number) => setCurrentTime(Math.max(0, Math.min(t, durationSec))), [durationSec]);
  const toggle = useCallback(() => setIsPlaying((p) => !p), []);

  const pauseForOverlay = useCallback(() => {
    setIsPlaying(false);
  }, []);

  const resumeWithFade = useCallback(() => {
    setFadingIn(true);
    setIsPlaying(true);
    setTimeout(() => setFadingIn(false), 1000);
  }, []);

  return { isPlaying, currentTime, fadingIn, play, pause, seek, toggle, pauseForOverlay, resumeWithFade };
}
