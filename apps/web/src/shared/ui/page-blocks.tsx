/**
 * Page composition blocks.
 *
 * Every data page in Rectangle follows the same skeleton, so the skeleton itself
 * is a shared component rather than a layout each page reinvents:
 *
 *   action bar   → search, filters, view toggle, primary action
 *   summary row  → a few headline numbers
 *   main content → table or card grid
 *   side panel   → breakdown, recent activity, or upcoming work
 *
 * Summary figures must be derived from records the page already has. A number
 * with no field behind it is not shown at all.
 */
import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/shared/lib/cn";

export interface StatCardProps extends HTMLAttributes<HTMLDivElement> {
  label: string;
  value: string | number;
  /** Short qualifier under the value, e.g. how many of these are archived. */
  hint?: string;
  icon?: ReactNode;
  /** Marks the figure that most deserves attention. Use sparingly. */
  emphasis?: boolean;
}

export function StatCard({ label, value, hint, icon, emphasis, className, ...props }: StatCardProps) {
  return (
    <div className={cn("rect-stat", emphasis && "rect-stat--emphasis", className)} {...props}>
      {icon ? (
        <span className="rect-stat__icon" aria-hidden>
          {icon}
        </span>
      ) : null}
      <span className="rect-stat__body">
        <span className="rect-stat__label">{label}</span>
        <span className="rect-stat__value">{value}</span>
        {hint ? <span className="rect-stat__hint">{hint}</span> : null}
      </span>
    </div>
  );
}

export interface StatRowProps extends HTMLAttributes<HTMLDivElement> {
  label: string;
}

/** A row of headline figures. Keep to six or fewer; past that they stop being read. */
export function StatRow({ label, className, children, ...props }: StatRowProps) {
  return (
    <div className={cn("rect-stat-row", className)} role="group" aria-label={label} {...props}>
      {children}
    </div>
  );
}

export interface ViewToggleOption<T extends string> {
  value: T;
  label: string;
  icon?: ReactNode;
}

export interface ViewToggleProps<T extends string> {
  label: string;
  value: T;
  options: ReadonlyArray<ViewToggleOption<T>>;
  onChange: (value: T) => void;
  className?: string;
  /**
   * Show each option's text beside its icon.
   *
   * The default is a square icon-only control, which is right for switching how
   * the same records are drawn (cards or rows) because the icon is the whole
   * message. It is wrong for switching *which* records are shown, where the
   * words carry the meaning and a fixed square would crop them.
   */
  showLabels?: boolean;
}

/**
 * Switches how the same records are displayed. Radio semantics because exactly
 * one view is active; the icon carries the meaning and the label names it.
 */
export function ViewToggle<T extends string>({
  label,
  value,
  options,
  onChange,
  className,
  showLabels = false,
}: ViewToggleProps<T>) {
  return (
    <div
      className={cn("rect-view-toggle", showLabels && "rect-view-toggle--labelled", className)}
      role="radiogroup"
      aria-label={label}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            {...(showLabels ? {} : { "aria-label": option.label, title: option.label })}
            className={cn("rect-view-toggle__option", selected && "rect-view-toggle__option--selected")}
            onClick={() => onChange(option.value)}
          >
            {option.icon}
            {showLabels ? <span className="rect-view-toggle__text">{option.label}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

export interface CardGridProps extends HTMLAttributes<HTMLDivElement> {
  label: string;
}

/** Responsive card grid. Columns follow available width rather than a fixed count. */
export function CardGrid({ label, className, children, ...props }: CardGridProps) {
  return (
    <div className={cn("rect-card-grid", className)} role="list" aria-label={label} {...props}>
      {children}
    </div>
  );
}

export interface AvatarGroupProps {
  /** Display names. Initials are derived; no image storage is assumed. */
  names: string[];
  max?: number;
  label: string;
  emptyLabel: string;
}

/** Derives initials from a name, handling Arabic and Latin scripts alike. */
function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/u).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return [...parts[0]!].slice(0, 1).join("");
  return [...parts[0]!].slice(0, 1).join("") + [...parts[parts.length - 1]!].slice(0, 1).join("");
}

export function AvatarGroup({ names, max = 4, label, emptyLabel }: AvatarGroupProps) {
  if (names.length === 0) {
    return <span className="rect-avatars__empty">{emptyLabel}</span>;
  }

  const shown = names.slice(0, max);
  const overflow = names.length - shown.length;

  return (
    <span className="rect-avatars" aria-label={label}>
      {shown.map((name) => (
        <span key={name} className="rect-avatars__item" title={name} aria-hidden>
          {initialsOf(name)}
        </span>
      ))}
      {overflow > 0 ? (
        <span className="rect-avatars__item rect-avatars__item--more" aria-hidden>
          +{overflow}
        </span>
      ) : null}
      {/* The visual initials are decorative; names are read out here instead. */}
      <span className="rect-visually-hidden">{names.join(", ")}</span>
    </span>
  );
}

export interface ProgressBarProps {
  done: number;
  total: number;
  /** Accessible name, e.g. the project this progress belongs to. */
  label: string;
  /** Renders "7 of 12" beside the percentage. Off in dense table cells. */
  showCounts?: boolean;
  className?: string;
}

/**
 * Completion of countable work.
 *
 * Only rendered where a real denominator exists — the caller decides that, and
 * a project with no tasks shows nothing rather than an empty bar, because 0%
 * would claim it had started and achieved nothing.
 *
 * The counts are shown alongside the percentage because a bare "50%" hides
 * whether it means one task of two or fifty of a hundred.
 */
export function ProgressBar({ done, total, label, showCounts = true, className }: ProgressBarProps) {
  const percent = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <div className={cn("rect-progress", className)}>
      <div className="rect-progress__head">
        <span className="rect-progress__percent">{percent}%</span>
        {showCounts ? (
          <span className="rect-progress__counts">
            {done}/{total}
          </span>
        ) : null}
      </div>
      <div
        className="rect-progress__track"
        role="progressbar"
        aria-valuenow={done}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-label={label}
        aria-valuetext={`${percent}%`}
      >
        <span
          className={cn("rect-progress__fill", percent === 100 && "rect-progress__fill--complete")}
          style={{ inlineSize: `${percent}%` }}
        />
      </div>
    </div>
  );
}

export interface SidePanelProps extends HTMLAttributes<HTMLElement> {
  title: string;
}

/** Secondary column beside the main content: breakdowns, recent items, context. */
export function SidePanel({ title, className, children, ...props }: SidePanelProps) {
  return (
    <aside className={cn("rect-side-panel", className)} aria-label={title} {...props}>
      <h3 className="rect-side-panel__title">{title}</h3>
      <div className="rect-side-panel__body">{children}</div>
    </aside>
  );
}

export interface BreakdownBarProps {
  label: string;
  value: number;
  total: number;
  tone?: "neutral" | "success" | "warning" | "danger" | "info";
}

/** Proportion of a whole. Only render where the total is a real, known number. */
export function BreakdownBar({ label, value, total, tone = "neutral" }: BreakdownBarProps) {
  const percent = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className="rect-breakdown">
      <div className="rect-breakdown__head">
        <span className="rect-breakdown__label">{label}</span>
        <span className="rect-breakdown__value">{value}</span>
      </div>
      <div
        className="rect-breakdown__track"
        role="meter"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-label={label}
      >
        <span
          className={cn("rect-breakdown__fill", `rect-breakdown__fill--${tone}`)}
          style={{ inlineSize: `${percent}%` }}
        />
      </div>
    </div>
  );
}
