/**
 * The navigation and the assistant, on a phone, as part of the canvas.
 *
 * These used to be `Overlay` at `size="full"`. That was correct about the
 * behaviours — focus containment, Escape, scroll locking — and wrong about what
 * the thing is. An overlay is a window laid over the work: it dims what is
 * behind, animates in from a smaller shape, and is understood as temporary
 * because you can still see the page it covers. On a phone the rail and the
 * assistant are not laid over the work, they *are* the work for as long as they
 * are open. Rendering them as windows made them read as dialogs that had
 * appeared on top of the app, which is what the owner reported.
 *
 * So on a handset they render inline, in the canvas, replacing its content and
 * occupying every pixel of it. No backdrop, because there is nothing behind to
 * show. No portal, because it does not need to escape the canvas — it is the
 * canvas.
 *
 * WHAT IS NOT DUPLICATED HERE, and why that matters: a modal surface still has
 * to seat focus somewhere sensible, still has to keep Tab inside itself, and
 * still has to close on Escape. Those rules are `focusInitial`,
 * `containTabWithin` and the Escape check, and this file imports the first two
 * from the same module `Overlay` uses. There is one implementation of "where
 * does focus go" and one of "how does Tab wrap" in this product, with two
 * callers. Copying them here would have been quicker and would have created the
 * second copy that never receives the next fix.
 */
import { useEffect, useRef, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import { IconButton } from "@/shared/ui";
import { containTabWithin, focusInitial } from "@/shared/ui/overlay-behaviour";
import { useExitTransition } from "@/shared/ui/use-exit-transition";
import { cn } from "@/shared/lib/cn";

export function CanvasSheet({
  open,
  onClose,
  label,
  children,
  className,
}: {
  open: boolean;
  onClose: () => void;
  /** Names the sheet for assistive technology. Already translated. */
  label: string;
  children: ReactNode;
  className?: string;
}) {
  const { t } = useTranslation();
  const surfaceRef = useRef<HTMLElement | null>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  // Held in the tree while the exit plays, the same as a window: unmounting on
  // the same tick would remove it before any closing motion could run.
  const { mounted, state, onAnimationEnd } = useExitTransition({ open });

  useEffect(() => {
    if (!mounted) return undefined;

    const surface = surfaceRef.current;
    /*
     * Whatever opened this — the menu button in the header — so focus can be
     * handed back to it. Captured before focus moves, or it would be the sheet.
     */
    const previouslyFocused = document.activeElement as HTMLElement | null;

    if (surface) focusInitial(surface);

    function onKeyDown(event: KeyboardEvent) {
      const node = surfaceRef.current;
      if (!node) return;

      if (event.key === "Escape") {
        event.stopPropagation();
        closeRef.current();
        return;
      }

      if (event.key === "Tab") containTabWithin(node, event);
    }

    document.addEventListener("keydown", onKeyDown, true);

    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      if (previouslyFocused && document.contains(previouslyFocused)) {
        previouslyFocused.focus();
      }
    };
  }, [mounted]);

  if (!mounted) return null;

  return (
    <section
      className={cn("rect-canvas-sheet", className)}
      /*
       * A dialog rather than a region, and modal, because everything else on
       * the screen is covered and unreachable while it is open. That is true
       * whether it is portalled or not, and assistive technology should be told
       * the same thing a sighted person can see.
       */
      role="dialog"
      aria-modal="true"
      aria-label={label}
      data-state={state}
      ref={surfaceRef}
      tabIndex={-1}
      onAnimationEnd={onAnimationEnd}
    >
      <IconButton
        label={t("common.close")}
        size="sm"
        variant="plain"
        className="rect-canvas-sheet__close"
        onClick={onClose}
      >
        <X size={18} strokeWidth={2} aria-hidden />
      </IconButton>

      {children}
    </section>
  );
}
