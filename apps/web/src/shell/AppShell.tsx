import type { ReactNode } from "react";
import { MainPanel } from "./MainPanel";
import { SideNav } from "./SideNav";
import { cn } from "@/shared/lib/cn";
import "./shell.css";

const NAV_ID = "rectangle-main-nav";

export function AppShell({
  collapsed,
  onToggle,
  title,
  badge,
  children,
}: {
  collapsed: boolean;
  onToggle: () => void;
  title: string;
  badge: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn("rect-app", collapsed && "rect-app--collapsed")}
      data-testid="app-shell"
    >
      <SideNav collapsed={collapsed} navId={NAV_ID} />
      <MainPanel
        collapsed={collapsed}
        onToggle={onToggle}
        navId={NAV_ID}
        title={title}
        badge={badge}
      >
        {children}
      </MainPanel>
    </div>
  );
}
