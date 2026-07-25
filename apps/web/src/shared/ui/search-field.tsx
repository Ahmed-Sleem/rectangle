/**
 * Search and filter toolbar blocks.
 *
 * Search is one of the few controls users expect to recognise instantly, so its
 * appearance is fixed here rather than rebuilt per page: a leading magnifier
 * inside the field, a real accessible name, a clear control once there is text,
 * and an optional submit button for people who do not press Enter.
 */
import type { FormEvent, HTMLAttributes, ReactNode } from "react";
import { useId } from "react";
import { Search, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/shared/lib/cn";
import { Button, IconButton } from "./primitives";

export interface SearchFieldProps {
  value: string;
  onChange: (value: string) => void;
  /** Accessible name. Also used for the clear control's label. */
  label: string;
  /** Short example of what can be typed. Never a substitute for the label. */
  placeholder?: string;
  /** Runs on submit. Live-filtering pages can omit this. */
  onSubmit?: () => void;
  /** Shows an explicit submit button beside the field. */
  submitLabel?: string;
  className?: string;
}

/**
 * The magnifier is decorative: the field already carries an accessible name, so
 * announcing the icon as well would just repeat it.
 */
export function SearchField({
  value,
  onChange,
  label,
  placeholder,
  onSubmit,
  submitLabel,
  className,
}: SearchFieldProps) {
  const { t } = useTranslation();
  const inputId = useId();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit?.();
  }

  return (
    <form className={cn("rect-search", className)} role="search" onSubmit={handleSubmit}>
      <div className="rect-search__field">
        <Search className="rect-search__icon" size={16} strokeWidth={2} aria-hidden />
        <input
          id={inputId}
          className="rect-search__input"
          type="search"
          aria-label={label}
          placeholder={placeholder}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
        {value ? (
          <IconButton
            label={t("common.clearSearch", { defaultValue: "Clear search" })}
            size="sm"
            variant="plain"
            className="rect-search__clear"
            onClick={() => onChange("")}
          >
            <X size={14} strokeWidth={2.2} aria-hidden />
          </IconButton>
        ) : null}
      </div>
      {submitLabel ? (
        <Button variant="primary" type="submit">
          {submitLabel}
        </Button>
      ) : null}
    </form>
  );
}

export interface FilterBarProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

/**
 * One row holding search, filters, and the page's primary action. Controls keep
 * their natural widths instead of stretching, and wrap rather than overflow.
 */
export function FilterBar({ className, children, ...props }: FilterBarProps) {
  return (
    <div className={cn("rect-filter-bar", className)} {...props}>
      {children}
    </div>
  );
}

export interface FilterSelectProps
  extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  /** Width hint matched to the longest option, so the control is not oversized. */
  width?: "sm" | "md" | "lg";
}

export function FilterSelect({ label, width = "md", className, children, ...props }: FilterSelectProps) {
  return (
    <select
      className={cn("rect-filter-select", `rect-filter-select--${width}`, className)}
      aria-label={label}
      {...props}
    >
      {children}
    </select>
  );
}

/** Pushes whatever follows it to the far end of the filter bar. */
export function FilterBarSpacer() {
  return <span className="rect-filter-bar__spacer" aria-hidden />;
}
