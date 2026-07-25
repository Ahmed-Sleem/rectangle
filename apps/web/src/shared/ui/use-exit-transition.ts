import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Keeps a component mounted long enough to play an exit animation.
 *
 * React removes a node the moment its condition turns false, so a closing
 * animation never gets a chance to run. This holds the node in a `closing`
 * phase, lets CSS finish, then unmounts.
 *
 * Completion is driven by `animationend` rather than a timer so the CSS keeps
 * ownership of the duration. A timeout only exists as a fallback for cases
 * where the event cannot arrive: reduced motion, a background tab, or a browser
 * that skips the animation entirely.
 */
export type TransitionPhase = "closed" | "open" | "closing";

const FALLBACK_GRACE_MS = 120;

export interface ExitTransitionOptions {
  open: boolean;
  /** Upper bound for the exit animation, used only if `animationend` never fires. */
  durationMs?: number;
}

export function useExitTransition<T extends HTMLElement>({
  open,
  durationMs = 200,
}: ExitTransitionOptions) {
  const [phase, setPhase] = useState<TransitionPhase>(open ? "open" : "closed");
  const surfaceRef = useRef<T | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const finish = useCallback(() => {
    if (timeoutRef.current !== undefined) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = undefined;
    }
    setPhase((current) => (current === "closing" ? "closed" : current));
  }, []);

  useEffect(() => {
    if (open) {
      if (timeoutRef.current !== undefined) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = undefined;
      }
      setPhase("open");
      return;
    }

    // Only animate out from a genuinely open state; never on first render.
    setPhase((current) => (current === "open" || current === "closing" ? "closing" : "closed"));
  }, [open]);

  useEffect(() => {
    if (phase !== "closing") return;

    const prefersReducedMotion =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (prefersReducedMotion) {
      finish();
      return;
    }

    timeoutRef.current = setTimeout(finish, durationMs + FALLBACK_GRACE_MS);

    return () => {
      if (timeoutRef.current !== undefined) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = undefined;
      }
    };
  }, [durationMs, finish, phase]);

  useEffect(
    () => () => {
      if (timeoutRef.current !== undefined) clearTimeout(timeoutRef.current);
    },
    [],
  );

  /** Attach to the animated element so CSS decides when the exit is done. */
  const onAnimationEnd = useCallback(
    (event: { target: EventTarget | null; currentTarget: EventTarget | null }) => {
      // Ignore animations bubbling up from children.
      if (event.target !== event.currentTarget) return;
      finish();
    },
    [finish],
  );

  // Derived synchronously rather than from state: waiting for an effect would
  // withhold the node for one render, and any effect that expects the surface to
  // exist on open (focus handling) would find nothing there.
  const closing = !open && phase === "closing";

  return {
    /** True while the node must stay in the tree, including during the exit. */
    mounted: open || closing,
    closing,
    phase,
    surfaceRef,
    onAnimationEnd,
  };
}
