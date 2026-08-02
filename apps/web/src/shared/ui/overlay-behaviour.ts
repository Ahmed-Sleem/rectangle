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

/**
 * Every open window, oldest first. The last entry is the one in front.
 *
 * A module-level array rather than React state or context on purpose: a window
 * opened from inside another is a separate portal into <body>, so the two share
 * no React ancestor that could hold this. What they do share is the document,
 * and the stack is a fact about the document.
 */
const overlayStack: symbol[] = [];

/** Is this window the one in front, and therefore the one that reacts? */
function isTopmost(id: symbol): boolean {
  return overlayStack[overlayStack.length - 1] === id;
}

/**
 * Makes everything below the front window unreachable.
 *
 * `inert` is the platform's own answer, and it does what a focus trap alone
 * cannot: it removes the subtree from the accessibility tree and refuses
 * pointer events, so a parent window cannot be clicked, read by a screen
 * reader, or tabbed into while a child is open. The owner asked that the
 * original window not be touchable until the current one is finished, and this
 * is that rule enforced by the browser rather than approximated by JavaScript.
 *
 * Applied to each overlay's own portal root and to the application shell, so
 * exactly one window is live at any moment.
 */
function refreshInertness(): void {
  if (typeof document === "undefined") return;

  const roots = Array.from(document.querySelectorAll<HTMLElement>("[data-overlay-root]"));
  const topId = overlayStack[overlayStack.length - 1];

  for (const root of roots) {
    const isTop = topId !== undefined && root.dataset.overlayId === String(topId.description);
    root.inert = !isTop;
  }

  // The shell itself is inert whenever anything is open above it.
  const shell = document.getElementById("root");
  if (shell) shell.inert = overlayStack.length > 0;
}

export interface OverlayBehaviourOptions {
  onClose: () => void;
  closeOnEscape?: boolean;
  /** Distinguishes this window from every other open one. */
  overlayId: string;
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
  overlayId,
}: OverlayBehaviourOptions) {
  const surfaceRef = useRef<T | null>(null);
  // Keep the latest onClose without re-running the effect on every render.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const id = Symbol(overlayId);
    overlayStack.push(id);
    refreshInertness();

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
      /*
       * Only the window in front reacts. Every open overlay listens on the
       * document, so without this one Escape closed the whole stack at once —
       * a child window and the parent that opened it would both vanish,
       * losing work the person had not finished.
       */
      if (!isTopmost(id)) return;

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
      const at = overlayStack.indexOf(id);
      if (at !== -1) overlayStack.splice(at, 1);
      /*
       * Before focus is restored, not after. Returning focus to a control that
       * is still inside an inert subtree silently does nothing, and the person
       * is left with focus on <body> — which is exactly the "where did my
       * keyboard go" that closing a child window used to produce.
       */
      refreshInertness();
      unlockScroll();
      removeAppBlur();
      // Return focus to whatever opened the window.
      if (previouslyFocused && document.contains(previouslyFocused)) {
        previouslyFocused.focus();
      }
    };
    // Deliberately mount-scoped: the overlay only renders while it should be
    // holding these, so setup and teardown follow its lifetime exactly.
  }, [closeOnEscape, overlayId]);

  return surfaceRef;
}

/** How many windows are open. The last one opened is the one in front. */
export function overlayDepth(): number {
  return overlayStack.length;
}

/** Test-only helper so suites can assert the lock/blur bookkeeping is balanced. */
export function __getOverlayCounters() {
  return { scrollLockCount, blurCount, stackDepth: overlayStack.length };
}
