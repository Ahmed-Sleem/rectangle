import { useEffect, useRef } from "react";

/**
 * Behaviour shared by every Rectangle overlay: focus containment, focus
 * restoration, Escape handling and background scroll locking.
 *
 * These are kept out of the component so every window in the product gets the
 * identical, tested behaviour instead of each feature reinventing it.
 */

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

export function getFocusable(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (element) =>
      !element.hasAttribute("disabled") &&
      element.getAttribute("aria-hidden") !== "true" &&
      // offsetParent is null for display:none subtrees; keep fixed elements.
      (element.offsetParent !== null || element.style.position === "fixed"),
  );
}

/** Locks background scrolling while any overlay is open (reference counted). */
let scrollLockCount = 0;
let restoreOverflow = "";
let restorePaddingInline = "";

function lockScroll(): void {
  if (typeof document === "undefined") return;
  scrollLockCount += 1;
  if (scrollLockCount > 1) return;

  const { body } = document;
  restoreOverflow = body.style.overflow;
  restorePaddingInline = body.style.paddingInlineEnd;

  body.style.overflow = "hidden";

  // `scrollbar-gutter: stable` already reserves the space, so padding here would
  // double-count and shift the page. Compensate only where it is unsupported.
  const supportsGutter =
    typeof CSS !== "undefined" &&
    typeof CSS.supports === "function" &&
    CSS.supports("scrollbar-gutter", "stable");

  if (!supportsGutter) {
    const gap = window.innerWidth - document.documentElement.clientWidth;
    if (gap > 0) body.style.paddingInlineEnd = `${gap}px`;
  }
}

function unlockScroll(): void {
  if (typeof document === "undefined") return;
  scrollLockCount = Math.max(0, scrollLockCount - 1);
  if (scrollLockCount > 0) return;

  const { body } = document;
  body.style.overflow = restoreOverflow;
  body.style.paddingInlineEnd = restorePaddingInline;
}

/** Blurs the application shell while any overlay is open (reference counted). */
let blurCount = 0;
const APP_BLUR_CLASS = "rect-has-overlay";

function applyAppBlur(): void {
  if (typeof document === "undefined") return;
  blurCount += 1;
  document.documentElement.classList.add(APP_BLUR_CLASS);
}

function removeAppBlur(): void {
  if (typeof document === "undefined") return;
  blurCount = Math.max(0, blurCount - 1);
  if (blurCount === 0) document.documentElement.classList.remove(APP_BLUR_CLASS);
}

export interface OverlayBehaviourOptions {
  onClose: () => void;
  closeOnEscape?: boolean;
}

/**
 * Scroll lock, app dimming, focus containment, and focus restoration.
 *
 * The effect runs for the lifetime of the mounted overlay rather than keying off
 * an `open` flag. That matters during the exit: releasing the lock and the blur
 * the instant `open` flips would snap the page back to normal while the window
 * is still visible on top of it, which reads as a glitch.
 */
export function useOverlayBehaviour<T extends HTMLElement>({
  onClose,
  closeOnEscape = true,
}: OverlayBehaviourOptions) {
  const surfaceRef = useRef<T | null>(null);
  // Keep the latest onClose without re-running the effect on every render.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    lockScroll();
    applyAppBlur();

    // Move focus into the overlay so keyboard and screen-reader users land inside.
    const surface = surfaceRef.current;
    if (surface) {
      const focusable = getFocusable(surface);
      const target = focusable.find((el) => el.dataset.autofocus === "true") ?? focusable[0];
      (target ?? surface).focus();
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && closeOnEscape) {
        event.stopPropagation();
        closeRef.current();
        return;
      }

      if (event.key !== "Tab") return;

      const node = surfaceRef.current;
      if (!node) return;

      const focusable = getFocusable(node);
      if (focusable.length === 0) {
        event.preventDefault();
        node.focus();
        return;
      }

      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      const active = document.activeElement;

      // Wrap focus so it can never escape the open window.
      if (event.shiftKey && (active === first || !node.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown, true);

    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      unlockScroll();
      removeAppBlur();
      // Return focus to whatever opened the window.
      if (previouslyFocused && document.contains(previouslyFocused)) {
        previouslyFocused.focus();
      }
    };
    // Deliberately mount-scoped: the overlay only renders while it should be
    // holding these, so setup and teardown follow its lifetime exactly.
  }, [closeOnEscape]);

  return surfaceRef;
}

/** Test-only helper so suites can assert the lock/blur bookkeeping is balanced. */
export function __getOverlayCounters() {
  return { scrollLockCount, blurCount };
}
