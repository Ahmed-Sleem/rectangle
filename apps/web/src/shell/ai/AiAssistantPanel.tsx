/**
 * Renders the shell-owned AI chat surface without pretending a model exists.
 * Presence state keeps the panel mounted briefly while closing so the motion can
 * feel smooth instead of disappearing instantly.
 */
import { Mic, Paperclip, SendHorizontal, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { AiPanelToggle } from "./AiPanelToggle";
import type { AiAssistantPanelProps, AiContextChip } from "./ai-types";
import { cn } from "@/shared/lib/cn";
import "./ai-panel.css";

const CONTEXT_CHIPS: AiContextChip[] = [
  { id: "page", label: "Current page" },
  { id: "project", label: "Project context" },
  { id: "docs", label: "Documents" },
];

const EXIT_ANIMATION_MS = 360;

export function AiAssistantPanel({
  collapsed,
  onToggle,
}: AiAssistantPanelProps) {
  const [shouldRender, setShouldRender] = useState(!collapsed);
  const [isClosing, setIsClosing] = useState(false);
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
    </aside>
  );
}
