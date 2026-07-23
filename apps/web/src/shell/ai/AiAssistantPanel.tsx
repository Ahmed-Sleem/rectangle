/**
 * Renders the shell-owned AI chat surface without pretending a model exists.
 * Presence state keeps the panel mounted briefly while closing so the motion can
 * feel smooth instead of disappearing instantly.
 */
import { FileText, SendHorizontal, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { AiPanelToggle } from "./AiPanelToggle";
import type { AiAssistantPanelProps } from "./ai-types";
import { cn } from "@/shared/lib/cn";
import "./ai-panel.css";

const EXIT_ANIMATION_MS = 260;

export function AiAssistantPanel({
  collapsed,
  onToggle,
}: AiAssistantPanelProps) {
  const { t } = useTranslation();
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

  const currentPageLabel = useCurrentPageContext
    ? t("shell.ai.currentPageOn")
    : t("shell.ai.currentPageOff");

  if (!shouldRender) return null;

  return (
    <aside
      className={cn("rect-ai-panel", isClosing && "rect-ai-panel--closing")}
      aria-label={t("shell.ai.assistant")}
      aria-hidden={isClosing}
    >
      <header className="rect-ai-panel__header">
        <div className="rect-ai-panel__identity">
          <span className="rect-ai-panel__mark" aria-hidden>
            <Sparkles size={16} strokeWidth={2.1} />
          </span>
          <div>
            <h2 className="rect-ai-panel__title">{t("shell.ai.assistant")}</h2>
            <p className="rect-ai-panel__status">{t("shell.ai.statusPending")}</p>
          </div>
        </div>
        <AiPanelToggle collapsed={false} onToggle={onToggle} />
      </header>

      <div className="rect-ai-panel__body" id="rectangle-ai-panel-body">
        <div className="rect-ai-panel__empty" role="status">
          <Sparkles size={28} strokeWidth={1.8} aria-hidden />
          <p className="rect-ai-panel__empty-title">{t("shell.ai.readyTitle")}</p>
          <p className="rect-ai-panel__empty-text">{t("shell.ai.readyText")}</p>
        </div>
      </div>

      <form className="rect-ai-composer" aria-label={t("shell.ai.composerLabel")}>
        <label className="rect-ai-composer__label" htmlFor="rect-ai-message">
          {t("shell.ai.composerLabel")}
        </label>
        <textarea
          id="rect-ai-message"
          className="rect-ai-composer__input"
          placeholder={t("shell.ai.placeholder")}
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
              aria-label={currentPageLabel}
              title={currentPageLabel}
              onClick={() => setUseCurrentPageContext((value) => !value)}
            >
              <FileText size={15} strokeWidth={2} aria-hidden />
              <span className="sr-only">{t("shell.ai.currentPage")}</span>
            </button>
          </div>
          <button type="submit" className="rect-ai-composer__send" disabled>
            <SendHorizontal size={15} strokeWidth={2.1} aria-hidden />
            {t("shell.ai.send")}
          </button>
        </div>
      </form>
    </aside>
  );
}
