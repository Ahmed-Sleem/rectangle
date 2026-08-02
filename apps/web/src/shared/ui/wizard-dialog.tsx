/**
 * A form that is too long to meet all at once, asked one step at a time.
 *
 * Some configuration genuinely has several parts — a mail server has a
 * connection, an identity, and a proof that both work — and putting all of it
 * on one surface produces a wall that people skim rather than read. Splitting
 * it into steps is not decoration: it lets each step state one idea, and it
 * makes the last step a confirmation rather than a hope.
 *
 * Built on `Overlay` for the same reason everything else is: the window system
 * already portals out of the transformed canvas, locks background scrolling,
 * traps and restores focus, closes only the topmost on Escape and marks
 * everything beneath it inert. A wizard is a shape of window, not a new one.
 *
 * Deliberately general. The owner asked that multi-window patterns be built
 * once, centrally, so any part of the system can reach for them — so this
 * knows nothing about mail, and mail is simply its first caller.
 *
 * Three rules it enforces so callers cannot get them wrong:
 *
 *  - **A step that is not valid cannot be left.** Discovering on the final
 *    screen that something four steps back was wrong is the failure mode that
 *    makes people abandon a wizard.
 *  - **Going back never destroys what was typed.** Every step stays mounted;
 *    only its visibility changes. Unmounting would reset the fields inside it,
 *    which is the other thing that makes people abandon a wizard.
 *  - **Only the last step can finish.** The primary action reads "Next" until
 *    there is nothing after it, so nobody submits half a form by reflex.
 */
import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "./primitives";
import { Overlay, type OverlaySize } from "./overlay";
import "./wizard-dialog.css";

export interface WizardStep {
  /** Stable across renders; identifies the step rather than its position. */
  id: string;
  title: string;
  description?: string;
  content: ReactNode;
  /**
   * May this step be left yet?
   *
   * Omitted means yes. When it returns false the forward action is unavailable,
   * so the person is stopped at the step that needs them rather than at the end.
   */
  isComplete?: boolean;
}

export interface WizardDialogProps {
  open: boolean;
  title: string;
  description?: string;
  steps: readonly WizardStep[];
  size?: OverlaySize;
  onClose: () => void;
  /** Runs on the last step. The caller closes the window when it succeeds. */
  onFinish: () => void;
  finishLabel: string;
  pending?: boolean;
  /** User-facing failure text. Never a raw error code. */
  error?: string | null;
}

export function WizardDialog({
  open,
  title,
  description,
  steps,
  size = "md",
  onClose,
  onFinish,
  finishLabel,
  pending = false,
  error,
}: WizardDialogProps) {
  const { t } = useTranslation();
  const [index, setIndex] = useState(0);

  // Clamped rather than trusted: a caller may shorten `steps` between renders,
  // and an index past the end would render nothing at all.
  const current = Math.min(index, Math.max(0, steps.length - 1));
  const step = steps[current];
  const isLast = current === steps.length - 1;
  const canAdvance = step?.isComplete ?? true;

  if (!step) return null;

  return (
    <Overlay
      open={open}
      title={title}
      onClose={onClose}
      size={size}
      {...(description ? { description } : {})}
      footer={
        <>
          {/*
            * Back is only offered where there is somewhere to go. On the first
            * step it would either do nothing or close the window, and a control
            * that means two different things in two places is worse than one
            * that is simply absent.
            */}
          {current > 0 ? (
            <Button variant="ghost" onClick={() => setIndex(current - 1)} disabled={pending}>
              {t("wizard.back")}
            </Button>
          ) : (
            <Button variant="ghost" onClick={onClose} disabled={pending}>
              {t("common.cancel")}
            </Button>
          )}

          <span className="rect-wizard__spacer" aria-hidden />

          <Button
            variant="primary"
            onClick={() => (isLast ? onFinish() : setIndex(current + 1))}
            disabled={pending || !canAdvance}
          >
            {isLast ? (pending ? t("common.saving") : finishLabel) : t("wizard.next")}
          </Button>
        </>
      }
    >
      <div className="rect-wizard">
        {/*
          * Where they are and how much is left. A wizard without this is a
          * sequence of unrelated screens, and people cannot tell whether
          * finishing is one click away or five.
          */}
        <ol className="rect-wizard__steps" aria-label={t("wizard.progress")}>
          {steps.map((entry, position) => (
            <li
              key={entry.id}
              className="rect-wizard__step"
              data-state={
                position === current ? "current" : position < current ? "done" : "upcoming"
              }
              aria-current={position === current ? "step" : undefined}
            >
              <span className="rect-wizard__step-number">{position + 1}</span>
              <span className="rect-wizard__step-title">{entry.title}</span>
            </li>
          ))}
        </ol>

        <div className="rect-wizard__panel">
          <h3 className="rect-wizard__title">{step.title}</h3>
          {step.description ? (
            <p className="rect-wizard__description">{step.description}</p>
          ) : null}

          {/*
            * Every step stays mounted and is hidden with `hidden`, so going
            * back does not throw away what was typed. `hidden` also removes it
            * from the accessibility tree and from the tab order, which a
            * `display: none` wrapper would do too but a CSS class might not.
            */}
          {steps.map((entry, position) => (
            <div key={entry.id} className="rect-wizard__content" hidden={position !== current}>
              {entry.content}
            </div>
          ))}
        </div>

        {error ? (
          <p className="rect-wizard__error" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </Overlay>
  );
}
