/**
 * Renders the shell-owned AI chat surface without pretending a model exists.
 * Presence state keeps the panel mounted briefly while closing so the motion can
 * feel smooth instead of disappearing instantly.
 */
import { FileText, SendHorizontal, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { AiPanelToggle } from "./AiPanelToggle";
import type { AiAssistantPanelProps } from "./ai-types";
import { cn } from "@/shared/lib/cn";
import "./ai-panel.css";

const EXIT_ANIMATION_MS = 260;

export function AiAssistantPanel({
  collapsed,
  onToggle,
}: AiAssistantPanelProps) {
  const [shouldRender, setShouldRender] = useState(!collapsed);
  const [isClosing, setIsClosing] = useState(false);
  const [useCurrentPageContext, setUseCurrentPageContext] = useState(true);
  const exitTimerRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    if (!collapsed) {
      if (exitTimerRef.current !== undefined) {
        window.clearTimeout(exitTimerRef.current);
        exitTimerRef.current = undefined;
      }
      setShouldRender(true);
      setIsClosing(false);
      return undefined;
    }

    if (!shouldRender) return undefined;

    setIsClosing(true);
    exitTimerRef.current = window.setTimeout(() => {
      setShouldRender(false);
      setIsClosing(false);
      exitTimerRef.current = undefined;
    }, EXIT_ANIMATION_MS);

    return () => {
      if (exitTimerRef.current !== undefined) {
        window.clearTimeout(exitTimerRef.current);
        exitTimerRef.current = undefined;
      }
    };
  }, [collapsed, shouldRender]);

  if (!shouldRender) return null;

  return (
    <aside
      className={cn("rect-ai-panel", isClosing && "rect-ai-panel--closing")}
      aria-label="AI assistant"
      aria-hidden={isClosing}
    >
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
        <AiPanelToggle collapsed={false} onToggle={onToggle} />
      </header>

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
            <button
              type="button"
              className={cn(
                "rect-ai-composer__tool",
                "rect-ai-composer__tool--context",
                useCurrentPageContext && "rect-ai-composer__tool--active",
              )}
              aria-pressed={useCurrentPageContext}
              aria-label={
                useCurrentPageContext
                  ? "Current page context on"
                  : "Current page context off"
              }
              title={
                useCurrentPageContext
                  ? "Current page context on"
                  : "Current page context off"
              }
              onClick={() => setUseCurrentPageContext((value) => !value)}
            >
              <FileText size={15} strokeWidth={2} aria-hidden />
              <span className="sr-only">Current page context</span>
            </button>
          </div>
          <button type="submit" className="rect-ai-composer__send" disabled>
            <SendHorizontal size={15} strokeWidth={2.1} aria-hidden />
            Send
          </button>
        </div>
      </form>
    </aside>
  );
}
