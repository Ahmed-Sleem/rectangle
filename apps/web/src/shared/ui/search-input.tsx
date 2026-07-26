/**
 * The search control, used by the page toolbar and the global palette.
 *
 * One implementation rather than two, because "icon, input, clear button" is
 * exactly the sort of thing that drifts when it is written twice: the palette
 * had already grown a different border, a different clear button and a
 * different focus behaviour from the toolbar's.
 *
 * The focus ring belongs to the wrapper, not the input. The product draws
 * focus rings inset so scroll containers cannot clip them, which means a bare
 * input inside a bordered container paints a second rectangle a few pixels
 * within the first. The container takes the ring on `:focus-within` and the
 * input suppresses its own.
 */
import { Search, X } from "lucide-react";
import { forwardRef, useId, type InputHTMLAttributes } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/shared/lib/cn";
import { IconButton } from "./primitives";
import "./search-input.css";

export interface SearchInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "onChange" | "value" | "size"> {
  value: string;
  onChange: (value: string) => void;
  /** Accessible name. Also names the clear control. */
  label: string;
  /**
   * `bar` sits in a page toolbar; `panel` is the palette, where the field is
   * the whole point of the window and is set larger to say so.
   */
  variant?: "bar" | "panel";
  className?: string;
}

export const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(function SearchInput(
  { value, onChange, label, placeholder, variant = "bar", className, ...props },
  ref,
) {
  const { t } = useTranslation();
  const inputId = useId();

  return (
    <div className={cn("rect-search-input", `rect-search-input--${variant}`, className)} role="search">
      {/* Decorative: the field already carries an accessible name, so
          announcing the icon would only repeat it. */}
      <Search className="rect-search-input__icon" size={variant === "panel" ? 18 : 16} strokeWidth={2} aria-hidden />
      <input
        ref={ref}
        id={inputId}
        className="rect-search-input__field"
        /* Not `type="search"`: browsers paint their own clear control on that,
           unstyled and different in every engine. */
        type="text"
        aria-label={label}
        placeholder={placeholder ?? label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        {...props}
      />
      {value ? (
        <IconButton
          label={t("common.clearSearch")}
          size="sm"
          variant="plain"
          className="rect-search-input__clear"
          onClick={() => onChange("")}
        >
          <X size={14} strokeWidth={2.2} aria-hidden />
        </IconButton>
      ) : null}
    </div>
  );
});
