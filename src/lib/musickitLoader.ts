// Shared MusicKit JS v3 SDK loader — singleton used by both the Apple Music
// playback engine and the auth hook. Prevents double script tags and missed
// "musickitloaded" events when both call sites race.

const MUSICKIT_SRC = "https://js-cdn.music.apple.com/musickit/v3/musickit.js";

let sdkPromise: Promise<void> | null = null;

/** Reset module-level SDK state — only for tests. */
export function _resetMusicKitLoaderForTests(): void {
  sdkPromise = null;
}

export function loadMusicKitSDK(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.MusicKit) return Promise.resolve();
  if (sdkPromise) return sdkPromise;

  sdkPromise = new Promise((resolve, reject) => {
    // Guard against synchronous SDK install (cached service worker, etc.)
    // that could set window.MusicKit before we attach our listener.
    const checkAndResolve = () => {
      if (window.MusicKit) {
        window.removeEventListener("musickitloaded", onLoaded);
        resolve();
        return true;
      }
      return false;
    };

    const onLoaded = () => {
      window.removeEventListener("musickitloaded", onLoaded);
      resolve();
    };
    window.addEventListener("musickitloaded", onLoaded);

    // Re-check after listener registration in case MusicKit installed between
    // the top-of-function check and the listener attach.
    if (checkAndResolve()) return;

    const script = document.createElement("script");
    script.src = MUSICKIT_SRC;
    script.async = true;
    script.onerror = () => {
      window.removeEventListener("musickitloaded", onLoaded);
      sdkPromise = null;
      reject(new Error("Failed to load MusicKit JS"));
    };
    document.head.appendChild(script);
  });

  return sdkPromise;
}
