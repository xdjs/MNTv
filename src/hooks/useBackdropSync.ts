import { useRef, useEffect, useCallback } from "react";

/**
 * Syncs a YouTube iframe embed with our internal playback state
 * using the YouTube IFrame Player API postMessage protocol.
 */
export function useBackdropSync(
  isPlaying: boolean,
  currentTime: number,
  backdropMotion: boolean,
  embedId: string | undefined
) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const lastSyncedTime = useRef(0);

  const postCommand = useCallback((event: string, args?: any) => {
    const iframe = iframeRef.current;
    if (!iframe?.contentWindow) return;
    const msg: any = { event: "command", func: event };
    if (args !== undefined) msg.args = args;
    iframe.contentWindow.postMessage(JSON.stringify(msg), "*");
  }, []);

  // Play/pause sync
  useEffect(() => {
    if (!backdropMotion || !embedId) return;
    if (isPlaying) {
      postCommand("playVideo");
    } else {
      postCommand("pauseVideo");
    }
  }, [isPlaying, backdropMotion, embedId, postCommand]);

  // Seek sync — only when the jump is > 2 seconds from last synced position
  useEffect(() => {
    if (!backdropMotion || !embedId) return;
    const drift = Math.abs(currentTime - lastSyncedTime.current);
    if (drift > 2) {
      postCommand("seekTo", [currentTime, true]);
      lastSyncedTime.current = currentTime;
    } else {
      lastSyncedTime.current = currentTime;
    }
  }, [currentTime, backdropMotion, embedId, postCommand]);

  return { iframeRef };
}
