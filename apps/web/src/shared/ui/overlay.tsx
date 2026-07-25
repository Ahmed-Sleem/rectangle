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
import { useId } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/shared/lib/cn";
import { Button, IconButton } from "./primitives";
import { useOverlayBehaviour } from "./overlay-behaviour";
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

export type OverlaySize = "sm" | "md" | "lg" | "xl";

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
  // Hold the window in the tree while its exit animation plays; unmounting on
  // the same tick would remove it before any closing motion could run.
  const { mounted, closing, onAnimationEnd } = useExitTransition<HTMLElement>({ open });
  const surfaceRef = useOverlayBehaviour<HTMLElement>({ open, onClose, closeOnEscape });

  if (!mounted || typeof document === "undefined") return null;

  return createPortal(
    <div
      className={cn("rect-overlay", closing && "rect-overlay--closing")}
      data-testid="overlay-backdrop"
      data-state={closing ? "closing" : "open"}
      onAnimationEnd={onAnimationEnd}
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
              label={t("common.close")}
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
    </div>,
    document.body,
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
