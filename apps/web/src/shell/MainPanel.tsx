/**
 * Hosts the active feature inside the brand-defining white rectangle while the
 * shell keeps route/page identity and universal assistant access outside feature code.
 */
import { Search, Sparkles } from "lucide-react";
import type { ReactNode, MouseEvent } from "react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { NavToggle } from "./NavToggle";
import { GlobalSearch } from "./search/GlobalSearch";
import { useScrollEdges } from "./useScrollEdges";

export function MainPanel({
  navCollapsed,
  onToggle,
  navId,
  title,
  aiCollapsed,
  onToggleAi,
  children,
}: {
  navCollapsed: boolean;
  onToggle: () => void;
  navId: string;
  title: string;
  aiCollapsed: boolean;
  onToggleAi: () => void;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const { ref: bodyRef, edges } = useScrollEdges<HTMLElement>();
  const [searchOpen, setSearchOpen] = useState(false);

  // Cmd/Ctrl+K is the shortcut people already expect for this. Bound at the
  // window so it works wherever focus happens to be.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen(true);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  function handleDoubleClick(e: MouseEvent<HTMLElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    if (x < 40) {
      onToggle();
    }
  }

  return (
    <div className="rect-panel" onDoubleClick={handleDoubleClick}>
      <NavToggle collapsed={navCollapsed} onToggle={onToggle} navId={navId} />

      {aiCollapsed ? (
        <button
          type="button"
          className="rect-ai-fab"
          onClick={onToggleAi}
          aria-expanded="false"
          aria-controls="rectangle-ai-panel-body"
          aria-label={t("shell.ai.open")}
          title={t("shell.ai.open")}
        >
          <Sparkles size={18} strokeWidth={2.05} aria-hidden />
        </button>
      ) : null}

      <header className="rect-panel__header">
        <div className="rect-panel__heading">
          <h1 className="rect-panel__title">{title}</h1>
        </div>
        <div className="rect-panel__actions">
          <button
            type="button"
            className="rect-panel__search"
            onClick={() => setSearchOpen(true)}
            aria-label={t("shell.search.open")}
            title={t("shell.search.open")}
          >
            <Search size={16} strokeWidth={2} aria-hidden />
            <span className="rect-panel__search-text">{t("shell.search.open")}</span>
          </button>
        </div>
      </header>

      <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />

      <main
        className="rect-panel__body"
        id="main-content"
        ref={bodyRef}
        data-scroll-top={edges.atTop ? "true" : "false"}
        data-scroll-bottom={edges.atBottom ? "true" : "false"}
      >
        <div className="rect-panel__content">{children}</div>
      </main>
    </div>
  );
}
