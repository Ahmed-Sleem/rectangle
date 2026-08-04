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
import { Link } from "react-router";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiClientError } from "@/shared/api/client";
import { useAuth } from "@/shared/auth";
import { hasPermission } from "@/shared/auth/authority";
import { Button, Checkbox, EmptyState, Overlay, SearchInput } from "@/shared/ui";
import { cn } from "@/shared/lib/cn";
import { AiPanelToggle } from "./AiPanelToggle";
import {
  shellAiApi,
  streamChat,
  type AiProgressEvent,
  type AiProposal,
  type AiStoredMessage,
} from "./ai-api";
import type { AiAssistantPanelProps } from "./ai-types";
import { useIsHandset } from "@/shared/lib/useIsHandset";
import { useScreenContext } from "./useScreenContext";
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

/**
 * One line of the running commentary.
 *
 * Every field is a fact the harness reported — which step, which tool, what
 * came back — so nothing shown here can be something the model asserted. That
 * matters: a progress feed the model could write into would be a second place
 * for it to make things up, and one that nobody would think to check.
 */
interface ProgressLine {
  id: string;
  cycle: number;
  total: number;
  tool?: string;
  outcome?: string;
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
  const screen = useScreenContext();

  const mayUse = hasPermission(auth.user, "ai.use");

  const [shouldRender, setShouldRender] = useState(!collapsed);
  const [isClosing, setIsClosing] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const isHandset = useIsHandset();
  const [conversationId, setConversationId] = useState<string | undefined>(undefined);
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [proposals, setProposals] = useState<AiProposal[]>([]);
  /** Ticked on a card to stop being asked about that kind of change again. */
  const [silenced, setSilenced] = useState<Set<string>>(new Set());
  const [draft, setDraft] = useState("");
  const [progress, setProgress] = useState<ProgressLine[]>([]);
  const [cycle, setCycle] = useState<{ current: number; total: number } | null>(null);
  const [exhausted, setExhausted] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  /*
   * What is typed, and what has been asked for. Two pieces of state rather than
   * one because a request per keystroke would put a query on the database for
   * every letter of a word nobody has finished typing. The field stays instant;
   * the search follows a beat later.
   */
  const [searchTerm, setSearchTerm] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  /** True while the field has focus, so the bar can take the whole row. */
  const [searchOpen, setSearchOpen] = useState(false);
  const [deleteAllPending, setDeleteAllPending] = useState(false);

  /*
   * The field takes the row while it is being used, and keeps it while it still
   * holds a term. Yielding the space back the instant focus left would snatch
   * the field narrower under somebody who had just typed and looked away, so
   * "in use" means focused OR non-empty.
   */
  const searchExpanded = searchOpen || searchTerm.length > 0;
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

  /*
   * Fetched afresh every time the window opens, and a page at a time.
   *
   * The list is invalidated when a turn completes, but the workspace sets a
   * thirty-second `staleTime` for every query, and an invalidated query that is
   * disabled does not refetch until something re-enables it. So opening the
   * history, asking a question, closing it and opening it again inside that
   * window showed the list as it was before the thread existed — the new
   * conversation simply missing, which is the staleness that was reported.
   *
   * `staleTime: 0` is right for this one rather than a change to the default:
   * the list is small, it is read only when somebody deliberately opens a
   * window to look at it, and it is the index of a thing they are actively
   * changing. Everything else in the product is served from a cache on purpose.
   *
   * The search term is part of the key, so changing it starts a new list rather
   * than appending results to the previous one.
   */
  /*
   * 250ms: long enough that an ordinary typing rhythm produces one request
   * rather than eight, short enough that it still feels like the list is
   * answering as you type rather than after you stop.
   */
  useEffect(() => {
    const timer = window.setTimeout(() => setAppliedSearch(searchTerm.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [searchTerm]);

  const history = useInfiniteQuery({
    queryKey: ["ai", "conversations", appliedSearch],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      shellAiApi.listConversations({
        ...(pageParam ? { cursor: pageParam } : {}),
        ...(appliedSearch ? { query: appliedSearch } : {}),
      }),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: mayUse && historyOpen,
    retry: false,
    staleTime: 0,
    refetchOnMount: "always",
  });

  const conversations = useMemo(
    () => (history.data?.pages ?? []).flatMap((page) => page.conversations),
    [history.data],
  );

  /*
   * Older pages arrive by scrolling rather than by pressing a button, which is
   * what the owner asked for. The sentinel sits after the last row inside the
   * window's own scrolling region; when it comes into view there is more list
   * below the fold than above it, which is the moment to fetch.
   *
   * `rootMargin` starts the fetch a little before the sentinel is actually
   * visible, so on a normal scroll the next page is already there and the list
   * does not stutter at the boundary.
   */
  const sentinelRef = useRef<HTMLLIElement | null>(null);

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !historyOpen || !history.hasNextPage) return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        // Guarded rather than trusted: the observer can fire again while the
        // previous page is still in flight, which would ask for it twice.
        if (entries.some((entry) => entry.isIntersecting) && !history.isFetchingNextPage) {
          void history.fetchNextPage();
        }
      },
      { rootMargin: "120px" },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [historyOpen, history.hasNextPage, history.isFetchingNextPage, history.fetchNextPage]);

