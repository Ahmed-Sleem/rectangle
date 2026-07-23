/**
 * Provides a circular chrome control for opening and closing the feature rail.
 * It sits at the lower-left of the menu area so the control feels like part of
 * global navigation, not a page-level action.
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
    </button>
  );
}
