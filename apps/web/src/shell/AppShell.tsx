/**
 * Composes the permanent Rectangle chrome around registry-loaded feature pages.
 * Feature modules stay standalone; this shell only supplies navigation, work
 * surface, and the universal AI side panel / floating assistant launcher.
 *
 * Two arrangements of the same three zones, chosen by how much room there is.
 *
 * On a desktop or tablet the rail, the canvas and the assistant sit side by
 * side and each can be widened or narrowed — there is space for all three, and
 * seeing them at once is the point of the layout.
 *
 * On a phone there is not. Stacking them vertically, which is what this used to
 * do, gave the canvas a wrapped strip of navigation above it and, when the
 * assistant was open, a slab below it — so the work surface never had the
 * screen. On a handset the canvas takes everything, and the rail and the
 * assistant become full-screen sheets that are either open or closed. Widening
 * something that already fills the screen is meaningless, so on a phone the
 * expand and contract controls are not offered at all.
 */
import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { AiAssistantPanel } from "./ai";
import { MainPanel } from "./MainPanel";
import { SideNav } from "./SideNav";
import { CanvasSheet } from "./CanvasSheet";
import { cn } from "@/shared/lib/cn";
import { useIsHandset } from "@/shared/lib/useIsHandset";
import "./shell.css";

const NAV_ID = "rectangle-main-nav";

export function AppShell({
  navCollapsed,
  onToggleNav,
  aiCollapsed,
  onToggleAi,
  title,
  children,
}: {
  navCollapsed: boolean;
  onToggleNav: () => void;
  aiCollapsed: boolean;
  onToggleAi: () => void;
  title: string;
  children: ReactNode;
}) {
  const isHandset = useIsHandset();
  const { t } = useTranslation();

  /*
   * A sheet is a transient thing, not a preference, so its state is local and
   * starts closed every time.
   *
   * Reusing the desktop collapse booleans here was wrong in a way that only
   * showed up once it was rendered: they default to "expanded", which on a
   * phone means both sheets covering the screen before the person has asked
   * for anything. What somebody wants their rail to look like beside a canvas
   * says nothing about whether they want it over their canvas right now.
   */
  const [navSheetOpen, setNavSheetOpen] = useState(false);
  const [aiSheetOpen, setAiSheetOpen] = useState(false);

  if (isHandset) {
    /*
     * The sheets are passed into the canvas rather than rendered beside it.
     *
     * They used to be portalled windows laid over the whole shell, which is why
     * they read as dialogs that had appeared on top of the product. On a phone
     * the rail and the assistant are not something covering the work — while
     * they are open they are the work, so they belong inside the surface the
     * person is looking at, filling it completely, with the header they were
     * opened from still above them.
     */
    return (
      <div className="rect-app rect-app--handset" data-testid="app-shell">
        <MainPanel
          navCollapsed={!navSheetOpen}
          onToggle={() => setNavSheetOpen((open) => !open)}
          navId={NAV_ID}
          title={title}
          aiCollapsed={!aiSheetOpen}
          onToggleAi={() => setAiSheetOpen((open) => !open)}
          isHandset
          canvasSheet={
            navSheetOpen ? (
              <CanvasSheet
                open
                onClose={() => setNavSheetOpen(false)}
                label={t("shell.nav.main")}
                className="rect-canvas-sheet--nav"
              >
                <SideNav collapsed={false} navId={NAV_ID} onNavigate={() => setNavSheetOpen(false)} />
              </CanvasSheet>
            ) : aiSheetOpen ? (
              <CanvasSheet
                open
                onClose={() => setAiSheetOpen(false)}
                label={t("shell.ai.assistant")}
                className="rect-canvas-sheet--ai"
              >
                <AiAssistantPanel collapsed={false} onToggle={() => setAiSheetOpen(false)} hideOwnToggle />
              </CanvasSheet>
            ) : null
          }
        >
          {children}
        </MainPanel>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "rect-app",
        navCollapsed && "rect-app--collapsed",
        aiCollapsed && "rect-app--ai-collapsed",
      )}
      data-testid="app-shell"
    >
      <SideNav collapsed={navCollapsed} navId={NAV_ID} />
      <MainPanel
        navCollapsed={navCollapsed}
        onToggle={onToggleNav}
        navId={NAV_ID}
        title={title}
        aiCollapsed={aiCollapsed}
        onToggleAi={onToggleAi}
      >
        {children}
      </MainPanel>
      <AiAssistantPanel collapsed={aiCollapsed} onToggle={onToggleAi} />
    </div>
  );
}
