import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";

/**
 * An <img> for third-party artwork (Spotify's i.scdn.co, mostly).
 *
 * Exists because Browse was firing ~53 simultaneous requests at
 * i.scdn.co on load — every artist avatar, update card, and catalog
 * tile across ~3.4 screens of content, none of them deferred. Spotify
 * throttles a burst that size and answers most of it with 503, so the
 * page rendered as a wall of black cards. The identical URLs load in
 * ~120ms when requested individually, which is what made it look like
 * an outage rather than something we were doing.
 *
 * That failure is a threshold effect, not a regression: it appeared
 * once the image count grew past what the CDN would serve at once, with
 * no deploy involved. It will recur — and worsen — as the catalog grows,
 * which is why this is a shared component rather than a fix at one site.
 *
 * Three behaviours, in order of importance:
 *
 *  1. `loading="lazy"` so offscreen artwork is not requested until it is
 *     near the viewport. This is the actual fix — it cuts the initial
 *     burst by roughly an order of magnitude.
 *  2. One retry with backoff. A 503 is transient by definition, and a
 *     single retry recovers the ones that still slip through.
 *  3. A designed fallback. If it ultimately fails, render the same
 *     placeholder used when there is no artwork at all, rather than
 *     leaving a hole where the image should be.
 */
interface RemoteImageProps {
  src?: string | null;
  alt?: string;
  className?: string;
  /** Rendered instead of the image when src is missing or every attempt
   *  fails. Without this a failure leaves a blank element. */
  fallback?: React.ReactNode;
  /** Skip lazy loading for artwork that is always above the fold — the
   *  mini-player, an open overlay's hero. Deferring those only delays
   *  something the user is already looking at. */
  eager?: boolean;
  /** Renders as a `motion.img` carrying this layoutId, so Framer Motion
   *  can morph it into a matching element elsewhere — the artist card
   *  thumbnail growing into the expanded modal's hero. Both ends of a
   *  morph need the same id; supplying it on only one side hard-cuts.
   *  Omit it and this renders a plain <img>, which is what nearly every
   *  call site wants. */
  layoutId?: string;
  onLoad?: () => void;
}

const RETRY_DELAY_MS = 700;
/** Underscore-prefixed so it cannot collide with a real query param if
 *  this component is ever pointed at something other than Spotify. */
const RETRY_PARAM = "_retry=1";

export default function RemoteImage({
  src,
  alt = "",
  className,
  fallback = null,
  eager = false,
  layoutId,
  onLoad,
}: RemoteImageProps) {
  const [failed, setFailed] = useState(false);
  // Cache-busted retry URL. Kept in state so the retry is a real second
  // request rather than the browser replaying its cached failure.
  const [attemptSrc, setAttemptSrc] = useState(src ?? undefined);
  const retriedRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // A new src is a new image — reset, or a previously failed URL would
  // keep the fallback showing for a perfectly good replacement.
  //
  // Cancelling a pending retry here is load-bearing, not tidiness. A
  // scheduled retry holds the PREVIOUS src in its closure; if the prop
  // moves on before it fires, it writes the old URL over the new one
  // ~700ms later and can drop a perfectly good image into the fallback.
  // That collision is likeliest during exactly the burst this component
  // exists for: several images sit mid-backoff while ArtistRow's heroImg
  // recomputes as facts stream in.
  useEffect(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setFailed(false);
    setAttemptSrc(src ?? undefined);
    retriedRef.current = false;
  }, [src]);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  const handleError = useCallback(() => {
    if (!src) { setFailed(true); return; }
    if (retriedRef.current) { setFailed(true); return; }
    retriedRef.current = true;
    // Backoff before retrying: an immediate retry rejoins the same burst
    // that caused the throttle in the first place.
    timerRef.current = setTimeout(() => {
      setAttemptSrc(`${src}${src.includes("?") ? "&" : "?"}${RETRY_PARAM}`);
    }, RETRY_DELAY_MS);
  }, [src]);

  if (!src || failed) return <>{fallback}</>;

  const imgProps = {
    src: attemptSrc,
    alt,
    className,
    loading: eager ? ("eager" as const) : ("lazy" as const),
    decoding: "async" as const,
    onError: handleError,
    onLoad,
  };

  // Deferral survives the morph — a card that animates into a modal is
  // still offscreen artwork until it is scrolled to, and it was the
  // bulk of the original burst.
  if (layoutId) return <motion.img layoutId={layoutId} {...imgProps} />;

  return <img {...imgProps} />;
}
