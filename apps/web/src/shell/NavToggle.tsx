import { ChevronsLeft } from "lucide-react";

/**
 * Seam control between chrome nav and the white rectangle.
 * Always painted above the side menu (panel z-index > nav).
 */
export function NavToggle({
  collapsed,
  onToggle,
  navId,
}: {
  collapsed: boolean;
  onToggle: () => void;
  navId: string;
}) {
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
      <ChevronsLeft strokeWidth={2.25} absoluteStrokeWidth aria-hidden />
    </button>
  );
}
