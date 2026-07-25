import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Keeps a component mounted long enough to play an exit animation.
 *
 * React removes a node as soon as its condition turns false, so a closing
 * animation never gets a chance to run. This holds the node through a `closed`
 * phase, lets CSS finish, then unmounts.
 *
 * The returned `state` is meant to drive a `data-state` attribute, matching the
 * approach Radix uses. Selecting on `[data-state="closed"]` swaps the animation
 * *name* rather than toggling a modifier class, which is what lets the browser
 * restart the entry animation cleanly if the element is reopened mid-exit.
 */
export type TransitionState = "open" | "closed";

const FALLBACK_GRACE_MS = 150;

export interface ExitTransitionOptions {
  open: boolean;
  /** Upper bound for the exit, used only if `animationend` never arrives. */
  durationMs?: number;
}

export function useExitTransition({ open, durationMs = 200 }: ExitTransitionOptions) {
  // Tracks only the exit. Entry needs no bookkeeping because the node is
  // already being rendered.
  const [exiting, setExiting] = useState(false);
  const wasOpen = useRef(open);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const clearFallback = useCallback(() => {
    if (timeoutRef.current !== undefined) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = undefined;
    }
  }, []);

  if (open && wasOpen.current === false) {
    // Reopened, possibly mid-exit. Drop the exit during render so the element
    // never paints a frame in its closing state.
    wasOpen.current = true;
    if (exiting) setExiting(false);
  } else if (!open && wasOpen.current) {
    wasOpen.current = false;
    if (!exiting) setExiting(true);
  }

  useEffect(() => {
    if (!exiting) {
      clearFallback();
      return;
    }

    const prefersReducedMotion =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (prefersReducedMotion) {
      setExiting(false);
      return;
    }

    timeoutRef.current = setTimeout(() => setExiting(false), durationMs + FALLBACK_GRACE_MS);
    return clearFallback;
  }, [clearFallback, durationMs, exiting]);

  useEffect(() => clearFallback, [clearFallback]);

  const onAnimationEnd = useCallback(
    (event: { target: EventTarget | null; currentTarget: EventTarget | null }) => {
      // Ignore animations bubbling up from children.
      if (event.target !== event.currentTarget) return;
      setExiting(false);
    },
    [],
  );

  return {
    /** True while the node must stay in the tree, including during the exit. */
    mounted: open || exiting,
    /** Drive `data-state` with this so CSS owns both directions. */
    state: (open ? "open" : "closed") satisfies TransitionState as TransitionState,
    onAnimationEnd,
  };
}