  /*
   * Optional all the way down. A reply that does not carry the settings is a
   * reply this panel cannot act on, and reading through it would take the whole
   * shell out with a type error rather than showing the unavailable state that
   * exists precisely for not knowing.
   */
  const ready = settings.data?.aiSettings?.ready ?? false;

  /**
   * Asks, and narrates.
   *
   * The progress events land in state as they arrive, so the panel shows what
   * the assistant is doing rather than a spinner. A spinner cannot distinguish
   * a model that is working from one that has hung, so people reload and lose
   * the answer; a line saying which search is running at step two of ten is
   * both honest and reassuring.
   */
  /*
   * Kept out of the mutation so it is a stable function rather than something
   * rebuilt on every keystroke, and so the shape of each line is described in
   * one place instead of inside three switch arms.
   */
  const handleProgress = (event: AiProgressEvent) => {
    if (event.type === "cycle") {
      setCycle({ current: event.cycle, total: event.total });
      return;
    }
    if (event.type === "tool") {
      setProgress((current) => [
        ...current,
        {
          id: `${event.cycle}-${event.tool}-${current.length}`,
          cycle: event.cycle,
          total: cycle?.total ?? 0,
          tool: event.tool,
        },
      ]);
      return;
    }
    if (event.type === "observation") {
      // Completes the line it belongs to rather than adding another, so the
      // feed reads as a list of steps and not a list of half-steps.
      setProgress((current) => {
        // The most recent unfinished line for this tool. Searched backwards
        // because the same tool may legitimately run more than once, and the
        // observation belongs to the latest call rather than the first.
        let target = -1;
        for (let index = current.length - 1; index >= 0; index -= 1) {
          const line = current[index];
          if (line && line.tool === event.tool && !line.outcome) {
            target = index;
            break;
          }
        }
        if (target === -1) return current;
        return current.map((line, index) =>
          index === target ? { ...line, outcome: event.summary } : line,
        );
      });
    }
  };

