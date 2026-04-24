import { useEffect, useState } from "react";
import { signInWithSpotify } from "@/hooks/useSpotifyAuth";

/**
 * Surfaces a reconnect banner when useSpotifyToken's refresh chain fails
 * (both the server-side edge function and the legacy client-side path
 * returned null). Before this banner existed, the user was silently
 * logged out of Spotify on the next ProtectedRoute check with no
 * indication why. Dispatched via `spotify-reconnect-required` from
 * useSpotifyToken.getValidToken.
 */
export default function SpotifyReconnectBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onReconnect = () => setVisible(true);
    window.addEventListener("spotify-reconnect-required", onReconnect);
    return () => window.removeEventListener("spotify-reconnect-required", onReconnect);
  }, []);

  if (!visible) return null;

  return (
    <div
      role="alert"
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[60] rounded-xl bg-destructive/95 px-5 py-3 text-sm text-destructive-foreground shadow-lg flex items-center gap-3"
    >
      <span>Spotify session expired.</span>
      <button
        onClick={() => {
          // Fire-and-forget — signInWithSpotify redirects, so this
          // component unmounts before the Promise could resolve.
          void signInWithSpotify();
        }}
        className="rounded-lg bg-background px-3 py-1 text-xs font-semibold text-foreground hover:opacity-90"
      >
        Reconnect
      </button>
      <button
        aria-label="Dismiss"
        onClick={() => setVisible(false)}
        className="ml-1 text-destructive-foreground/70 hover:text-destructive-foreground"
      >
        ×
      </button>
    </div>
  );
}
