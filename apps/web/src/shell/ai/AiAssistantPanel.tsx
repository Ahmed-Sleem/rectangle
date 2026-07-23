/**
 * Renders the shell-owned AI chat surface without pretending a model exists.
 * The UI is production-shaped, but send stays disabled until a real adapter is wired.
 */
import { Mic, Paperclip, SendHorizontal, Sparkles } from "lucide-react";
import { AiPanelToggle } from "./AiPanelToggle";
import type { AiAssistantPanelProps, AiContextChip } from "./ai-types";
import { cn } from "@/shared/lib/cn";
import "./ai-panel.css";

const CONTEXT_CHIPS: AiContextChip[] = [
  { id: "page", label: "Current page" },
  { id: "project", label: "Project context" },
  { id: "docs", label: "Documents" },
];

export function AiAssistantPanel({
  collapsed,
  onToggle,
}: AiAssistantPanelProps) {
  return (
    <aside
      className={cn("rect-ai-panel", collapsed && "rect-ai-panel--collapsed")}
      aria-label="AI assistant"
    >
      {collapsed ? (
        <div className="rect-ai-panel__rail">
          <AiPanelToggle collapsed={collapsed} onToggle={onToggle} />
          <span className="rect-ai-panel__rail-label">AI</span>
        </div>
      ) : (
        <>
          <header className="rect-ai-panel__header">
            <div className="rect-ai-panel__identity">
              <span className="rect-ai-panel__mark" aria-hidden>
                <Sparkles size={16} strokeWidth={2.1} />
              </span>
              <div>
                <h2 className="rect-ai-panel__title">AI Assistant</h2>
                <p className="rect-ai-panel__status">Model connection pending</p>
              </div>
            </div>
            <AiPanelToggle collapsed={collapsed} onToggle={onToggle} />
          </header>

          <div className="rect-ai-panel__context" aria-label="AI context sources">
            {CONTEXT_CHIPS.map((chip) => (
              <span className="rect-ai-panel__chip" key={chip.id}>
                {chip.label}
              </span>
            ))}
          </div>

          <div className="rect-ai-panel__body" id="rectangle-ai-panel-body">
            <div className="rect-ai-panel__empty" role="status">
              <Sparkles size={28} strokeWidth={1.8} aria-hidden />
              <p className="rect-ai-panel__empty-title">Ready for system AI</p>
              <p className="rect-ai-panel__empty-text">
                The chat surface is prepared. Connect a real model adapter before
                enabling send, so Rectangle never shows fake AI answers.
              </p>
            </div>
          </div>

          <form className="rect-ai-composer" aria-label="AI message composer">
            <label className="rect-ai-composer__label" htmlFor="rect-ai-message">
              Ask Rectangle AI
            </label>
            <textarea
              id="rect-ai-message"
              className="rect-ai-composer__input"
              placeholder="Connect the model to ask about schedules, risks, documents…"
              rows={3}
              disabled
            />
            <div className="rect-ai-composer__footer">
              <div className="rect-ai-composer__tools" aria-label="Composer tools">
                <button type="button" className="rect-ai-composer__tool" disabled>
                  <Paperclip size={15} strokeWidth={2} aria-hidden />
                  <span className="sr-only">Attach file</span>
                </button>
                <button type="button" className="rect-ai-composer__tool" disabled>
                  <Mic size={15} strokeWidth={2} aria-hidden />
                  <span className="sr-only">Voice input</span>
                </button>
              </div>
              <button type="submit" className="rect-ai-composer__send" disabled>
                <SendHorizontal size={15} strokeWidth={2.1} aria-hidden />
                Send
              </button>
            </div>
          </form>
        </>
      )}
    </aside>
  );
}
