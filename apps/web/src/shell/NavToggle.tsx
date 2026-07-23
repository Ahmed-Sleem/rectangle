/**
 * Provides a compact in-menu control for opening and closing the feature rail.
 * Keeping it inside the nav header is clearer than a floating seam icon and
 * matches dense desktop app patterns where chrome controls live with chrome.
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
