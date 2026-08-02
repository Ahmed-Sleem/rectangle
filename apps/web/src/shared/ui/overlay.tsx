/**
 * The single window system for Rectangle.
 *
 * Every window in the product — create, edit, confirm, detail — is built from
 * `Overlay`. Feature code must never hand-roll a backdrop, a close button, or
 * its own sizing, because that is how windows drift apart and break on small
 * screens.
 *
 * Two structural guarantees:
 *  1. It portals to <body>. The main canvas carries a transform, which makes it
 *     a containing block for fixed positioning, so an in-tree overlay would be
 *     trapped inside the canvas instead of covering the app.
 *  2. Header and footer never scroll; only the body does. The surface is capped
 *     against the dynamic viewport, so it can never exceed the screen.
 */
import type { FormEvent, HTMLAttributes, ReactNode } from "react";
import { useEffect, useId, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/shared/lib/cn";
import { Button, IconButton } from "./primitives";
import { overlayDepth, useOverlayBehaviour } from "./overlay-behaviour";
import { useExitTransition } from "./use-exit-transition";

/**
 * Overlay chrome must render even if a surface is mounted outside the i18n
 * provider, so translation falls back to the English default rather than
 * leaving an action unlabelled.
 */
const FALLBACK_LABELS: Record<string, string> = {
  "common.close": "Close",
  "common.cancel": "Cancel",
  "common.confirm": "Confirm",
  "common.saving": "Saving…",
};

function useOverlayLabels() {
  const { t, i18n } = useTranslation();
  return (key: keyof typeof FALLBACK_LABELS | string): string => {
    if (!i18n?.isInitialized) return FALLBACK_LABELS[key] ?? key;
    const value = t(key);
    return value === key ? (FALLBACK_LABELS[key] ?? key) : value;
  };
}

/**
 * `full` covers the screen edge to edge, for a phone where a window with a
 * margin around it is a window with nowhere to go. It is the only size whose
 * surface has no maximum.
 */
export type OverlaySize = "sm" | "md" | "lg" | "xl" | "full";

export interface OverlayProps extends Omit<HTMLAttributes<HTMLElement>, "title"> {
  open: boolean;
  title: string;
  onClose: () => void;
  description?: string;
  size?: OverlaySize;
  /** Footer actions. Rendered outside the scroll area so they can never be clipped. */
  footer?: ReactNode;
  /** Disable dismiss-by-backdrop for flows where accidental loss is costly. */
  dismissOnBackdrop?: boolean;
  closeOnEscape?: boolean;
  /** Hide the header close control (confirmations that require an explicit choice). */
  hideCloseButton?: boolean;
}

export function Overlay({
  open,
  title,
  onClose,
  description,
  size = "md",
  footer,
  dismissOnBackdrop = true,
  closeOnEscape = true,
  hideCloseButton = false,
  className,
  children,
  ...props
}: OverlayProps) {
  const t = useOverlayLabels();
  const headingId = useId();
  const descriptionId = useId();
  // Stable for the life of this window, and unique across every other one.
  const overlayId = useId();
  // Hold the window in the tree while its exit animation plays; unmounting on
  // the same tick would remove it before any closing motion could run.
  const { mounted, state, onAnimationEnd } = useExitTransition({ open });

  /*
   * One portal root per window, created on first render and reused.
   *
   * Portalling straight to <body> put every window in the same stacking
   * context at the same z-index, so which one appeared in front came down to
   * DOM order — and a child opened from a parent is not guaranteed to come
   * after it. Its own root also gives `inert` something to be applied to that
   * covers the whole window including its backdrop.
   */
  const host = useMemo(() => {
    if (typeof document === "undefined") return null;
    const element = document.createElement("div");
    element.dataset.overlayRoot = "true";
    element.dataset.overlayId = overlayId;
    return element;
  }, [overlayId]);

  /*
   * Detached whenever the window is not on screen, not only when the component
   * unmounts. A closed window usually stays mounted — the page that owns it
   * keeps rendering it with `open={false}` — so unmount alone left an empty
   * root in the document for every window the person had ever opened.
   */
  useEffect(() => {
    if (mounted) return;
    host?.remove();
  }, [host, mounted]);
  useEffect(() => () => host?.remove(), [host]);

  if (!mounted || typeof document === "undefined" || !host) return null;

  /*
   * Attached during render rather than in an effect, because effects run
   * child-first: the surface inside would mount, try to move focus into
   * itself, and find it is not in the document yet. Focusing a detached
   * element silently does nothing, which stranded the keyboard on <body>.
   *
   * Guarded on `isConnected` so re-rendering an open window does not move it,
   * and reached only past the `mounted` check above so a closed window never
   * puts an empty root in the document.
   */
  if (!host.isConnected) document.body.append(host);

  return createPortal(
    <OverlaySurface
      state={state}
      title={title}
      onClose={onClose}
      closeOnEscape={closeOnEscape}
      dismissOnBackdrop={dismissOnBackdrop}
      hideCloseButton={hideCloseButton}
      size={size}
      headingId={headingId}
      descriptionId={descriptionId}
      closeLabel={t("common.close")}
      onExitAnimationEnd={onAnimationEnd}
      overlayId={overlayId}
      {...(footer !== undefined ? { footer } : {})}
      {...(description ? { description } : {})}
      {...(className ? { className } : {})}
      {...props}
    >
      {children}
    </OverlaySurface>,
    host,
  );
}

interface OverlaySurfaceProps
  extends Omit<HTMLAttributes<HTMLElement>, "title" | "onAnimationEnd"> {
  state: "open" | "closed";
  title: string;
  onClose: () => void;
  closeOnEscape: boolean;
  dismissOnBackdrop: boolean;
  hideCloseButton: boolean;
  size: OverlaySize;
  footer?: ReactNode;
  description?: string;
  headingId: string;
  descriptionId: string;
  closeLabel: string;
  overlayId: string;
  onExitAnimationEnd: (event: {
    target: EventTarget | null;
    currentTarget: EventTarget | null;
  }) => void;
}

/**
 * Split out from `Overlay` so scroll lock, dimming, and focus handling live in a
 * component whose lifetime matches the window's presence in the DOM.
 *
 * This is the whole reason closing looks calm: if those were released the moment
 * `open` turned false, the page would un-blur, the scrollbar would return, and
 * focus would jump while the window was still fully visible on top.
 */
function OverlaySurface({
  state,
  title,
  onClose,
  closeOnEscape,
  dismissOnBackdrop,
  hideCloseButton,
  size,
  footer,
  description,
  headingId,
  descriptionId,
  closeLabel,
  overlayId,
  onExitAnimationEnd,
  className,
  children,
  ...props
}: OverlaySurfaceProps) {
  const surfaceRef = useOverlayBehaviour<HTMLElement>({ onClose, closeOnEscape, overlayId });
  const closing = state === "closed";
  /*
   * Depth is read once, at mount, because this window's position in the stack
   * is fixed from the moment it opens: anything opened later goes above it and
   * anything below was already there. Recomputing on render would let a child
   * closing renumber its parent mid-animation.
   */
  const [depth] = useState(() => overlayDepth());

  return (
    <div
      className="rect-overlay"
      data-testid="overlay-backdrop"
      data-state={state}
      /*
       * Each window sits one step above the one it was opened from, so a child
       * is guaranteed to paint over its parent rather than relying on the order
       * two independent portals happen to appear in the document.
       */
      style={{ zIndex: `calc(var(--rect-z-overlay) + ${depth})` }}
      onAnimationEnd={onExitAnimationEnd}
      onMouseDown={(event) => {
        // A window on its way out must not react to a stray press.
        if (closing) return;
        // Only a press that both starts and ends on the scrim dismisses, so a
        // drag that began inside the window never closes it.
        if (dismissOnBackdrop && event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className={cn("rect-overlay__surface", `rect-overlay__surface--${size}`, className)}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        aria-describedby={description ? descriptionId : undefined}
        data-state={state}
        ref={surfaceRef}
        tabIndex={-1}
        {...props}
      >
        <header className="rect-overlay__header">
          <div className="rect-overlay__heading">
            <h2 className="rect-overlay__title" id={headingId}>
              {title}
            </h2>
            {description ? (
              <p className="rect-overlay__description" id={descriptionId}>
                {description}
              </p>
            ) : null}
          </div>
          {hideCloseButton ? null : (
            <IconButton
              label={closeLabel}
              size="sm"
              variant="plain"
              className="rect-overlay__close"
              onClick={onClose}
            >
              <X size={16} strokeWidth={2} aria-hidden />
            </IconButton>
          )}
        </header>

        <div className="rect-overlay__body">{children}</div>

        {footer ? <footer className="rect-overlay__footer">{footer}</footer> : null}
      </section>
    </div>
  );
}

export interface FormDialogProps extends Omit<OverlayProps, "footer" | "children" | "onSubmit"> {
  /** Submit handler for the dialog's form, not the surface element. */
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  submitLabel: string;
  cancelLabel?: string;
  pending?: boolean;
  pendingLabel?: string;
  /** User-facing failure message. Never surface raw error codes here. */
  error?: string | null;
  submitDisabled?: boolean;
  children: ReactNode;
}

/**
 * The create/edit window used across the product. Feature pages supply only
 * their fields; layout, actions, pending state and error surface are shared so
 * every "create X" window behaves identically.
 */
export function FormDialog({
  onSubmit,
  submitLabel,
  cancelLabel,
  pending = false,
  pendingLabel,
  error,
  submitDisabled = false,
  children,
  onClose,
  ...overlayProps
}: FormDialogProps) {
  const t = useOverlayLabels();
  const formId = useId();

  return (
    <Overlay
      {...overlayProps}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            {cancelLabel ?? t("common.cancel")}
          </Button>
          <Button
            variant="primary"
            type="submit"
            form={formId}
            disabled={pending || submitDisabled}
          >
            {pending ? (pendingLabel ?? t("common.saving")) : submitLabel}
          </Button>
        </>
      }
    >
      <form className="rect-overlay__form" id={formId} onSubmit={onSubmit} noValidate>
        {children}
        {error ? (
          <p className="rect-overlay__error" role="alert">
            {error}
          </p>
        ) : null}
      </form>
    </Overlay>
  );
}

export interface ConfirmDialogProps extends Omit<OverlayProps, "footer" | "children"> {
  onConfirm: () => void;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "primary" | "danger";
  pending?: boolean;
  children?: ReactNode;
}

export function ConfirmDialog({
  onConfirm,
  onClose,
  confirmLabel,
  cancelLabel,
  tone = "primary",
  pending = false,
  children,
  ...overlayProps
}: ConfirmDialogProps) {
  const t = useOverlayLabels();

  return (
    <Overlay
      {...overlayProps}
      onClose={onClose}
      size={overlayProps.size ?? "sm"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            {cancelLabel ?? t("common.cancel")}
          </Button>
          <Button variant={tone} onClick={onConfirm} disabled={pending} data-autofocus="true">
            {confirmLabel ?? t("common.confirm")}
          </Button>
        </>
      }
    >
      {children}
    </Overlay>
  );
}
