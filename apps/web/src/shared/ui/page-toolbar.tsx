/**
 * The toolbar every data page wears.
 *
 * One component rather than each page assembling its own row, so search sits
 * in the same place, filters open the same way, and the view toggle lands
 * against the same edge everywhere. A person who learns one page has learned
 * the rest.
 *
 * Filters are declared as **data**, not passed as children. That is what lets
 * this component put them in a window, summarise them as badges, count them,
 * and clear them — none of which is possible when they arrive as opaque JSX.
 */
import { Filter, RefreshCw, X } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/shared/lib/cn";
import { Badge, Button, Checkbox, IconButton } from "./primitives";
import { SearchInput } from "./search-input";
import { Select } from "./select";
import { Overlay } from "./overlay";
import { ViewToggle, type ViewToggleOption } from "./page-blocks";
import "./page-toolbar.css";

export interface ToolbarSearch {
  value: string;
  onChange: (value: string) => void;
  /** Accessible name; also names the clear control. */
  label: string;
  placeholder?: string;
}

export interface SelectFilterOption {
  value: string;
  label: string;
}

/** A filter narrowing a list to one value out of several. */
export interface SelectFilter {
  id: string;
  type: "select";
  label: string;
  value: string;
  /** Shown when nothing is chosen, e.g. "All projects". */
  anyLabel: string;
  options: readonly SelectFilterOption[];
  onChange: (value: string) => void;
}

/** A filter that is either on or off, e.g. "my tasks". */
export interface ToggleFilter {
  id: string;
  type: "toggle";
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
}

export type ToolbarFilter = SelectFilter | ToggleFilter;

export interface ToolbarView<T extends string> {
  value: T;
  label: string;
  options: ReadonlyArray<ViewToggleOption<T>>;
  onChange: (value: T) => void;
}

export interface PageToolbarProps<T extends string> {
  /** Omit on pages with nothing to search. */
  search?: ToolbarSearch;
  filters?: readonly ToolbarFilter[];
  /** Resets every filter at once. Required when filters are supplied. */
  onClearFilters?: () => void;
  /** The page's own controls, e.g. a create button. */
  actions?: ReactNode;
  /**
   * A control that picks which slice of the data the page is showing, rendered
   * beside the view toggle at the end of the row.
   *
   * There used to be a `leading` slot that put such a control *before* search,
   * used by exactly one page. One page with its own order is not a variation,
   * it is an inconsistency: somebody who has learned where the search box lives
   * has to relearn it. Everything that answers "how am I looking at this" now
   * shares one end of the row and everything that answers "which records"
   * shares the other, on every page.
   */
  scope?: ReactNode;
  /**
   * A register picker, rendered beside the view toggle at the end of the row.
   *
   * Both controls answer "how am I looking at this page", so they belong
   * together; search and filters answer "which records", which is a different
   * question and keeps the other end of the row. Placed here in the DOM rather
   * than reordered with CSS, so the keyboard path matches what the eye sees.
   */
  register?: ReactNode;
  view?: ToolbarView<T>;
  /**
   * Fetches the page's data again, now.
   *
   * The product refreshes itself on a short staleness window and whenever the
   * tab regains focus, which covers almost everything. This is for the case
   * those cannot: somebody who has just been told by a colleague that the
   * record changed, and wants to see it without waiting or alt-tabbing. It
   * lives here rather than on each page so it is in the same corner every
   * time, and so `pending` spins the same way everywhere.
   */
  refresh?: ToolbarRefresh;
  className?: string;
}

export interface ToolbarRefresh {
  onRefresh: () => void;
  /** Spins the icon and blocks a second press while a fetch is in flight. */
  pending?: boolean;
}

/** A filter counts as active when it would change what the list returns. */
function isActive(filter: ToolbarFilter): boolean {
  return filter.type === "toggle" ? filter.value : filter.value !== "";
}

/** What a badge says: the chosen option's own words, not the filter's name. */
function describe(filter: ToolbarFilter): string {
  if (filter.type === "toggle") return filter.label;
  const chosen = filter.options.find((option) => option.value === filter.value);
  return chosen ? `${filter.label}: ${chosen.label}` : filter.label;
}

function clearFilter(filter: ToolbarFilter): void {
  if (filter.type === "toggle") filter.onChange(false);
  else filter.onChange("");
}

