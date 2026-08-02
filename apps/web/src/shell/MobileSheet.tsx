/**
 * A full-screen panel for phones, with one way out.
 *
 * On a handset the navigation and the assistant have nowhere to sit beside the
 * canvas, so each becomes a sheet that covers the screen while it is open and
 * is entirely absent when it is not. There is no half state: the widening and
 * narrowing that make sense on a desktop mean nothing here, and offering them
 * produced a wrapped strip of navigation permanently eating the top of the
 * screen.
 *
 * Built on `Overlay` rather than as its own thing. That is not a shortcut — the
 * window system already portals out of the transformed canvas, locks background
 * scrolling, traps focus, restores it on close, closes only the topmost on
 * Escape and marks everything beneath it inert. A second implementation of any
 * of that would be a second set of bugs, and this one would be the copy that
 * never receives the next fix.
 *
 * `showsChrome={false}` because the sheet's content brings its own heading: the
 * rail has the wordmark and the assistant has its own header. The X is supplied
 * here so both sheets are dismissed the same way.
 */
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Overlay } from "@/shared/ui";

export function MobileSheet({
  open,
  onClose,
  labelKey,
  children,
}: {
  open: boolean;
  onClose: () => void;
  /** Names the sheet for assistive technology. */
  labelKey: string;
  children: ReactNode;
}) {
  const { t } = useTranslation();

  return (
    <Overlay
      open={open}
      title={t(labelKey)}
      onClose={onClose}
      size="full"
      className="rect-sheet"
      /*
       * A backdrop press cannot dismiss this, because at full size there is no
       * backdrop left to press — the sheet is the screen. The X and Escape are
       * the ways out, and both are always present.
       */
      dismissOnBackdrop={false}
    >
      {children}
    </Overlay>
  );
}
