/**
 * Global search palette.
 *
 * Opened from the header or with Cmd/Ctrl+K. Built on the shared Overlay so
 * focus trapping, dismissal and scroll locking behave exactly like every other
 * window in the product rather than being reimplemented here.
 *
 * Results come from one permission-scoped endpoint, so the palette can only
 * ever show records the person could already reach by navigating.
 */
import { useQuery } from "@tanstack/react-query";
import { FolderOpen, ListChecks, User } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Overlay } from "@/shared/ui";
import { search, type SearchResult, type SearchResultKind } from "./search-api";
import "./search.css";

const KIND_ICON: Record<SearchResultKind, typeof FolderOpen> = {
  project: FolderOpen,
  task: ListChecks,
  person: User,
};

const KIND_LABEL: Record<SearchResultKind, string> = {
  project: "shell.search.kindProject",
  task: "shell.search.kindTask",
  person: "shell.search.kindPerson",
};

/** Waits for a pause in typing so a search is not issued per keystroke. */
function useDebounced(value: string, delay: number): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export function GlobalSearch({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [term, setTerm] = useState("");
  const [highlighted, setHighlighted] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);

  const debounced = useDebounced(term, 200);
  const ready = debounced.trim().length >= 2;

  const results = useQuery({
    queryKey: ["search", debounced],
    queryFn: () => search(debounced.trim()),
    enabled: open && ready,
  });

  const rows = results.data?.results ?? [];

  // A new set of results invalidates the old highlight position.
  useEffect(() => {
    setHighlighted(0);
  }, [debounced]);

  // The term is cleared on close so reopening starts fresh rather than showing
  // the previous search's results for an instant.
  useEffect(() => {
    if (!open) setTerm("");
  }, [open]);

  function go(result: SearchResult) {
    onClose();
    navigate(result.href);
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (rows.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlighted((current) => (current + 1) % rows.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlighted((current) => (current - 1 + rows.length) % rows.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      const chosen = rows[highlighted];
      if (chosen) go(chosen);
    }
  }

  return (
    <Overlay open={open} title={t("shell.search.title")} size="md" onClose={onClose}>
      <div className="rect-search-palette" onKeyDown={onKeyDown}>
        <input
          type="search"
          className="rect-search-palette__input"
          data-autofocus="true"
          value={term}
          aria-label={t("shell.search.placeholder")}
          placeholder={t("shell.search.placeholder")}
          onChange={(event) => setTerm(event.target.value)}
          /* The list is owned by this input for assistive technology. */
          aria-controls="rect-search-results"
          aria-expanded={rows.length > 0}
          role="combobox"
        />

        {!ready ? (
          /* Nothing is wrong yet, so nothing is said: the placeholder already
             explains what the field is for. */
          null
        ) : results.isLoading ? (
          <p className="rect-search-palette__note">{t("shell.search.searching")}</p>
        ) : results.isError ? (
          <p className="rect-search-palette__note" role="alert">{t("shell.search.failed")}</p>
        ) : rows.length === 0 ? (
          <p className="rect-search-palette__note">{t("shell.search.noResults")}</p>
        ) : (
          <ul
            className="rect-search-palette__results"
            id="rect-search-results"
            ref={listRef}
            role="listbox"
            aria-label={t("shell.search.resultsLabel")}
          >
            {rows.map((result, index) => {
              const Icon = KIND_ICON[result.kind];
              return (
                <li key={`${result.kind}-${result.id}`} role="none">
                  <button
                    type="button"
                    role="option"
                    aria-selected={index === highlighted}
                    className={
                      index === highlighted
                        ? "rect-search-palette__result rect-search-palette__result--active"
                        : "rect-search-palette__result"
                    }
                    onMouseEnter={() => setHighlighted(index)}
                    onClick={() => go(result)}
                  >
                    <Icon size={16} strokeWidth={2} aria-hidden />
                    <span className="rect-search-palette__text">
                      <span className="rect-search-palette__title">{result.title}</span>
                      {result.subtitle ? (
                        <span className="rect-search-palette__subtitle">{result.subtitle}</span>
                      ) : null}
                    </span>
                    {/* Says what kind of thing this is, so a project and a task
                        with the same name are told apart. */}
                    <span className="rect-search-palette__kind">{t(KIND_LABEL[result.kind])}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Overlay>
  );
}
