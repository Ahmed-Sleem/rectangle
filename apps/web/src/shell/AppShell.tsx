/**
 * Composes the permanent Rectangle chrome around registry-loaded feature pages.
 * Feature modules stay standalone; this shell only supplies navigation, work
 * surface, and the universal AI side panel / floating assistant launcher.
 */
import type { ReactNode } from "react";
import { AiAssistantPanel } from "./ai";
import { MainPanel } from "./MainPanel";
import { SideNav } from "./SideNav";
import { cn } from "@/shared/lib/cn";
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
  return (
    <div
      className={cn(
        "rect-app",
        navCollapsed && "rect-app--collapsed",
        aiCollapsed && "rect-app--ai-collapsed",
      )}
      data-testid="app-shell"
    >
      <SideNav collapsed={navCollapsed} navId={NAV_ID} onToggle={onToggleNav} />
      <MainPanel
        onToggle={onToggleNav}
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
