import { useCallback, useEffect, useRef, useState } from "react";

export interface ScrollEdges {
  atTop: boolean;
  atBottom: boolean;
  overflowing: boolean;
}

const AT_EDGE_TOLERANCE_PX = 1;

/**
 * Tracks whether a scroll container has content hidden above or below the
 * viewport. Rectangle hides native scrollbars globally, so the canvas needs an
 * explicit affordance; this hook drives it without ever fading an edge that has
 * nothing beyond it.
 */
export function useScrollEdges<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [edges, setEdges] = useState<ScrollEdges>({
    atTop: true,
    atBottom: true,
    overflowing: false,
  });

  const measure = useCallback(() => {
    const node = ref.current;
    if (!node) return;

    const { scrollTop, scrollHeight, clientHeight } = node;
    const maxScroll = scrollHeight - clientHeight;
    const overflowing = maxScroll > AT_EDGE_TOLERANCE_PX;

    setEdges((previous) => {
      const next: ScrollEdges = {
        overflowing,
        atTop: !overflowing || scrollTop <= AT_EDGE_TOLERANCE_PX,
        atBottom: !overflowing || scrollTop >= maxScroll - AT_EDGE_TOLERANCE_PX,
      };

      if (
        previous.overflowing === next.overflowing &&
        previous.atTop === next.atTop &&
        previous.atBottom === next.atBottom
      ) {
        return previous;
      }
      return next;
    });
  }, []);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    measure();
    node.addEventListener("scroll", measure, { passive: true });

    // Content height changes (async data, expanding sections) must re-measure.
    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(node);
    for (const child of Array.from(node.children)) {
      observer?.observe(child);
    }

    return () => {
      node.removeEventListener("scroll", measure);
      observer?.disconnect();
    };
  }, [measure]);

  return { ref, edges, measure };
}
