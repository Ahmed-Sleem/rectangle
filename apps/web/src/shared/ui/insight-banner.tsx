/**
 * AI insight banner.
 *
 * The surface where Rectangle offers a recommendation drawn from a company's
 * own records. It exists before any model does, and says so, because the
 * alternative — showing nothing until a model arrives, then adding an
 * unfamiliar surface later — hides the feature from the people who would
 * have configured it.
 *
 * Two rules are enforced by the type rather than by convention:
 *
 * 1. A recommendation cannot be rendered without the records it came from.
 *    `sources` is required on the ready state, so an assertion with nothing
 *    behind it is a compile error rather than a review comment. This is the
 *    difference between a tool a construction client trusts and one they
 *    catch inventing a finding.
 * 2. The unconfigured state carries no claim at all. It reports that no model
 *    is connected and what will happen when one is.
 */
import { Sparkles, X } from "lucide-react";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/shared/lib/cn";

/** A record a recommendation was drawn from. Never a free-text citation. */
export interface InsightSource {
  label: string;
  href: string;
}

export type InsightState =
  /** No model configured. The banner explains rather than asserts. */
  | { status: "unavailable" }
  /** A model is connected and thinking. */
  | { status: "pending" }
  /** A model ran and found nothing worth raising, which is itself an answer. */
  | { status: "empty" }
  /** A grounded recommendation. Sources are required, not optional. */
  | { status: "ready"; headline: string; detail?: string; sources: InsightSource[] };

export interface InsightBannerProps {
  /** Distinguishes one banner's dismissal from another's. */
  surface: string;
  state: InsightState;
  className?: string;
  /** Optional action, e.g. a link to the records the advice concerns. */
  action?: ReactNode;
}

const DISMISS_PREFIX = "rectangle.insight.dismissed.";

function readDismissed(surface: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(`${DISMISS_PREFIX}${surface}`) === "true";
  } catch {
    return false;
  }
}

export function InsightBanner({ surface, state, className, action }: InsightBannerProps) {
  const { t } = useTranslation();
  const [dismissed, setDismissed] = useState(() => readDismissed(surface));

  // A different surface has its own dismissal, so switching pages does not
  // inherit a decision made somewhere else.
  useEffect(() => {
    setDismissed(readDismissed(surface));
  }, [surface]);

  const dismiss = useCallback(() => {
    setDismissed(true);
    try {
      window.localStorage.setItem(`${DISMISS_PREFIX}${surface}`, "true");
    } catch {
      /* Private browsing should not keep the banner on screen forever. */
    }
  }, [surface]);

  if (dismissed) return null;

  const copy = {
    unavailable: {
      headline: t("insight.unavailableHeadline"),
      detail: t("insight.unavailableDetail"),
    },
    pending: { headline: t("insight.pendingHeadline"), detail: t("insight.pendingDetail") },
    empty: { headline: t("insight.emptyHeadline"), detail: t("insight.emptyDetail") },
  } as const;

  const headline = state.status === "ready" ? state.headline : copy[state.status].headline;
  const detail = state.status === "ready" ? state.detail : copy[state.status].detail;

  return (
    <aside
      className={cn("rect-insight", `rect-insight--${state.status}`, className)}
      aria-label={t("insight.label")}
    >
      <span className="rect-insight__icon" aria-hidden>
        <Sparkles size={18} strokeWidth={2} />
      </span>

      <div className="rect-insight__body">
        <p className="rect-insight__headline">{headline}</p>
        {detail ? <p className="rect-insight__detail">{detail}</p> : null}

        {state.status === "ready" ? (
          <p className="rect-insight__sources">
            {/* Naming the records is what separates a finding from an opinion,
                so they are shown rather than kept behind a disclosure. */}
            <span className="rect-insight__sources-label">{t("insight.basedOn")}</span>
            {state.sources.map((source) => (
              <a key={source.href} className="rect-insight__source" href={source.href}>
                {source.label}
              </a>
            ))}
          </p>
        ) : null}

        {action ? <div className="rect-insight__action">{action}</div> : null}
      </div>

      <button
        type="button"
        className="rect-insight__dismiss"
        onClick={dismiss}
        aria-label={t("insight.dismiss")}
      >
        <X size={14} strokeWidth={2.2} aria-hidden />
      </button>
    </aside>
  );
}