  const ask = useMutation({
    mutationFn: (input: { message: string; continuing?: boolean }) =>
      streamChat(
        {
          ...(conversationId ? { conversationId } : {}),
          message: input.message,
          ...(Object.keys(screen).length > 0 ? { screen } : {}),
          ...(input.continuing ? { continue: true } : {}),
        },
        handleProgress,
      ),
    onMutate: () => {
      setProgress([]);
      setCycle(null);
      setExhausted(false);
    },
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
      setProposals(result.proposals ?? []);
      setExhausted(Boolean(result.exhausted));
      setCycle(null);
      // The thread has moved to the top of the list and may have just been
      // created, so a list fetched earlier is now wrong.
      void queryClient.invalidateQueries({ queryKey: ["ai", "conversations"] });
    },
  });

  const confirm = useMutation({
    mutationFn: async (actionIds: string[]) => {
      const outcome = await shellAiApi.confirm(actionIds);

      /*
       * The standing preferences are saved after the approval, not before.
       * If the change itself is refused, the person has not agreed to anything
       * and should not silently acquire a preference from an act that failed.
       * Each is sent on its own so one refusal — a tool the server will not
       * silence — cannot discard the others.
       */
      for (const tool of silenced) {
        await shellAiApi.grantAutoApproval(tool).catch(() => undefined);
      }
      return outcome;
    },
    onSuccess: (result) => {
      setProposals([]);
      setSilenced(new Set());
      const done = result.results.filter((entry) => entry.ok).length;
      setMessages((current) => [
        ...current,
        {
          id: `done-${result.tool}-${current.length}`,
          role: "assistant",
          content:
            done > 1
              ? t("shell.ai.actionsDone", { count: done })
              : t("shell.ai.actionDone", {
                  tool: t(`shell.ai.tool.${result.tool}`, { defaultValue: result.tool }),
                }),
          usedTools: [],
        },
      ]);
    },
  });

  /*
   * The way out of a conversation that has outgrown the model.
   *
   * The old thread is left alone and the new one opens in the panel already
   * carrying the last ten turns, so the person carries on from where they were
   * rather than retyping the context. Only offered when the server says that is
   * what went wrong — proposing it after an unrelated failure would send
   * somebody to a fresh thread that fails in exactly the same way.
   */
  const continueInNewConversation = useMutation({
    mutationFn: (id: string) => shellAiApi.branchConversation(id),
    onSuccess: async (result) => {
      setConversationId(result.conversation.id);
      setMessages(result.messages.map(fromStored));
      setProposals([]);
      ask.reset();
      await queryClient.invalidateQueries({ queryKey: ["ai", "conversations"] });
    },
  });

  const openConversation = useMutation({
    mutationFn: (id: string) => shellAiApi.readConversation(id),
    onSuccess: (result) => {
      setConversationId(result.conversation.id);
      setMessages(result.messages.map(fromStored));
      // Proposals belong to the turn that produced them, not to the thread.
      setProposals([]);
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

  const removeAllConversations = useMutation({
    mutationFn: () => shellAiApi.deleteAllConversations(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["ai", "conversations"] });
      /*
       * The thread on screen was one of them, so the panel returns to a new
       * conversation rather than showing messages that no longer exist
       * anywhere — the same reasoning as deleting the open thread singly.
       */
      startNewConversation();
      setSearchTerm("");
    },
  });

  function startNewConversation() {
    setConversationId(undefined);
    setMessages([]);
    setProposals([]);
    setDraft("");
    setProgress([]);
    setCycle(null);
    setExhausted(false);
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

    /*
     * `ready` is the server's own answer to "could this person ask a question
     * right now", and it already accounts for both configurations. Anything
     * below only explains WHY not, so it must never contradict it.
     */
    if (state?.ready) return null;

    // Their own provider is complete: nothing here is standing in their way.
    if (state?.personal.configured) return null;

    if (!state?.company.configured)
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

    if (!state.company.hasKey)
      return {
        title: t("shell.ai.blockedNoKeyTitle"),
        // Anybody may set up a model of their own, so this one is always
        // fixable by whoever is reading it.
        message: t("shell.ai.blockedNoKeyText"),
        fixable: true,
      };

    return null;
  }, [auth.user, mayUse, settings.data, settings.isError, settings.isPending, t]);

  /*
   * Told apart by the server's code, never by matching on the message. The text
   * is written for a person and is translated; a client that recognised a
   * failure by its wording would stop recognising it the moment somebody
   * improved the sentence, and would never recognise it in Arabic at all.
   */
  const isTooLong = (error: unknown): boolean =>
    error instanceof ApiClientError && error.code === "CONTEXT_TOO_LONG";

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
    ask.mutate({ message });
  };

  /*
   * The list itself, defined once and placed twice.
   *
   * On a desktop it belongs in a window over the panel: the panel is narrow,
   * the messages are what somebody is there to read, and a permanent index
   * would take width from the thing it indexes.
   *
   * On a phone the assistant is already occupying the canvas, so a window over
   * it is a sheet on top of a sheet — two dialogs deep, the second floating
   * outside the frame every other surface respects, with the first dimmed
   * behind it. Measured at 390px: the history sat at x=12 and 366 wide while
   * the canvas was at x=27 and 336 wide. There the list replaces the panel's
   * contents instead, which is what the menu and the assistant already do.
   *
   * One definition either way. Rendering the rows twice would be the copy that
   * stops receiving fixes.
   */
  const historyBody = (
    <>
        {history.isPending ? (
          <p className="rect-ai-history__note">{t("common.loading")}</p>
        ) : history.isError ? (
          <p className="rect-ai-history__note" role="alert">
            {t("shell.ai.historyFailed")}
          </p>
        ) : conversations.length === 0 ? (
          /*
            * Two different facts, two different sentences. "You have none yet"
            * invites a first question; "nothing matched" tells somebody who
            * plainly does have conversations to try another word. Showing the
            * first to a person whose search missed would be telling them their
            * history had been lost.
            */
          appliedSearch ? (
            <EmptyState
              title={t("shell.ai.historyNoMatchTitle")}
              message={t("shell.ai.historyNoMatchText")}
            />
          ) : (
            <EmptyState title={t("shell.ai.historyEmptyTitle")} message={t("shell.ai.historyEmptyText")} />
          )
        ) : (
          <ul className="rect-ai-history">
            {conversations.map((conversation) => (
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
                {/*
                  * Confirmed in place rather than in a window over the window.
                  * A conversation cannot be recovered, so it must be asked; but
                  * stacking a dialog on top of the history list to ask a
                  * one-word question moves the person away from the thing they
                  * are deciding about.
                  */}
                {pendingDelete === conversation.id ? (
                  <span className="rect-ai-history__confirm">
                    <button
                      type="button"
                      className="rect-ai-history__confirm-yes"
                      onClick={() => {
                        removeConversation.mutate(conversation.id);
                        setPendingDelete(null);
                      }}
                      disabled={removeConversation.isPending}
                    >
                      {t("shell.ai.deleteConfirm")}
                    </button>
                    <button
                      type="button"
                      className="rect-ai-history__confirm-no"
                      onClick={() => setPendingDelete(null)}
                    >
                      {t("common.cancel")}
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    className="rect-ai-history__delete"
                    onClick={() => setPendingDelete(conversation.id)}
                    aria-label={t("shell.ai.deleteConversation", { title: conversation.title })}
                    title={t("shell.ai.deleteConversation", { title: conversation.title })}
                  >
                    <Trash2 size={15} strokeWidth={2} aria-hidden />
                  </button>
                )}
              </li>
            ))}

            {/*
              * Watched rather than pressed. It sits after the last row inside
              * the window's own scroll region, so reaching it means there is
              * more list below than above and the next page is worth fetching.
              */}
            {history.hasNextPage ? (
              <li ref={sentinelRef} className="rect-ai-history__more" aria-hidden={!history.isFetchingNextPage}>
                {history.isFetchingNextPage ? t("shell.ai.historyLoadingMore") : null}
              </li>
            ) : (
              <li className="rect-ai-history__end">{t("shell.ai.historyEnd")}</li>
            )}
          </ul>
        )}

        {/*
          * The bar sits at the foot and the list scrolls under it, ending at
          * the container's end.
          *
          * It was pinned at the top, which put a floating strip over the rows —
          * reported as the search bar "hovering over" the conversations. At the
          * foot it is the one fixed thing on the surface and the list runs
          * behind it, which is the composer pattern this panel already uses
          * directly below: a bar anchored at the bottom of a scrolling column.
          * Two surfaces in the same panel that behave the same way.
          */}
        <div className="rect-ai-history__foot">
          <SearchInput
            className="rect-ai-history__search"
            label={t("shell.ai.historySearch")}
            placeholder={t("shell.ai.historySearchPlaceholder")}
            value={searchTerm}
            onChange={setSearchTerm}
            onFocus={() => setSearchOpen(true)}
            onBlur={() => setSearchOpen(false)}
          />

          {/*
            * The button yields the width to the field.
            *
            * Hidden rather than shrunk while the field is in use, because a
            * cramped field is the thing being fixed and a button nobody is
            * reaching for at that moment costs nothing to remove. It comes back
            * the moment the field is left empty and unfocused.
            *
            * Absent entirely when there is nothing to delete: a control whose
            * only outcome is "deleted 0" is a control that should not be there.
            */}
          {searchExpanded || conversations.length === 0 ? null : deleteAllPending ? (
            /*
              * Confirmed in place, never in a window over the window. This
              * cannot be undone, so it must be asked; but a dialog stacked on
              * the history to ask one question moves somebody away from the
              * thing they are deciding about. Same rule as deleting one.
              */
            <span className="rect-ai-history__confirm">
              <button
                type="button"
                className="rect-ai-history__confirm-yes"
                onClick={() => {
                  removeAllConversations.mutate();
                  setDeleteAllPending(false);
                }}
                disabled={removeAllConversations.isPending}
              >
                {t("shell.ai.historyDeleteAllConfirm", { count: conversations.length })}
              </button>
              <button
                type="button"
                className="rect-ai-history__confirm-no"
                onClick={() => setDeleteAllPending(false)}
              >
                {t("common.cancel")}
              </button>
            </span>
          ) : (
            <button
              type="button"
              className="rect-ai-history__delete-all"
              onClick={() => setDeleteAllPending(true)}
            >
              <Trash2 size={15} strokeWidth={2} aria-hidden />
              {t("shell.ai.historyDeleteAll")}
            </button>
          )}
        </div>

        {removeAllConversations.error ? (
          <p className="rect-ai-panel__error" role="alert">
            {t("shell.ai.historyDeleteAllFailed")}
          </p>
        ) : null}
    </>
  );

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
            /*
             * The same control opens and closes it. On a phone the list takes
             * the panel, so this is the way back to the conversation — and a
             * button that only opens would strand somebody on a screen with no
             * exit but the one that shuts the whole assistant.
             */
            onClick={() => {
              setHistoryOpen((wasOpen) => !wasOpen);
              setPendingDelete(null);
            }}
            aria-expanded={historyOpen}
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
        {historyOpen && isHandset ? (
          /*
           * On a phone the list takes the panel rather than floating over it.
           * The assistant is already the canvas here, so a window on top would
           * be the second dialog deep — which is the fault that was reported,
           * and which the menu and the assistant were both fixed for earlier.
           * The header's own control closes it, exactly as it opened it.
           */
          <section className="rect-ai-history-pane" aria-label={t("shell.ai.history")}>
            <p className="rect-ai-history-pane__help">{t("shell.ai.historyHelp")}</p>
            {historyBody}
          </section>
        ) : blocker ? (
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
              /*
               * What it is doing, not merely that it is doing something. Each
               * completed step stays on screen so the person can see the route
               * the answer took, and the cycle counter says how much budget is
               * left — which turns "it is taking a while" into a fact rather
               * than a worry.
               */
              <li className="rect-ai-turn rect-ai-turn--answered rect-ai-thinking">
                <p className="rect-ai-thinking__head">
                  <Loader2 size={15} strokeWidth={2.2} aria-hidden className="rect-ai-turn__spin" />
                  <span>
                    {cycle
                      ? t("shell.ai.thinkingStep", { current: cycle.current, total: cycle.total })
                      : t("shell.ai.thinking")}
                  </span>
                </p>

                {progress.length > 0 ? (
                  <ol className="rect-ai-steps">
                    {progress.map((line) => (
                      <li key={line.id} className="rect-ai-steps__item" data-done={line.outcome ? "true" : "false"}>
                        <span className="rect-ai-steps__what">
                          {t("shell.ai.stepUsing", {
                            tool: t(`shell.ai.tool.${line.tool}`, { defaultValue: line.tool ?? "" }),
                          })}
                        </span>
                        {line.outcome ? (
                          <span className="rect-ai-steps__outcome">{line.outcome}</span>
                        ) : null}
                      </li>
                    ))}
                  </ol>
                ) : null}
              </li>
            ) : null}
          </ol>
        )}

        {exhausted && !ask.isPending ? (
          /*
           * It ran out of steps rather than finishing. Continuing is offered,
           * never automatic: another run is more of somebody's money, and
           * spending it without being asked is the same fault as writing data
           * without approval.
           */
          <div className="rect-ai-continue" role="status">
            <p className="rect-ai-continue__text">{t("shell.ai.continueHelp")}</p>
            <Button
              variant="secondary"
              onClick={() => {
                setExhausted(false);
                ask.mutate({ message: t("shell.ai.continueMessage"), continuing: true });
              }}
            >
              {t("shell.ai.continueAction")}
            </Button>
          </div>
        ) : null}

        {proposals.length > 0 ? (
          /*
           * One card for the whole batch. An instruction like "close these
           * three" is one decision, and asking three times in a row is how an
           * approval becomes a reflex — but each change still shows its own
           * arguments, because approving a summary of four things is not
           * approving any of them.
           */
          <section className="rect-ai-proposal" aria-label={t("shell.ai.proposalLabel")}>
            <h3 className="rect-ai-proposal__title">
              {proposals.length === 1
                ? t("shell.ai.proposalTitle", {
                    tool: t(`shell.ai.tool.${proposals[0]?.tool}`, {
                      defaultValue: proposals[0]?.tool ?? "",
                    }),
                  })
                : t("shell.ai.proposalTitleMany", { count: proposals.length })}
            </h3>
            <p className="rect-ai-proposal__help">{t("shell.ai.proposalHelp")}</p>

            <ol className="rect-ai-proposal__list">
              {proposals.map((entry) => (
                <li key={entry.id} className="rect-ai-proposal__item">
                  {proposals.length > 1 ? (
                    <p className="rect-ai-proposal__what">
                      {t(`shell.ai.tool.${entry.tool}`, { defaultValue: entry.tool })}
                    </p>
                  ) : null}

                  {/*
                    * The arguments as the server validated them. Rendered from
                    * the data rather than described in prose, because this is
                    * the thing that will run and a person is being asked to
                    * approve exactly it.
                    */}
                  <dl className="rect-ai-proposal__fields">
                    {Object.entries(entry.summary).map(([field, value]) => (
                      <div key={field} className="rect-ai-proposal__row">
                        <dt>{t(`shell.ai.field.${field}`, { defaultValue: field })}</dt>
                        <dd>{typeof value === "string" ? value : JSON.stringify(value)}</dd>
                      </div>
                    ))}
                  </dl>

                  {/*
                    * Offered only where it is safe to offer. Anything that
                    * cannot be undone always asks, and the server refuses to
                    * record a preference for it — so showing the option here
                    * would be promising something that will not happen.
                    */}
                  {entry.destructive ? (
                    <p className="rect-ai-proposal__always">{t("shell.ai.alwaysAsks")}</p>
                  ) : (
                    <Checkbox
                      label={t("shell.ai.dontAskAgain", {
                        tool: t(`shell.ai.tool.${entry.tool}`, { defaultValue: entry.tool }),
                      })}
                      checked={silenced.has(entry.tool)}
                      onChange={(event) => {
                        const next = new Set(silenced);
                        if (event.currentTarget.checked) next.add(entry.tool);
                        else next.delete(entry.tool);
                        setSilenced(next);
                      }}
                    />
                  )}
                </li>
              ))}
            </ol>

            {confirm.error ? (
              <p className="rect-ai-panel__error" role="alert">
                {failureMessage(confirm.error)}
              </p>
            ) : null}

            <div className="rect-ai-proposal__actions">
              <Button
                variant="primary"
                onClick={() => confirm.mutate(proposals.map((entry) => entry.id))}
                disabled={confirm.isPending}
              >
                <Check size={16} strokeWidth={2} aria-hidden />
                {confirm.isPending
                  ? t("shell.ai.confirming")
                  : proposals.length === 1
                    ? t("shell.ai.confirm")
                    : t("shell.ai.confirmAll", { count: proposals.length })}
              </Button>
              <Button variant="ghost" onClick={() => setProposals([])}>
                {t("shell.ai.discard")}
              </Button>
            </div>
          </section>
        ) : null}

        {isTooLong(ask.error) && conversationId ? (
          /*
            * A dead end with a way out of it. The transcript is intact above
            * this and stays saved; what is offered is a fresh thread carrying
            * the tail, because the provider's API is stateless and a
            * conversation that no longer fits will never fit again.
            */
          <div className="rect-ai-toolong" role="alert">
            <p className="rect-ai-toolong__title">{t("shell.ai.tooLongTitle")}</p>
            <p className="rect-ai-toolong__text">{t("shell.ai.tooLongText")}</p>
            {/*
              * Not disabled when there is nothing to carry: the whole block is
              * absent instead, and the ordinary error is shown. A dead button
              * offering a way out that cannot be taken is worse than not
              * offering one, and there is genuinely nothing to branch from
              * until a thread exists.
              */}
            <Button
              variant="primary"
              disabled={continueInNewConversation.isPending}
              onClick={() => continueInNewConversation.mutate(conversationId)}
            >
              {t("shell.ai.tooLongAction")}
            </Button>
            {continueInNewConversation.error ? (
              <p className="rect-ai-panel__error">{t("shell.ai.tooLongFailed")}</p>
            ) : null}
          </div>
        ) : ask.error ? (
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
          {/*
            * No context toggle. The assistant asks what page somebody is on
            * when a question needs it, which covers every page rather than
            * only a project, and costs nothing on the questions that do not.
            */}
          <div className="rect-ai-composer__footer">
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
        open={historyOpen && !isHandset}
        title={t("shell.ai.history")}
        description={t("shell.ai.historyHelp")}
        size="sm"
        onClose={() => {
          setHistoryOpen(false);
          setPendingDelete(null);
        }}
      >
        {historyBody}
      </Overlay>
    </aside>
  );
}
