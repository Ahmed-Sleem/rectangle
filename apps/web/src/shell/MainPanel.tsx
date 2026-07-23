/**
 * Hosts the active feature inside the brand-defining white rectangle while the
 * shell keeps route/page identity in the header instead of repeating the logo.
 */
import type { ReactNode, MouseEvent } from "react";
import { EdgeHoverZone } from "./EdgeHoverZone";
import { NavToggle } from "./NavToggle";

export function MainPanel({
  collapsed,
  onToggle,
  navId,
  title,
  children,
}: {
  collapsed: boolean;
  onToggle: () => void;
  navId: string;
  title: string;
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
      </header>

      <main className="rect-panel__body" id="main-content">
        {children}
      </main>
    </div>
  );
}
