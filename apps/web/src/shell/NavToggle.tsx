/**
 * Provides the minimalist icon-only control for the left navigation rail so the
 * base GUI keeps a clean monochrome seam between chrome and work surface.
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
      className="rect-toggle"
      onClick={onToggle}
      aria-expanded={!collapsed}
      aria-controls={navId}
      aria-label={collapsed ? "Expand menu" : "Collapse menu"}
      title={collapsed ? "Expand menu" : "Collapse menu"}
    >
      <Icon strokeWidth={2.1} absoluteStrokeWidth aria-hidden />
    </button>
  );
}
