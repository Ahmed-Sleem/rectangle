/**
 * How much of the screen the on-screen keyboard is covering.
 *
 * There is no single answer that works everywhere, which is why this exists at
 * all rather than being a line of CSS:
 *
 *  - Chrome on Android stopped shrinking the layout viewport in version 108.
 *    `interactive-widget=resizes-content` in the viewport meta tag restores it,
 *    and once the layout viewport shrinks, ordinary flex layout and `dvh` units
 *    simply work. That tag is set in `index.html`, so on Android this hook has
 *    nothing left to do and correctly reports zero.
 *
 *  - iOS Safari does not implement `interactive-widget` at all. It shrinks only
 *    the *visual* viewport and shifts the layout viewport underneath, so neither
 *    the meta tag nor `dvh` reacts to the keyboard, and a bar pinned to the
 *    bottom of the layout ends up underneath it. The only thing that knows the
 *    keyboard is there is `visualViewport`.
 *
 * So this reads the difference between the layout viewport and the visual one.
 * On Android it is zero because the layout viewport already shrank; on iOS it is
 * the height of the keyboard. One number, correct on both, and every surface
 * that must stay above the keyboard reads the same one.
 *
 * It is published as a CSS custom property rather than returned into React
 * state on purpose. A value in state re-renders every subscriber on every frame
 * of the keyboard animation — the search palette, the assistant and any open
 * dialog at once — to change nothing but a padding. A custom property on the
 * root element is read by the styles directly, so the browser adjusts the layout
 * without React being involved at all.
 */
import { useEffect } from "react";

/** Read by any surface that must sit above the keyboard. */
export const KEYBOARD_INSET_PROPERTY = "--rect-keyboard-inset";

/**
 * Below this, the difference is not a keyboard.
 *
 * The visual and layout viewports disagree by a few pixels for ordinary reasons
 * — a collapsing URL bar, rubber-band scrolling, a pinch that has not quite
 * settled. Treating those as a keyboard would jitter the layout while somebody
 * is merely scrolling, so anything smaller than a plausible keyboard is zero.
 */
const MINIMUM_KEYBOARD_HEIGHT = 120;

/**
 * Installs the listener. Call once, at the root.
 *
 * Deliberately not a per-component hook: the measurement is a fact about the
 * window, not about any one surface, and one listener that writes one property
 * is cheaper and less error-prone than each dialog installing its own.
 */
export function useKeyboardInset(): void {
  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const viewport = window.visualViewport;
    const root = document.documentElement;

    // No VisualViewport means an older browser that still shrinks the layout
    // viewport itself, which is the behaviour this hook exists to emulate.
    if (!viewport) {
      root.style.setProperty(KEYBOARD_INSET_PROPERTY, "0px");
      return undefined;
    }

    let frame = 0;

    const measure = () => {
      frame = 0;

      /*
       * `offsetTop` matters as much as the height. iOS scrolls the visual
       * viewport up to reveal the focused field, so the keyboard's height is
       * what is left below the visible region — the gap at the bottom, not the
       * total difference, which would over-report while the page is shifted.
       */
      const covered = window.innerHeight - viewport.height - viewport.offsetTop;
      const inset = covered > MINIMUM_KEYBOARD_HEIGHT ? Math.round(covered) : 0;

      root.style.setProperty(KEYBOARD_INSET_PROPERTY, `${inset}px`);
      // Styles that need to know a keyboard is up, rather than by how much.
      root.dataset.keyboard = inset > 0 ? "open" : "closed";
    };

    /*
     * Throttled to one measurement per frame. Both events fire many times while
     * the keyboard slides in, and writing the property on each would lay the
     * page out repeatedly for intermediate values nobody sees.
     */
    const schedule = () => {
      if (frame !== 0) return;
      frame = window.requestAnimationFrame(measure);
    };

    measure();
    viewport.addEventListener("resize", schedule);
    // The keyboard also moves the visual viewport without resizing it, when a
    // person scrolls with it open.
    viewport.addEventListener("scroll", schedule);

    return () => {
      if (frame !== 0) window.cancelAnimationFrame(frame);
      viewport.removeEventListener("resize", schedule);
      viewport.removeEventListener("scroll", schedule);
      root.style.removeProperty(KEYBOARD_INSET_PROPERTY);
      delete root.dataset.keyboard;
    };
  }, []);
}
