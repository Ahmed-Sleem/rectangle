/**
 * The assistant, as a person actually meets it.
 *
 * What this replaces was the fault it is fixing. The old panel rendered a
 * disabled textarea, a disabled Send button and the words "Model connection
 * pending" — a surface that looked like a feature, refused every interaction,
 * and never said why. Somebody reading it could not tell whether they were
 * waiting for a colleague, for a purchase, or for Rectangle to finish being
 * built. That is the C42/C49 fault, and the rule it broke is that a control
 * nobody can use must either be absent or explain itself.
 *
 * So this panel never shows a dead composer. When the assistant cannot answer,
 * it says which of the four reasons applies — not set up, switched off, no key,
 * or no permission — and, where the reader is somebody who could fix it, points
 * at the place to do so. When it can answer, the composer is live.
 *
 * Two further things are load-bearing rather than decorative:
 *
 * The transcript names the tools each answer was built from. An assistant that
 * reports a number without saying where it read it is asking to be trusted; one
 * that names the search it ran can be checked.
 *
 * The confirmation card shows the proposed arguments verbatim, because they are
 * the validated arguments the server will execute. A summary written by the
 * model would be a different text from the one that runs, and approving the
 * first while the second executes is not approval.
 */
import {
  AlertTriangle,
  Check,
  History,
  Loader2,
  Plus,
  SendHorizontal,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiClientError } from "@/shared/api/client";
import { useAuth } from "@/shared/auth";
import { hasPermission } from "@/shared/auth/authority";
import { Button, EmptyState, Overlay } from "@/shared/ui";
import { cn } from "@/shared/lib/cn";
import { AiPanelToggle } from "./AiPanelToggle";
import { shellAiApi, type AiProposal, type AiStoredMessage } from "./ai-api";
import type { AiAssistantPanelProps } from "./ai-types";
import "./ai-panel.css";

const EXIT_ANIMATION_MS = 260;

/**
 * A turn on the screen.
 *
 * The question a person has just asked is shown before the server has replied,
 * so the panel does not sit blank while a model thinks. It carries no id until
 * it comes back from the server as a stored message.
 */
interface DisplayMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  usedTools: string[];
}

function fromStored(message: AiStoredMessage): DisplayMessage {
  return {
    id: message.id,
    role: message.role,
    content: message.content,
    usedTools: message.usedTools,
  };
}

