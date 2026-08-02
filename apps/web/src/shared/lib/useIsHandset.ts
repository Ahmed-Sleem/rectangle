/**
 * Is the viewport a phone?
 *
 * One answer, read by every component that needs it, because a shell where the
 * navigation thinks it is on a phone and the canvas thinks it is not is a shell
 * with two layouts fighting each other.
 *
 * The threshold is read from the theme rather than written here. CSS cannot use
 * a custom property inside a media query, so the stylesheets restate the number
 * — but both they and this hook resolve to `--rect-bp-handset`, so moving the
 * breakpoint is still one edit in one file.
 *
 * Width, deliberately, not `pointer: coarse`. A tablet has a coarse pointer and
 * plenty of room for the three-zone shell; a small laptop window has a fine
 * pointer and none. What decides the layout is how much space there is.
 */
import { useEffect, useState } from "react";

/** The fallback matches the token, and is only reached before the DOM exists. */
const FALLBACK_HANDSET_MAX = 768;

function handsetQuery(): string {
  const fallback = `(max-width: ${FALLBACK_HANDSET_MAX}px)`;
  if (typeof document === "undefined") return fallback;

  const declared = getComputedStyle(document.documentElement)
    .getPropertyValue("--rect-bp-handset")
    .trim();

  return declared ? `(max-width: ${declared})` : fallback;
}

export function useIsHandset(): boolean {
  const [isHandset, setIsHandset] = useState(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
    return window.matchMedia(handsetQuery()).matches;
  });

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;

    const query = window.matchMedia(handsetQuery());
    const sync = () => setIsHandset(query.matches);

    // Read once on mount as well as on change: the first render may have run
    // before the stylesheet resolved, and rotating a phone fires no re-render
    // by itself.
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  return isHandset;
}
