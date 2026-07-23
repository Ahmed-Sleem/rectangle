/**
 * Reusable icon-only control for expanding/collapsing the AI side panel.
 */
import { PanelRightClose, PanelRightOpen } from "lucide-react";
import { useTranslation } from "react-i18next";

export function AiPanelToggle({
  collapsed,
  onToggle,
}: {
  collapsed: boolean;
  onToggle: () => void;
}) {
  const { t } = useTranslation();
  const Icon = collapsed ? PanelRightOpen : PanelRightClose;
  const label = collapsed ? t("shell.ai.open") : t("shell.ai.close");

  return (
    <button
      type="button"
      className="rect-ai-toggle"
      onClick={onToggle}
      aria-expanded={!collapsed}
      aria-controls="rectangle-ai-panel-body"
      aria-label={label}
      title={label}
    >
      <Icon strokeWidth={2.1} absoluteStrokeWidth aria-hidden />
    </button>
  );
}
