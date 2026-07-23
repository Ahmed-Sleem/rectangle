/**
 * Provides a compact in-menu control for opening and closing the feature rail.
 * It sits above the account/profile section where users expect chrome controls
 * that affect the whole menu, not the active page canvas.
 */
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";

export function NavToggle({
  collapsed,
  onToggle,
  navId,
}: {
  collapsed: boolean;
  onToggle: () => void;
  navId: string;
}) {
  const Icon = collapsed ? PanelLeftOpen : PanelLeftClose;
  const label = collapsed ? "Expand" : "Collapse";

  return (
    <button
      type="button"
      className="rect-nav-toggle"
      onClick={onToggle}
      aria-expanded={!collapsed}
      aria-controls={navId}
      aria-label={collapsed ? "Expand menu" : "Collapse menu"}
      title={collapsed ? "Expand menu" : "Collapse menu"}
    >
      <Icon strokeWidth={2} absoluteStrokeWidth aria-hidden />
      <span className="rect-nav-toggle__label">{label}</span>
    </button>
  );
}
