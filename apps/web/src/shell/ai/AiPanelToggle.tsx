/**
 * Reusable icon-only control for expanding/collapsing the AI side panel.
 */
import { PanelRightClose, PanelRightOpen } from "lucide-react";

export function AiPanelToggle({
  collapsed,
  onToggle,
}: {
  collapsed: boolean;
  onToggle: () => void;
}) {
  const Icon = collapsed ? PanelRightOpen : PanelRightClose;

  return (
    <button
      type="button"
      className="rect-ai-toggle"
      onClick={onToggle}
      aria-expanded={!collapsed}
      aria-controls="rectangle-ai-panel-body"
      aria-label={collapsed ? "Open AI panel" : "Close AI panel"}
      title={collapsed ? "Open AI panel" : "Close AI panel"}
    >
      <Icon strokeWidth={2.1} absoluteStrokeWidth aria-hidden />
    </button>
  );
}
