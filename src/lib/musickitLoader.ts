// Shared MusicKit JS v3 SDK loader — singleton used by both the Apple Music
// playback engine and the auth hook. Prevents double script tags and missed
// "musickitloaded" events when both call sites race.

const MUSICKIT_SRC = "https://js-cdn.music.apple.com/musickit/v3/musickit.js";
const LOAD_TIMEOUT_MS = 15_000;

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
    let settled = false;
    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      window.removeEventListener("musickitloaded", onLoaded);
      fn();
    };

    // Bail out after 15s if Apple's CDN is unreachable or the musickitloaded
    // event never fires — prevents the engine and auth flow from hanging forever.
    const timeoutId = setTimeout(() => {
      sdkPromise = null;
      settle(() => reject(new Error(`MusicKit JS load timed out after ${LOAD_TIMEOUT_MS}ms`)));
    }, LOAD_TIMEOUT_MS);

    const onLoaded = () => settle(() => resolve());
    window.addEventListener("musickitloaded", onLoaded);

    // Guard against synchronous SDK install (cached service worker, etc.)
    // that could set window.MusicKit between the top-of-function check and
    // the listener attach.
    if (window.MusicKit) {
      settle(() => resolve());
      return;
    }

    // Reuse an existing <script> tag if a previous load attempt timed out
    // or errored. Without this, each retry would append a duplicate tag.
    let script = document.querySelector<HTMLScriptElement>(
      `script[src="${MUSICKIT_SRC}"]`
    );
    if (script) {
      script.addEventListener("error", () => {
        sdkPromise = null;
        settle(() => reject(new Error("Failed to load MusicKit JS")));
      });
      return;
    }

    script = document.createElement("script");
    script.src = MUSICKIT_SRC;
    script.async = true;
    script.onerror = () => {
      sdkPromise = null;
      settle(() => reject(new Error("Failed to load MusicKit JS")));
    };
    document.head.appendChild(script);
  });

  return sdkPromise;
}
