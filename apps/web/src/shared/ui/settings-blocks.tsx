/**
 * Shared configuration building blocks.
 *
 * These exist so every settings-style surface in the product is assembled from
 * the same parts. A page composes sections and rows; it never hand-rolls a
 * disclosure, because that is how expand/collapse affordances drift and
 * disappear.
 */
import type { HTMLAttributes, ReactNode } from "react";
import { useId } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/shared/lib/cn";

export interface SettingsSectionProps extends Omit<HTMLAttributes<HTMLElement>, "title"> {
  title: string;
  description?: string;
  icon?: ReactNode;
  /** Short status shown in the header, e.g. a count or configuration state. */
  status?: ReactNode;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}

/**
 * A controlled disclosure with an explicit, animated chevron.
 *
 * Deliberately not <details>/<summary>: the native marker has to be hidden to
 * match the design, and hiding it without a replacement leaves users unable to
 * tell whether a section is open.
 */
export function SettingsSection({
  title,
  description,
  icon,
  status,
  open,
  onToggle,
  className,
  children,
  ...props
}: SettingsSectionProps) {
  const headingId = useId();
  const panelId = useId();

  return (
    <section
      className={cn("rect-section", open && "rect-section--open", className)}
      aria-labelledby={headingId}
      {...props}
    >
      <h2 className="rect-section__h">
        <button
          type="button"
          className="rect-section__trigger"
          id={headingId}
          aria-expanded={open}
          aria-controls={panelId}
          onClick={onToggle}
        >
          {icon ? (
            <span className="rect-section__icon" aria-hidden>
              {icon}
            </span>
          ) : null}

          <span className="rect-section__text">
            <span className="rect-section__title">{title}</span>
            {description ? (
              <span className="rect-section__description">{description}</span>
            ) : null}
          </span>

          {status ? <span className="rect-section__status">{status}</span> : null}

          <span className="rect-section__chevron" aria-hidden>
            <ChevronDown size={16} strokeWidth={2.2} />
          </span>
        </button>
      </h2>

      <div className="rect-section__panel" id={panelId} role="group" aria-labelledby={headingId} hidden={!open}>
        <div className="rect-section__content">{children}</div>
      </div>
    </section>
  );
}

export interface SettingRowProps extends HTMLAttributes<HTMLDivElement> {
  label: string;
  description?: string;
  /** The interactive control. Wraps below the text when space is tight. */
  control?: ReactNode;
  /** Renders the control full width beneath the label (forms, grids). */
  stacked?: boolean;
}

export function SettingRow({
  label,
  description,
  control,
  stacked = false,
  className,
  children,
  ...props
}: SettingRowProps) {
  return (
    <div className={cn("rect-setting-row", stacked && "rect-setting-row--stacked", className)} {...props}>
      <div className="rect-setting-row__text">
        <span className="rect-setting-row__label">{label}</span>
        {description ? <span className="rect-setting-row__description">{description}</span> : null}
      </div>
      {control ? <div className="rect-setting-row__control">{control}</div> : null}
      {children}
    </div>
  );
}

export interface ChoiceOption<T extends string> {
  value: T;
  label: string;
  /** Optional short qualifier shown under the label, e.g. a direction hint. */
  hint?: string;
}

export interface ChoiceGroupProps<T extends string> {
  label: string;
  value: T;
  options: ReadonlyArray<ChoiceOption<T>>;
  onChange: (value: T) => void;
  className?: string;
}

/**
 * Segmented single-select. Uses radio semantics because exactly one option is
 * always active — pressed toggle buttons would misreport that to assistive tech.
 */
export function ChoiceGroup<T extends string>({
  label,
  value,
  options,
  onChange,
  className,
}: ChoiceGroupProps<T>) {
  return (
    <div className={cn("rect-choice", className)} role="radiogroup" aria-label={label}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            className={cn("rect-choice__option", selected && "rect-choice__option--selected")}
            onClick={() => onChange(option.value)}
          >
            <span className="rect-choice__label">{option.label}</span>
            {option.hint ? <span className="rect-choice__hint">{option.hint}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

/** Vertical stack for grouping related rows/controls inside a section. */
export function SettingsStack({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rect-settings-stack", className)} {...props} />;
}
