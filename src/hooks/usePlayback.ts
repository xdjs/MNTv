import { useState, useRef, useCallback, useEffect } from "react";
import { useYouTubePlayer } from "./useYouTubePlayer";
import { useSpotifyPlayer } from "./useSpotifyPlayer";

export type ActivePlayer = "spotify" | "youtube" | "timer";

export function usePlayback(
  durationSec: number,
  onEnded?: () => void,
  videoId?: string,
  spotifyUri?: string,
  spotifyAvailable?: boolean
) {
  const [fadingIn, setFadingIn] = useState(false);
  const onEndedRef = useRef(onEnded);
  onEndedRef.current = onEnded;

  const handleEnded = useCallback(() => {
    onEndedRef.current?.();
  }, []);

  const yt = useYouTubePlayer({ onEnded: handleEnded });
  const sp = useSpotifyPlayer({ onEnded: handleEnded });

  // ── Fallback timer ───────────────────────────────────────────────────
  const [timerPlaying, setTimerPlaying] = useState(false);
  const [timerTime, setTimerTime] = useState(0);
  const intervalRef = useRef<number | null>(null);

  const timerTick = useCallback(() => {
    setTimerTime((prev) => {
      if (prev >= durationSec) {
        setTimerPlaying(false);
        onEndedRef.current?.();
        return durationSec;
      }
      return prev + 0.25;
    });
  }, [durationSec]);

  useEffect(() => {
    if (timerPlaying) {
      intervalRef.current = window.setInterval(timerTick, 250);
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [timerPlaying, timerTick]);

  // ── Active player logic ──────────────────────────────────────────────
  // Priority: Spotify (if connected + URI found) > YouTube audio (no Spotify) > timer
  const activePlayer: ActivePlayer =
    spotifyAvailable && sp.isReady && spotifyUri
      ? "spotify"
      : !spotifyAvailable && videoId && yt.isReady
        ? "youtube"
        : "timer";

  // Track what we've loaded to avoid re-triggering
  const loadedUriRef = useRef<string | null>(null);
  const loadedVideoRef = useRef<string | null>(null);
  const autoplayedYtRef = useRef(false);

  // ── Spotify: play when URI is resolved and SDK is ready ──────────────
  useEffect(() => {
    if (activePlayer === "spotify" && spotifyUri && spotifyUri !== loadedUriRef.current) {
      loadedUriRef.current = spotifyUri;
      sp.play(spotifyUri);
      setTimerPlaying(false);
    }
  }, [activePlayer, spotifyUri, sp.play]);

  // ── YouTube: load video for backdrop visuals ──────────────────────────
  useEffect(() => {
    if (videoId && videoId !== loadedVideoRef.current) {
      loadedVideoRef.current = videoId;
      autoplayedYtRef.current = false;
      yt.loadVideo(videoId);
    }
  }, [videoId, yt.loadVideo]);

  // Mute/unmute YouTube depending on whether it's the audio source
  useEffect(() => {
    yt.setMuted(activePlayer !== "youtube");
  }, [activePlayer, yt.setMuted]);

  // YouTube as audio fallback only when no Spotify
  useEffect(() => {
    if (activePlayer === "youtube" && yt.isReady && !autoplayedYtRef.current) {
      autoplayedYtRef.current = true;
      yt.setMuted(false);
      if (timerTime > 1) yt.seek(timerTime);
      yt.play();
      setTimerPlaying(false);
    }
  }, [activePlayer, yt.isReady, yt.play, yt.seek, yt.setMuted, timerTime]);

  // ── Unified state from active player ─────────────────────────────────
  const isPlaying =
    activePlayer === "spotify" ? sp.isPlaying
    : activePlayer === "youtube" ? yt.isPlaying
    : timerPlaying;

  const currentTime =
    activePlayer === "spotify" ? sp.currentTime
    : activePlayer === "youtube" ? yt.currentTime
    : timerTime;

  const realDuration =
    activePlayer === "spotify" ? (sp.duration || durationSec)
    : activePlayer === "youtube" ? (yt.duration || durationSec)
    : durationSec;

  // ── Controls ─────────────────────────────────────────────────────────
  const play = useCallback(() => {
    if (activePlayer === "spotify") {
      if (loadedUriRef.current) sp.resume();
    } else if (activePlayer === "youtube") {
      yt.play();
    } else {
      setTimerPlaying(true);
    }
  }, [activePlayer, sp.resume, yt.play]);

  const pause = useCallback(() => {
    if (activePlayer === "spotify") sp.pause();
    else if (activePlayer === "youtube") yt.pause();
    else setTimerPlaying(false);
  }, [activePlayer, sp.pause, yt.pause]);

  const seek = useCallback(
    (t: number) => {
      const clamped = Math.max(0, Math.min(t, realDuration));
      if (activePlayer === "spotify") sp.seek(clamped);
      else if (activePlayer === "youtube") yt.seek(clamped);
      else setTimerTime(clamped);
    },
    [activePlayer, realDuration, sp.seek, yt.seek]
  );

  const toggle = useCallback(() => {
    if (isPlaying) pause();
    else play();
  }, [isPlaying, pause, play]);

  const pauseForOverlay = useCallback(() => {
    pause();
  }, [pause]);

  const resumeWithFade = useCallback(() => {
    setFadingIn(true);
    play();
    setTimeout(() => setFadingIn(false), 1000);
  }, [play]);

  return {
    isPlaying,
    currentTime,
    duration: realDuration,
    fadingIn,
    play,
    pause,
    seek,
    toggle,
    pauseForOverlay,
    resumeWithFade,
    playerContainerRef: yt.containerRef,
    ytReady: yt.isReady,
    spotifyReady: sp.isReady,
    activePlayer,
  };
}
