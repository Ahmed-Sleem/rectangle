import type { ReactNode, MouseEvent } from "react";
import { EdgeHoverZone } from "./EdgeHoverZone";
import { NavToggle } from "./NavToggle";

export function MainPanel({
  collapsed,
  onToggle,
  navId,
  title,
  badge,
  children,
}: {
  collapsed: boolean;
  onToggle: () => void;
  navId: string;
  title: string;
  badge: string;
  children: ReactNode;
}) {
  function handleDoubleClick(e: MouseEvent<HTMLElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    if (x < 40) {
      onToggle();
    }
  }

  return (
    <div className="rect-panel" onDoubleClick={handleDoubleClick}>
      <EdgeHoverZone onToggle={onToggle} />
      <NavToggle collapsed={collapsed} onToggle={onToggle} navId={navId} />

      <header className="rect-panel__header">
        <h1 className="rect-panel__title">{title}</h1>
        <span className="rect-panel__badge">{badge}</span>
      </header>

      <main className="rect-panel__body" id="main-content">
        {children}
      </main>
    </div>
  );
}
