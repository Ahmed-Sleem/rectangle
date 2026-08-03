/**
 * Hosts the active feature inside the brand-defining white rectangle while the
 * shell keeps route/page identity and universal assistant access outside feature code.
 */
import { Menu, Search, Sparkles, X } from "lucide-react";
import type { ReactNode, MouseEvent } from "react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { NavToggle } from "./NavToggle";
import { GlobalSearch } from "./search/GlobalSearch";
import { UserMenu } from "./UserMenu";
import { useScrollEdges } from "./useScrollEdges";
import { useAuth } from "@/shared/auth";
import { hasPermission } from "@/shared/auth/authority";

export function MainPanel({
  navCollapsed,
  onToggle,
  navId,
  title,
  aiCollapsed,
  onToggleAi,
  isHandset = false,
  canvasSheet,
  children,
}: {
  navCollapsed: boolean;
  onToggle: () => void;
  navId: string;
  title: string;
  aiCollapsed: boolean;
  onToggleAi: () => void;
  /**
   * On a phone the canvas is the whole screen and the other two zones are
   * sheets, so what belongs here is a pair of plain open buttons rather than
   * the widen/narrow controls, which have nothing left to widen into.
   */
  isHandset?: boolean;
  /**
   * A handset surface that takes over the canvas entirely.
   *
   * Passed in rather than rendered beside the panel so the rail and the
   * assistant occupy the work area itself, under the same header, instead of
   * floating over the whole shell as windows. Absent on anything wider than a
   * phone, where all three zones fit side by side and nothing needs to take
   * anything else's place.
   */
  canvasSheet?: ReactNode;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const auth = useAuth();
  const { ref: bodyRef, edges } = useScrollEdges<HTMLElement>();
  const [searchOpen, setSearchOpen] = useState(false);

  /*
   * Both ways into the assistant are gated on the same permission the panel
   * itself is. A button that opens an empty column would be a control pointing
   * at nothing, and the product hides what a person may not reach rather than
   * greying it out.
   */
  const mayUseAi = hasPermission(auth.user, "ai.use");

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
    // A drag-free way to reach the rail on a desktop. Meaningless on a phone,
    // where the rail is a sheet and the edge belongs to the browser's own
    // back gesture.
    if (isHandset) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    if (x < 40) {
      onToggle();
    }
  }

  return (
    <div className="rect-panel" onDoubleClick={handleDoubleClick}>
      {isHandset ? null : (
        <NavToggle collapsed={navCollapsed} onToggle={onToggle} navId={navId} />
      )}

      {/*
        * The floating assistant button belongs to the desktop canvas, where it
        * marks the edge the panel will come from. On a phone the assistant is
        * opened from the header beside everything else, so a second control
        * hovering over the content would be the same action twice.
        */}
      {!isHandset && aiCollapsed && mayUseAi ? (
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
        {isHandset ? (
          /*
           * One control for both directions. The sheet has no close button of
           * its own any more: the way out is the button that opened it, in the
           * place it was pressed, showing an X once there is something to
           * close. A dismiss control floating over the content put the exit
           * somewhere different from the entrance and read as a thing stuck on
           * top of the page rather than part of the chrome.
           */
          <button
            type="button"
            className="rect-panel__sheet-open"
            onClick={onToggle}
            aria-expanded={!navCollapsed}
            aria-controls={navId}
            aria-label={navCollapsed ? t("shell.nav.openMenu") : t("shell.nav.closeMenu")}
            title={navCollapsed ? t("shell.nav.openMenu") : t("shell.nav.closeMenu")}
          >
            {navCollapsed ? (
              <Menu size={18} strokeWidth={2} aria-hidden />
            ) : (
              <X size={18} strokeWidth={2} aria-hidden />
            )}
          </button>
        ) : null}
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
          {isHandset && mayUseAi ? (
            <button
              type="button"
              className="rect-panel__sheet-open"
              onClick={onToggleAi}
              aria-expanded={!aiCollapsed}
              aria-controls="rectangle-ai-panel-body"
              aria-label={aiCollapsed ? t("shell.ai.open") : t("shell.ai.close")}
              title={aiCollapsed ? t("shell.ai.open") : t("shell.ai.close")}
            >
              {aiCollapsed ? (
                <Sparkles size={18} strokeWidth={2} aria-hidden />
              ) : (
                <X size={18} strokeWidth={2} aria-hidden />
              )}
            </button>
          ) : null}
          <UserMenu />
        </div>
      </header>

      <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />

      <main
        className="rect-panel__body"
        id="main-content"
        ref={bodyRef}
        data-scroll-top={edges.atTop ? "true" : "false"}
        data-scroll-bottom={edges.atBottom ? "true" : "false"}
        /* A sheet brings its own scrolling, and two nested scrollers on a phone
           is how a list ends up unreachable. */
        data-has-sheet={canvasSheet ? "true" : "false"}
      >
        {canvasSheet ?? <div className="rect-panel__content">{children}</div>}
      </main>
    </div>
  );
}
