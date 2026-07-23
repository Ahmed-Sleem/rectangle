/**
 * Provides a circular chrome control for opening and closing the feature rail.
 * It sits at the lower-left of the menu area so the control feels like part of
 * global navigation, not a page-level action.
 */
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useTranslation } from "react-i18next";

export function NavToggle({
  collapsed,
  onToggle,
  navId,
}: {
  collapsed: boolean;
  onToggle: () => void;
  navId: string;
}) {
  const { t } = useTranslation();
  const Icon = collapsed ? PanelLeftOpen : PanelLeftClose;
  const label = collapsed ? t("shell.nav.expand") : t("shell.nav.collapse");

  return (
    <button
      type="button"
      className="rect-nav-toggle"
      onClick={onToggle}
      aria-expanded={!collapsed}
      aria-controls={navId}
      aria-label={label}
      title={label}
    >
      <Icon strokeWidth={2} absoluteStrokeWidth aria-hidden />
    </button>
  );
}