export function AiAssistantPanel({
  collapsed,
  onToggle,
  hideOwnToggle = false,
}: AiAssistantPanelProps) {
  const { t } = useTranslation();
  const auth = useAuth();
  const queryClient = useQueryClient();
  const { projectId } = useParams();

  const mayUse = hasPermission(auth.user, "ai.use");

  const [shouldRender, setShouldRender] = useState(!collapsed);
  const [isClosing, setIsClosing] = useState(false);
  const [useCurrentPageContext, setUseCurrentPageContext] = useState(true);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [conversationId, setConversationId] = useState<string | undefined>(undefined);
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [proposal, setProposal] = useState<AiProposal | null>(null);
  const [draft, setDraft] = useState("");
  const exitTimerRef = useRef<number | undefined>(undefined);
  const transcriptRef = useRef<HTMLDivElement | null>(null);

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

  /*
   * Only asked for when the panel is open and the person may use it. A closed
   * panel that polls the server is a request nobody asked for, and somebody
   * without the permission has no panel for the answer to reach.
   */
  const settings = useQuery({
    queryKey: ["ai", "settings"],
    queryFn: shellAiApi.getSettings,
    enabled: mayUse && shouldRender,
    retry: false,
  });

  const history = useQuery({
    queryKey: ["ai", "conversations"],
    queryFn: shellAiApi.listConversations,
    enabled: mayUse && historyOpen,
    retry: false,
  });

  /*
   * Optional all the way down. A reply that does not carry the settings is a
   * reply this panel cannot act on, and reading through it would take the whole
   * shell out with a type error rather than showing the unavailable state that
   * exists precisely for not knowing.
   */
  const ready = settings.data?.aiSettings?.ready ?? false;

  const ask = useMutation({
    mutationFn: (message: string) =>
      shellAiApi.chat({
        ...(conversationId ? { conversationId } : {}),
        message,
        ...(projectId && useCurrentPageContext ? { projectId } : {}),
      }),
    onSuccess: (result) => {
      setConversationId(result.conversationId);
      setMessages((current) => [
        ...current,
        {
          id: `answer-${result.conversationId}-${current.length}`,
          role: "assistant",
          content: result.answer,
          usedTools: result.usedTools,
        },
      ]);
      setProposal(result.proposal ?? null);
      // The thread has moved to the top of the list and may have just been
      // created, so a list fetched earlier is now wrong.
      void queryClient.invalidateQueries({ queryKey: ["ai", "conversations"] });
    },
  });

  const confirm = useMutation({
    mutationFn: (actionId: string) => shellAiApi.confirm(actionId),
    onSuccess: (result) => {
      setProposal(null);
      setMessages((current) => [
        ...current,
        {
          id: `done-${result.tool}-${current.length}`,
          role: "assistant",
          content: t("shell.ai.actionDone", { tool: t(`shell.ai.tool.${result.tool}`) }),
          usedTools: [],
        },
      ]);
    },
  });

  const openConversation = useMutation({
    mutationFn: (id: string) => shellAiApi.readConversation(id),
    onSuccess: (result) => {
      setConversationId(result.conversation.id);
      setMessages(result.messages.map(fromStored));
      // A proposal belongs to the turn that produced it, not to the thread.
      setProposal(null);
      setHistoryOpen(false);
    },
  });

  const removeConversation = useMutation({
    mutationFn: (id: string) => shellAiApi.deleteConversation(id),
    onSuccess: async (_result, id) => {
      await queryClient.invalidateQueries({ queryKey: ["ai", "conversations"] });
      // Deleting the thread on screen leaves nothing to continue, so the panel
      // returns to a new conversation rather than showing messages that no
      // longer exist anywhere.
      if (id === conversationId) startNewConversation();
    },
  });

  function startNewConversation() {
    setConversationId(undefined);
    setMessages([]);
    setProposal(null);
    setDraft("");
    ask.reset();
    confirm.reset();
  }

  // Follows the conversation as it grows, so the newest turn is the one in view.
  useEffect(() => {
    const element = transcriptRef.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [messages, ask.isPending]);

  /*
   * Why the assistant cannot be used, in the order the reasons need fixing.
   * Null means it can. Each carries whether the reader is somebody who could
   * do something about it, because pointing a site engineer at a settings page
   * they cannot open would be worse than saying nothing.
   */
  const blocker = useMemo((): { title: string; message: string; fixable: boolean } | null => {
    if (!mayUse) return null;
    if (settings.isPending) return null;
    if (settings.isError)
      return {
        title: t("shell.ai.blockedUnknownTitle"),
        message: t("shell.ai.blockedUnknownText"),
        fixable: false,
      };

    const state = settings.data?.aiSettings;
    const mayConfigure = hasPermission(auth.user, "settings.manage");

    if (!state?.configured)
      return {
        title: t("shell.ai.blockedNotConfiguredTitle"),
        message: mayConfigure
          ? t("shell.ai.blockedNotConfiguredOwner")
          : t("shell.ai.blockedNotConfiguredMember"),
        fixable: mayConfigure,
      };

    if (!state.enabled)
      return {
        title: t("shell.ai.blockedOffTitle"),
        message: mayConfigure ? t("shell.ai.blockedOffOwner") : t("shell.ai.blockedOffMember"),
        fixable: mayConfigure,
      };

    if (!state.hasCompanyKey && !state.hasPersonalKey)
      return {
        title: t("shell.ai.blockedNoKeyTitle"),
        // Anybody may save a key of their own, so this one is always fixable
        // by whoever is reading it.
        message: t("shell.ai.blockedNoKeyText"),
        fixable: true,
      };

    return null;
  }, [auth.user, mayUse, settings.data, settings.isError, settings.isPending, t]);

  const currentPageLabel = useCurrentPageContext
    ? t("shell.ai.currentPageOn")
    : t("shell.ai.currentPageOff");

  const failureMessage = (error: unknown): string | null => {
    if (!error) return null;
    return error instanceof ApiClientError ? error.message : t("shell.ai.askFailed");
  };

  if (!shouldRender) return null;

  /*
   * Nothing at all for somebody without the permission — no panel, no header,
   * no explanation. The rest of the product hides what a person may not open
   * rather than greying it out, and this is shell chrome exactly like the
   * navigation rail is.
   */
  if (!mayUse) return null;

  const submit = () => {
    const message = draft.trim();
    if (!message || ask.isPending) return;
    setMessages((current) => [
      ...current,
      { id: `asked-${current.length}`, role: "user", content: message, usedTools: [] },
    ]);
    setDraft("");
    ask.mutate(message);
  };

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
            <p className="rect-ai-panel__status">
              {ready ? t("shell.ai.statusReady") : t("shell.ai.statusUnavailable")}
            </p>
          </div>
        </div>
        <div className="rect-ai-panel__controls">
          <button
            type="button"
            className="rect-ai-toggle"
            onClick={() => setHistoryOpen(true)}
            aria-label={t("shell.ai.history")}
            title={t("shell.ai.history")}
          >
            <History strokeWidth={2.1} aria-hidden />
          </button>
          <button
            type="button"
            className="rect-ai-toggle"
            onClick={startNewConversation}
            aria-label={t("shell.ai.newConversation")}
            title={t("shell.ai.newConversation")}
          >
            <Plus strokeWidth={2.1} aria-hidden />
          </button>
          {hideOwnToggle ? null : <AiPanelToggle collapsed={false} onToggle={onToggle} />}
        </div>
      </header>

      <div className="rect-ai-panel__body" id="rectangle-ai-panel-body" ref={transcriptRef}>
        {blocker ? (
          /*
           * The honest unavailable state. It names the cause and, when the
           * reader can act, gives them the way to — rather than a disabled box
           * that leaves them guessing which of four things is wrong.
           */
          <div className="rect-ai-panel__blocked" role="status">
            <AlertTriangle size={26} strokeWidth={1.9} aria-hidden />
            <p className="rect-ai-panel__empty-title">{blocker.title}</p>
            <p className="rect-ai-panel__empty-text">{blocker.message}</p>
            {blocker.fixable ? (
              <Link className="rect-ai-panel__blocked-link" to="/settings">
                {t("shell.ai.openSettings")}
              </Link>
            ) : null}
          </div>
        ) : messages.length === 0 ? (
          <div className="rect-ai-panel__empty" role="status">
            <Sparkles size={28} strokeWidth={1.8} aria-hidden />
            <p className="rect-ai-panel__empty-title">{t("shell.ai.readyTitle")}</p>
            <p className="rect-ai-panel__empty-text">{t("shell.ai.readyText")}</p>
          </div>
        ) : (
          <ol className="rect-ai-thread" aria-label={t("shell.ai.transcript")} aria-live="polite">
            {messages.map((message) => (
              <li
                key={message.id}
                className={cn(
                  "rect-ai-turn",
                  message.role === "user" ? "rect-ai-turn--asked" : "rect-ai-turn--answered",
                )}
              >
                <p className="rect-ai-turn__text">{message.content}</p>
                {message.usedTools.length > 0 ? (
                  <p className="rect-ai-turn__tools">
                    {t("shell.ai.usedTools", {
                      tools: message.usedTools
                        .map((tool) => t(`shell.ai.tool.${tool}`))
                        .join(t("common.listSeparator")),
                    })}
                  </p>
                ) : null}
              </li>
            ))}

            {ask.isPending ? (
              <li className="rect-ai-turn rect-ai-turn--answered rect-ai-turn--thinking">
                <Loader2 size={15} strokeWidth={2.2} aria-hidden className="rect-ai-turn__spin" />
                <span>{t("shell.ai.thinking")}</span>
              </li>
            ) : null}
          </ol>
        )}

        {proposal ? (
          <section className="rect-ai-proposal" aria-label={t("shell.ai.proposalLabel")}>
            <h3 className="rect-ai-proposal__title">
              {t("shell.ai.proposalTitle", { tool: t(`shell.ai.tool.${proposal.tool}`) })}
            </h3>
            <p className="rect-ai-proposal__help">{t("shell.ai.proposalHelp")}</p>

            {/*
              * The arguments as the server validated them. Rendered from the
              * data rather than described in prose, because this is the thing
              * that will run and a person is being asked to approve exactly it.
              */}
            <dl className="rect-ai-proposal__fields">
              {Object.entries(proposal.summary).map(([field, value]) => (
                <div key={field} className="rect-ai-proposal__row">
                  <dt>{t(`shell.ai.field.${field}`, { defaultValue: field })}</dt>
                  <dd>{typeof value === "string" ? value : JSON.stringify(value)}</dd>
                </div>
              ))}
            </dl>

            {confirm.error ? (
              <p className="rect-ai-panel__error" role="alert">
                {failureMessage(confirm.error)}
              </p>
            ) : null}

            <div className="rect-ai-proposal__actions">
              <Button
                variant="primary"
                onClick={() => confirm.mutate(proposal.id)}
                disabled={confirm.isPending}
              >
                <Check size={16} strokeWidth={2} aria-hidden />
                {confirm.isPending ? t("shell.ai.confirming") : t("shell.ai.confirm")}
              </Button>
              <Button variant="ghost" onClick={() => setProposal(null)}>
                {t("shell.ai.discard")}
              </Button>
            </div>
          </section>
        ) : null}

        {ask.error ? (
          <p className="rect-ai-panel__error" role="alert">
            {failureMessage(ask.error)}
          </p>
        ) : null}
      </div>

      {/*
        * The composer exists only when a question could actually be answered.
        * A live-looking box that refuses on submit is the thing this rebuild
        * removed; when the assistant is unavailable the panel explains itself
        * above and offers nothing to type into.
        */}
      {blocker ? null : (
        <form
          className="rect-ai-composer"
          aria-label={t("shell.ai.composer")}
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <label className="rect-ai-composer__label" htmlFor="rect-ai-message">
            {t("shell.ai.composerLabel")}
          </label>

          {/*
            * Named only where there is something to name. The control appears
            * on a project page and nowhere else, so it is never a dead button,
            * and the project it will attach is stated rather than implied.
            */}
          {projectId ? (
            <p className="rect-ai-composer__context">
              {useCurrentPageContext
                ? t("shell.ai.contextAttached")
                : t("shell.ai.contextDetached")}
            </p>
          ) : null}

          <textarea
            id="rect-ai-message"
            className="rect-ai-composer__input"
            placeholder={t("shell.ai.placeholder")}
            rows={3}
            value={draft}
            onChange={(event) => setDraft(event.currentTarget.value)}
            onKeyDown={(event) => {
              // Enter sends; Shift+Enter is a new line. A question is usually
              // one line, and reaching for a button each time is friction.
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                submit();
              }
            }}
          />
          <div className="rect-ai-composer__footer">
            <div className="rect-ai-composer__tools">
              {projectId ? (
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
                  <Sparkles size={15} strokeWidth={2} aria-hidden />
                  <span className="sr-only">{t("shell.ai.currentPage")}</span>
                </button>
              ) : null}
            </div>
            <button
              type="submit"
              className="rect-ai-composer__send"
              disabled={ask.isPending || draft.trim().length === 0}
            >
              <SendHorizontal size={15} strokeWidth={2.1} aria-hidden />
              {t("shell.ai.send")}
            </button>
          </div>
        </form>
      )}

      {/*
        * The history is a window over the panel rather than a column inside it.
        * The panel is narrow and the messages are what somebody is there to
        * read, so a permanent list would take width from the thing it indexes.
        */}
      <Overlay
        open={historyOpen}
        title={t("shell.ai.history")}
        description={t("shell.ai.historyHelp")}
        size="sm"
        onClose={() => setHistoryOpen(false)}
      >
        {history.isPending ? (
          <p className="rect-ai-history__note">{t("common.loading")}</p>
        ) : history.isError ? (
          <p className="rect-ai-history__note" role="alert">
            {t("shell.ai.historyFailed")}
          </p>
        ) : (history.data?.conversations.length ?? 0) === 0 ? (
          <EmptyState title={t("shell.ai.historyEmptyTitle")} message={t("shell.ai.historyEmptyText")} />
        ) : (
          <ul className="rect-ai-history">
            {history.data?.conversations.map((conversation) => (
              <li key={conversation.id} className="rect-ai-history__item">
                <button
                  type="button"
                  className="rect-ai-history__open"
                  onClick={() => openConversation.mutate(conversation.id)}
                >
                  <span className="rect-ai-history__title">{conversation.title}</span>
                  <span className="rect-ai-history__meta">
                    {new Date(conversation.updatedAt).toLocaleDateString()}
                  </span>
                </button>
                <button
                  type="button"
                  className="rect-ai-history__delete"
                  onClick={() => removeConversation.mutate(conversation.id)}
                  disabled={removeConversation.isPending}
                  aria-label={t("shell.ai.deleteConversation", { title: conversation.title })}
                  title={t("shell.ai.deleteConversation", { title: conversation.title })}
                >
                  <Trash2 size={15} strokeWidth={2} aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Overlay>
    </aside>
  );
}
