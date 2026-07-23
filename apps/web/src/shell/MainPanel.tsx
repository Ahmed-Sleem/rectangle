/**
 * Hosts the active feature inside the brand-defining white rectangle while the
 * shell keeps route/page identity and universal assistant access outside feature code.
 */
import { Sparkles } from "lucide-react";
import type { ReactNode, MouseEvent } from "react";

export function MainPanel({
  onToggle,
  title,
  aiCollapsed,
  onToggleAi,
  children,
}: {
  onToggle: () => void;
  title: string;
  aiCollapsed: boolean;
  onToggleAi: () => void;
  children: ReactNode;
}) {
  function handleDoubleClick(e: MouseEvent<HTMLElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    if (x < 40) {
      onToggle();
    }
  }

  return (
    <div className="rect-panel" onDoubleClick={handleDoubleClick}>
      {aiCollapsed ? (
        <button
          type="button"
          className="rect-ai-fab"
          onClick={onToggleAi}
          aria-expanded="false"
          aria-controls="rectangle-ai-panel-body"
          aria-label="Open AI panel"
          title="Open AI panel"
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
