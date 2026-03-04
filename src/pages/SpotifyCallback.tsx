import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import MusicNerdLogo from "@/components/MusicNerdLogo";
import { exchangeSpotifyCode, fetchSpotifyTaste } from "@/hooks/useSpotifyAuth";
import { useUserProfile } from "@/hooks/useMusicNerdState";

type Status = "exchanging" | "fetching" | "saving" | "done" | "error";

export default function SpotifyCallback() {
  const navigate = useNavigate();
  const { saveProfile, profile } = useUserProfile();
  const [status, setStatus] = useState<Status>("exchanging");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    async function handleCallback() {
      const params = new URLSearchParams(window.location.search);
      const code = params.get("code");
      const state = params.get("state");
      const error = params.get("error");

      if (error) {
        setErrorMsg(error === "access_denied" ? "You declined Spotify access." : `Spotify error: ${error}`);
        setStatus("error");
        return;
      }

      if (!code || !state) {
        setErrorMsg("Missing OAuth parameters.");
        setStatus("error");
        return;
      }

      // Step 1: Exchange code for token
      setStatus("exchanging");
      const tokenResult = await exchangeSpotifyCode(code, state);
      if (!tokenResult) {
        setErrorMsg("Failed to exchange authorization code. Please try again.");
        setStatus("error");
        return;
      }

      // Persist playback tokens for Spotify Web Playback SDK
      localStorage.setItem(
        "spotify_playback_token",
        JSON.stringify({
          accessToken: tokenResult.accessToken,
          refreshToken: tokenResult.refreshToken,
          expiresAt: Date.now() + tokenResult.expiresIn * 1000,
        })
      );

      // Step 2: Fetch taste profile
      setStatus("fetching");
      const taste = await fetchSpotifyTaste(tokenResult.accessToken);
      if (!taste) {
        setErrorMsg("Connected to Spotify but couldn't fetch your listening data.");
        setStatus("error");
        return;
      }

      // Step 3: Merge into existing profile
      setStatus("saving");
      if (profile) {
        saveProfile({
          ...profile,
          streamingService: "Spotify",
          spotifyTopArtists: taste.topArtists,
          spotifyTopTracks: taste.topTracks,
          spotifyArtistImages: taste.artistImages,
          spotifyArtistIds: taste.artistIds,
          spotifyTrackImages: taste.trackImages,
        });
      }
      // If no profile exists yet (direct OAuth before setup), store data in sessionStorage
      // so Connect/Onboarding can pick it up.
      else {
        sessionStorage.setItem(
          "spotify_pending_taste",
          JSON.stringify({
            topArtists: taste.topArtists,
            topTracks: taste.topTracks,
            artistImages: taste.artistImages,
            artistIds: taste.artistIds,
            trackImages: taste.trackImages,
          })
        );
      }

      setStatus("done");

      // Redirect: back to Connect if no profile yet, otherwise browse.
      setTimeout(() => {
        if (profile) {
          navigate("/browse", { replace: true });
        } else {
          navigate("/connect", { replace: true });
        }
      }, 1500);
    }

    handleCallback();
    // Intentional one-shot OAuth callback — must run exactly once on mount.
    // profile/saveProfile/navigate are stable for the lifetime of this page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const messages: Record<Status, string> = {
    exchanging: "Connecting to Spotify…",
    fetching: "Fetching your listening history…",
    saving: "Personalising your experience…",
    done: "All set! Redirecting…",
    error: "Something went wrong",
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-6 px-6">
      <motion.div
        animate={status === "done" ? { scale: [1, 1.15, 1] } : {}}
        transition={{ duration: 0.4 }}
      >
        <MusicNerdLogo size={56} glow />
      </motion.div>

      {status !== "error" ? (
        <div className="flex flex-col items-center gap-3">
          <div className="flex items-center gap-3">
            {status !== "done" && (
              <svg className="animate-spin h-5 w-5 text-primary" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
            )}
            {status === "done" && <span className="text-2xl">✓</span>}
            <p className="text-lg font-semibold text-foreground">{messages[status]}</p>
          </div>

          {/* Progress steps */}
          <div className="flex gap-2 mt-2">
            {(["exchanging", "fetching", "saving", "done"] as Status[]).map((s) => (
              <div
                key={s}
                className={`h-1 w-8 rounded-full transition-all duration-500 ${
                  ["exchanging", "fetching", "saving", "done"].indexOf(s) <=
                  ["exchanging", "fetching", "saving", "done"].indexOf(status)
                    ? "bg-primary"
                    : "bg-foreground/15"
                }`}
              />
            ))}
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-4 text-center max-w-sm">
          <p className="text-destructive font-semibold">Connection failed</p>
          <p className="text-sm text-muted-foreground">{errorMsg}</p>
          <button
            onClick={() => navigate("/connect", { replace: true })}
            className="rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground hover:opacity-90 transition-opacity"
          >
            Back to Setup
          </button>
        </div>
      )}
    </div>
  );
}
