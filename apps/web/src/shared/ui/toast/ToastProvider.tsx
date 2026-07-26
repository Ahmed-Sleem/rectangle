/**
 * Centralised notifications.
 *
 * One provider at the app root; anything below it calls `useToast()`. The
 * region is mounted permanently rather than created with the first message,
 * because a live region injected at the same moment as its content is not
 * announced by assistive technology — the region has to already exist for the
 * change to be a change.
 *
 * Behaviour follows the WAI-ARIA status pattern and the guidance shared by
 * Adobe React Aria, Bootstrap and Canva: polite for confirmations, assertive
 * only for errors, atomic announcements, a five-second floor, and timers that
 * pause while the pointer or keyboard focus is on the stack.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/shared/lib/cn";
import {
  ToastContext,
  type ToastApi,
  type ToastOptions,
  type ToastRecord,
  type ToastTone,
} from "./toast-context";
import "./toast.css";

/** Beyond this the stack stops being readable, so older messages give way. */
const MAX_VISIBLE = 3;

/** Accessibility floor. Below this a magnifier user cannot reach the message. */
const MIN_DURATION_MS = 5000;

/** Roughly a slow reading pace, so a long message is not cut short. */
const MS_PER_CHARACTER = 45;

const TONE_ICON: Record<ToastTone, typeof CheckCircle2> = {
  success: CheckCircle2,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
};

function durationFor(title: string, description: string | undefined, requested?: number): number {
  if (requested) return Math.max(requested, MIN_DURATION_MS);
  const length = title.length + (description?.length ?? 0);
  return Math.max(MIN_DURATION_MS, length * MS_PER_CHARACTER);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastRecord[]>([]);
  // Exiting ids are tracked separately so a dismissed toast can animate out
  // rather than vanishing the instant its timer ends.
  const [exiting, setExiting] = useState<ReadonlySet<string>>(new Set());
  const [paused, setPaused] = useState(false);
  const counter = useRef(0);

  const remove = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
    setExiting((current) => {
      const next = new Set(current);
      next.delete(id);
      return next;
    });
  }, []);

  const dismiss = useCallback(
    (id: string) => {
      setExiting((current) => new Set(current).add(id));
      // Matches the exit animation; the record survives until it has played.
      window.setTimeout(() => remove(id), 200);
    },
    [remove],
  );

  const show = useCallback((tone: ToastTone, title: string, options: ToastOptions = {}) => {
    counter.current += 1;
    const id = `toast-${counter.current}`;
    const record: ToastRecord = {
      id,
      tone,
      title,
      ...(options.description ? { description: options.description } : {}),
      durationMs: durationFor(title, options.description, options.durationMs),
    };
    // Newest first, so the corner always holds the most recent message and
    // older ones are pushed away from it.
    setToasts((current) => [record, ...current].slice(0, MAX_VISIBLE));
    return id;
  }, []);

  const api = useMemo<ToastApi>(
    () => ({
      show,
      success: (title, options) => show("success", title, options),
      error: (title, options) => show("error", title, options),
      warning: (title, options) => show("warning", title, options),
      info: (title, options) => show("info", title, options),
      dismiss,
    }),
    [show, dismiss],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <ToastRegion toasts={toasts} exiting={exiting} paused={paused} onPause={setPaused} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

function ToastRegion({
  toasts,
  exiting,
  paused,
  onPause,
  onDismiss,
}: {
  toasts: readonly ToastRecord[];
  exiting: ReadonlySet<string>;
  paused: boolean;
  onPause: (paused: boolean) => void;
  onDismiss: (id: string) => void;
}) {
  const { t } = useTranslation();

  // jsdom and the first server-less paint have no document; guard so the
  // provider is safe to render anywhere.
  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="rect-toasts"
      // Present from first render, not created with the first message.
      role="region"
      aria-label={t("shell.toasts.label")}
      onMouseEnter={() => onPause(true)}
      onMouseLeave={() => onPause(false)}
      onFocusCapture={() => onPause(true)}
      onBlurCapture={() => onPause(false)}
    >
      {toasts.map((toast) => (
        <ToastItem
          key={toast.id}
          toast={toast}
          exiting={exiting.has(toast.id)}
          paused={paused}
          onDismiss={onDismiss}
        />
      ))}
    </div>,
    document.body,
  );
}

function ToastItem({
  toast,
  exiting,
  paused,
  onDismiss,
}: {
  toast: ToastRecord;
  exiting: boolean;
  paused: boolean;
  onDismiss: (id: string) => void;
}) {
  const { t } = useTranslation();
  const Icon = TONE_ICON[toast.tone];
  // Time already spent visible, so pausing and resuming does not restart the
  // countdown from the beginning each time the pointer passes over.
  const elapsed = useRef(0);
  const startedAt = useRef(Date.now());

  useEffect(() => {
    if (paused || exiting) {
      elapsed.current += Date.now() - startedAt.current;
      return undefined;
    }

    startedAt.current = Date.now();
    const remaining = Math.max(0, (toast.durationMs ?? MIN_DURATION_MS) - elapsed.current);
    const timer = window.setTimeout(() => onDismiss(toast.id), remaining);
    return () => window.clearTimeout(timer);
  }, [paused, exiting, toast.durationMs, toast.id, onDismiss]);

  return (
    <div
      className={cn("rect-toast", `rect-toast--${toast.tone}`)}
      data-state={exiting ? "closed" : "open"}
      /* Errors interrupt; everything else waits its turn. */
      role={toast.tone === "error" ? "alert" : "status"}
      aria-live={toast.tone === "error" ? "assertive" : "polite"}
      aria-atomic="true"
    >
      <span className="rect-toast__icon" aria-hidden>
        <Icon size={18} strokeWidth={2} />
      </span>
      <span className="rect-toast__body">
        <span className="rect-toast__title">{toast.title}</span>
        {toast.description ? (
          <span className="rect-toast__description">{toast.description}</span>
        ) : null}
      </span>
      <button
        type="button"
        className="rect-toast__close"
        onClick={() => onDismiss(toast.id)}
        aria-label={t("shell.toasts.dismiss")}
      >
        <X size={14} strokeWidth={2.2} aria-hidden />
      </button>
    </div>
  );
}
