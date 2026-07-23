/**
 * Hosts the active feature inside the brand-defining white rectangle while the
 * shell keeps route/page identity and universal assistant access outside feature code.
 */
import { Sparkles } from "lucide-react";
import type { ReactNode, MouseEvent } from "react";
import { useTranslation } from "react-i18next";
import { NavToggle } from "./NavToggle";

export function MainPanel({
  navCollapsed,
  onToggle,
  navId,
  title,
  aiCollapsed,
  onToggleAi,
  children,
}: {
  navCollapsed: boolean;
  onToggle: () => void;
  navId: string;
  title: string;
  aiCollapsed: boolean;
  onToggleAi: () => void;
  children: ReactNode;
}) {
  const { t } = useTranslation();

  function handleDoubleClick(e: MouseEvent<HTMLElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    if (x < 40) {
      onToggle();
    }
  }

  return (
    <div className="rect-panel" onDoubleClick={handleDoubleClick}>
      <NavToggle collapsed={navCollapsed} onToggle={onToggle} navId={navId} />

      {aiCollapsed ? (
        <button
          type="button"
          className="rect-ai-fab"
          onClick={onToggleAi}
          aria-expanded="false"
          aria-controls="rectangle-ai-panel-body"
          aria-label={t("shell.ai.open")}
          title={t("shell.ai.open")}
        >
          <Sparkles size={18} strokeWidth={2.05} aria-hidden />
        </button>
      ) : null}

      <header className="rect-panel__header">
        <h1 className="rect-panel__title">{title}</h1>
      </header>

      <main className="rect-panel__body" id="main-content">
        {children}
      </main>
    </div>
  );
}
