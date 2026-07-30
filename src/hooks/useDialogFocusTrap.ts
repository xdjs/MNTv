import { useEffect, useRef } from "react";

/**
 * WCAG focus management for a modal dialog: Escape dismisses, focus moves
 * to the close button on open and returns to the triggering element on
 * close, and Tab/Shift+Tab cycle within the dialog only.
 *
 * Extracted from ArtistUpdatesSection's ExpandedUpdateModal, which had
 * the only correct implementation in the app. A second dialog (the saved
 * nugget on Profile) was written to "match" it visually and shipped
 * without any of this — a keyboard user could Tab straight through the
 * backdrop into the page behind, with no way to dismiss. Copying the
 * behaviour a second time would have set that trap again for the third
 * dialog, so it lives here now.
 *
 * Returns a ref to attach to the dialog's close button. The dialog root
 * is found from that button via `closest('[role="dialog"]')`, so the
 * element carrying the role can be an ancestor at any depth.
 *
 * `active` exists because callers mount differently. ArtistUpdatesSection
 * puts its dialog in a child component that mounts when it opens, so the
 * effect naturally fires at the right moment. Profile renders its dialog
 * inline from the page, where the hook would otherwise run once at page
 * load — with no close button to focus — and never again. Pass whether
 * the dialog is currently open and the effect tracks it.
 */
export function useDialogFocusTrap(onClose: () => void, active = true) {
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!active) return;
    previouslyFocusedRef.current = document.activeElement as HTMLElement | null;
    closeBtnRef.current?.focus();

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;

      const root = closeBtnRef.current?.closest('[role="dialog"]');
      if (!root) return;
      const focusable = Array.from(
        root.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      // Send focus back where the user left it, not to document.body.
      previouslyFocusedRef.current?.focus?.();
    };
  }, [onClose, active]);

  return closeBtnRef;
}
