import { ChevronLeft } from "lucide-react";

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
      <ChevronLeft strokeWidth={2.5} aria-hidden />
    </button>
  );
}