export function PageToolbar<T extends string>({
  search,
  filters = [],
  onClearFilters,
  actions,
  scope,
  register,
  view,
  refresh,
  className,
}: PageToolbarProps<T>) {
  const { t } = useTranslation();
  const [filtersOpen, setFiltersOpen] = useState(false);

  const active = filters.filter(isActive);

  return (
    <div className={cn("rect-toolbar", className)}>
      <div className="rect-toolbar__row">
        {search ? (
          /*
           * No submit button: the list filters as you type, so a button would
           * either do nothing or imply that typing alone was not enough.
           */
          <SearchInput
            value={search.value}
            onChange={search.onChange}
            label={search.label}
            {...(search.placeholder ? { placeholder: search.placeholder } : {})}
          />
        ) : null}

        {filters.length > 0 ? (
          <Button
            variant="secondary"
            className="rect-toolbar__filter-button"
            onClick={() => setFiltersOpen(true)}
            aria-expanded={filtersOpen}
          >
            <Filter size={16} strokeWidth={2} aria-hidden />
            {t("toolbar.filters")}
            {/* The count survives the window closing; without it the state is
                invisible and a short list looks like missing data. */}
            {active.length > 0 ? (
              <span className="rect-toolbar__filter-count">{active.length}</span>
            ) : null}
          </Button>
        ) : null}

        {actions}

        {/* Pushes the register and view controls against the canvas edge. */}
        <span className="rect-toolbar__spacer" aria-hidden />

        {scope}

        {refresh ? (
          <IconButton
            label={t("toolbar.refresh")}
            variant="soft"
            onClick={refresh.onRefresh}
            disabled={refresh.pending ?? false}
          >
            <RefreshCw
              size={16}
              strokeWidth={2}
              aria-hidden
              className={cn(
                "rect-toolbar__refresh-icon",
                refresh.pending && "rect-toolbar__refresh-icon--spinning",
              )}
            />
          </IconButton>
        ) : null}

        {register}

        {view ? (
          <ViewToggle<T>
            label={view.label}
            value={view.value}
            options={view.options}
            onChange={view.onChange}
          />
        ) : null}
      </div>

      {/*
        The chosen filters, on their own row. Absent when nothing is filtered,
        because an empty row is furniture. This is the only place a single
        filter is removed; the window holds the controls, this shows the result.
      */}
      {active.length > 0 ? (
        <div className="rect-toolbar__applied" aria-label={t("toolbar.appliedFilters")}>
          {active.map((filter) => (
            <button
              key={filter.id}
              type="button"
              className="rect-toolbar__chip"
              onClick={() => clearFilter(filter)}
              aria-label={t("toolbar.removeFilter", { filter: describe(filter) })}
            >
              <span>{describe(filter)}</span>
              <X size={12} strokeWidth={2.4} aria-hidden />
            </button>
          ))}
          {onClearFilters ? (
            <Button size="sm" variant="ghost" onClick={onClearFilters}>
              {t("toolbar.clearAll")}
            </Button>
          ) : null}
        </div>
      ) : null}

      <Overlay
        open={filtersOpen}
        title={t("toolbar.filters")}
        description={t("toolbar.filtersDescription")}
        size="sm"
        onClose={() => setFiltersOpen(false)}
        footer={
          <>
            {onClearFilters && active.length > 0 ? (
              <Button variant="ghost" onClick={onClearFilters}>
                {t("toolbar.clearAll")}
              </Button>
            ) : null}
            <Button variant="primary" onClick={() => setFiltersOpen(false)}>
              {t("toolbar.done")}
            </Button>
          </>
        }
      >
        {/*
          Changes apply as they are made. A Save button would imply they are
          otherwise lost, and would need a Cancel that reverts them — a second
          copy of the state to keep in step for no benefit.
        */}
        <div className="rect-toolbar__filter-form">
          {filters.map((filter) =>
            filter.type === "toggle" ? (
              <Checkbox
                key={filter.id}
                label={filter.label}
                checked={filter.value}
                onChange={(event) => filter.onChange(event.target.checked)}
              />
            ) : (
              /*
               * The shared dropdown, not a second one. This was a bare
               * `<select>`, so the filter window was the one place in the
               * product still showing an operating-system popup — unthemed,
               * differently shaped on every platform, and stretched to the
               * width of its column. A `<label>` wrapping it no longer names
               * it either, since the control a person focuses is a button, so
               * the association is made explicitly by id.
               */
              <div key={filter.id} className="rect-toolbar__filter-field">
                <label className="rect-toolbar__filter-label" htmlFor={`${filter.id}-filter`}>
                  {filter.label}
                </label>
                <Select
                  id={`${filter.id}-filter`}
                  value={filter.value}
                  onChange={(event) => filter.onChange(event.target.value)}
                >
                  <option value="">{filter.anyLabel}</option>
                  {filter.options.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </div>
            ),
          )}
        </div>
      </Overlay>
    </div>
  );
}

/** Re-exported so a page can badge something outside the filter set. */
export { Badge as ToolbarBadge };
