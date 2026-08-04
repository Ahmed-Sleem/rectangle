/**
 * The harness: the loop between a person's question and an answer.
 *
 * The model reasons; this decides. That sentence is the whole architecture. A
 * model returns a name and some JSON, and every step after that is ordinary
 * deterministic code — is this a real tool, do the arguments validate, may
 * *this* person run it, does it change anything, what actually happened. The
 * model's output is treated exactly as a browser's request body is: untrusted
 * input to be parsed and authorised, never an instruction to be obeyed.
 *
 * Four properties are enforced here and are the reason this file exists rather
 * than the loop living in a route handler:
 *
 *  1. **Every tool runs through the service the interface uses.** The
 *     assistant is a caller, not a privileged path. `search_tasks` goes
 *     through `SearchService` with the real principal, so a person cannot see
 *     one row more through the assistant than through the product. Authority
 *     is decided in one place, which is the rule the rest of the codebase
 *     already follows.
 *
 *  2. **A tool never throws.** A refusal, a timeout and a crash all become
 *     structured observations handed back to the model, so it can explain the
 *     problem or try something else instead of the whole message failing.
 *
 *  3. **Nothing that changes anything happens inside the loop.** A write tool
 *     halts it, stores what was proposed, and returns it for a person to
 *     approve. The stored arguments — not anything the browser sends back — are
 *     what eventually execute.
 *
 *  4. **The loop is bounded on every axis.** Iterations, one tool, one model
 *     call, and the whole message. Without all four, one bad day upstream
 *     occupies a worker until the process restarts.
 */
import { z } from "zod";
import {
  AI_CONTEXT_TURNS,
  AI_LIMITS,
  aiChatInputSchema,
  aiAutoApprovalInputSchema,
  aiConfirmInputSchema,
  aiConversationIdSchema,
  aiConversationListSchema,
  aiScreenContextSchema,
  aiRenameConversationSchema,
  deriveConversationTitle,
  findTool,
  sanitiseForModel,
  toolsFor,
  type AiToolDefinition,
} from "../domain/ai.js";
import {
  CONTINUATION_PROMPT,
  OUTCOME_MESSAGES,
  SYSTEM_PROMPT,
  TOOL_MESSAGES,
  cycleBudgetPrompt,
} from "../domain/ai-prompts.js";
import { hasPermission, requirePermission, type UserPrincipal } from "../domain/auth.js";
import { DomainError } from "../domain/errors.js";
import type {
  AiProviderClient,
  ProviderMessage,
  ProviderTool,
} from "../infrastructure/ai-provider.js";
import { runAsAssistant } from "./ai-attribution.js";
import { screenContextStore } from "./ai-tools.js";
import type { AiSettingsService } from "./ai-settings-service.js";
import type { AuditRepository } from "./project-service.js";

/** A change the assistant wants to make, waiting for a person to approve it. */
export interface PendingAction {
  id: string;
  tool: string;
  arguments: Record<string, unknown>;
}

export interface AiPendingActionRepository {
  create(input: {
    tenantId: string;
    userId: string;
    tool: string;
    arguments: Record<string, unknown>;
    expiresAt: string;
  }): Promise<{ id: string }>;
  /** Only ever returns a live, unconfirmed proposal belonging to this person. */
  findClaimable(tenantId: string, userId: string, id: string): Promise<PendingAction | null>;
  /** Marks it used. Returns false if somebody already did, so it runs once. */
  markConfirmed(tenantId: string, userId: string, id: string): Promise<boolean>;
}

/**
 * What a tool actually does, wired to the real services.
 *
 * A record rather than a switch inside the loop so that adding a tool is one
 * entry in the domain registry and one entry here — and so that this file can
 * be read as "the list of things the assistant can do" without following
 * control flow.
 */
export type AiToolExecutor = (
  actor: UserPrincipal,
  args: Record<string, unknown>,
) => Promise<unknown>;

/** One turn as it was said, for replaying a thread onto a screen. */
export interface StoredAiMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  usedTools: string[];
  createdAt: string;
}

/** A thread as it appears in the list, without its contents. */
export interface AiConversationSummary {
  id: string;
  title: string;
  projectId: string | null;
  updatedAt: string;
}

/**
 * Storage for conversations.
 *
 * Every method takes the tenant and the person, and every implementation is
 * required to put both into the query rather than filter afterwards. That is
 * not a style preference here: it is the entire isolation guarantee. A thread
 * belongs to one person, and the way it stays that way is that no method
 * exists which can find one without being told whose it is.
 */
export interface AiConversationRepository {
  create(input: {
    tenantId: string;
    userId: string;
    title: string;
    projectId: string | null;
  }): Promise<{ id: string }>;
  /** Null when it does not exist, or belongs to somebody else. Same answer. */
  find(
    tenantId: string,
    userId: string,
    id: string,
  ): Promise<{ id: string; title: string; projectId: string | null } | null>;
  list(
    tenantId: string,
    userId: string,
    options: {
      limit: number;
      /** The last row the caller already has. Keyed-set paging, never offset. */
      before?: { updatedAt: string; id: string };
      query?: string;
      mode?: "exact" | "fuzzy";
    },
  ): Promise<AiConversationSummary[]>;
  /** In the order they were said. `limit` keeps only the most recent turns. */
  messages(tenantId: string, conversationId: string, limit?: number): Promise<StoredAiMessage[]>;
  appendMessage(input: {
    tenantId: string;
    conversationId: string;
    role: "user" | "assistant";
    content: string;
    usedTools: string[];
  }): Promise<StoredAiMessage>;
  rename(tenantId: string, userId: string, id: string, title: string): Promise<boolean>;
  remove(tenantId: string, userId: string, id: string): Promise<boolean>;
  /** Every thread this person owns. Returns how many were removed. */
  removeAll(tenantId: string, userId: string): Promise<number>;
}

/**
 * Something the assistant just did, as it happens.
 *
 * The owner asked to see the model thinking rather than a spinner. A spinner
 * says "wait"; it does not say whether anything is happening, what is being
 * looked at, or how much longer it might take — so a slow model and a broken
 * one look identical, and people reload the page and lose the answer.
 *
 * These are emitted from inside the loop and streamed. They are deliberately
 * about what the assistant DID, not what it "is thinking": the step names are
 * facts the harness knows, so nothing here can be a claim the model made up.
 */
export type AiProgressEvent =
  | { type: "cycle"; cycle: number; total: number }
  | { type: "tool"; cycle: number; tool: string; arguments: Record<string, unknown> }
  | { type: "observation"; cycle: number; tool: string; summary: string }
  | { type: "answer"; result: AiChatResult }
  /*
   * Only the route emits this, after the loop has thrown. The code travels with
   * the message because a few failures have a remedy the client can offer —
   * a conversation too long to continue can be carried into a fresh thread —
   * and the panel cannot propose that unless it can tell which failure it is.
   */
  | { type: "failed"; message: string; code?: string };

export type AiProgressSink = (event: AiProgressEvent) => void;

/** A change the assistant wants to make, as the screen is shown it. */
export interface AiProposal {
  id: string;
  tool: string;
  /** The validated arguments, so the person approves exactly what will run. */
  summary: Record<string, unknown>;
  /**
   * Cannot be undone. The card never offers "do not ask again" for these, and
   * the service refuses to record such a preference even if one is sent.
   */
  destructive: boolean;
}

/**
 * Tools a person has chosen not to be asked about.
 *
 * Deliberately narrow: list, grant, revoke. There is no "grant for everyone"
 * and no "grant all tools", because neither is a thing anybody should be able
 * to do in one click.
 */
export interface AiAutoApprovalRepository {
  list(tenantId: string, userId: string): Promise<string[]>;
  grant(tenantId: string, userId: string, tool: string): Promise<void>;
  revoke(tenantId: string, userId: string, tool: string): Promise<boolean>;
}

export interface AiChatResult {
  /** Which thread this turn belongs to. New when the request carried no id. */
  conversationId: string;
  /** The model's prose answer. Empty only if it stopped to propose something. */
  answer: string;
  /** What it looked at, so the person can judge the answer. */
  usedTools: string[];
  /**
   * Changes it wants to make, waiting to be told to.
   *
   * A list, because one instruction often means several changes — "close these
   * three and reassign the fourth" — and asking four separate times in a row is
   * how an approval becomes a reflex. Each entry is still stored, re-read and
   * re-authorised individually; batching changes how often somebody is
   * interrupted, never how carefully each action is checked.
   */
  proposals?: AiProposal[];
  /**
   * Changes that ran without being asked about, because this person had already
   * said they did not want to be asked for that tool. Reported so the answer can
   * say what happened rather than leaving it silent — an auto-approval that is
   * invisible is indistinguishable from an agent acting on its own.
   */
  performed?: { tool: string; summary: Record<string, unknown> }[];
  /**
   * True when the loop stopped because it ran out of steps rather than because
   * it had finished. The screen offers to continue; nothing continues on its
   * own, because more steps means more of somebody's money.
   */
  exhausted?: boolean;
  /** How many steps were used, so the transcript can say so afterwards. */
  cyclesUsed?: number;
  cycleLimit?: number;
}

/**
 * How many threads the list returns.
 *
 * Not pagination: a person's own conversations with an assistant are not a
 * dataset, and somebody scrolling past fifty of them is looking for a search
 * box rather than a longer list. The cap exists so that a heavy user cannot
 * make the panel slow to open.
 */
const CONVERSATION_PAGE_SIZE = 30;

/**
 * The cursor is the last row seen, not a position in a list.
 *
 * Encoded as opaque text so that it is obvious to anybody reading a request
 * that this is a bookmark to hand back rather than a number to arithmetic on.
 * Anything unreadable is treated as no cursor at all: a corrupted bookmark
 * should return the first page, which is recoverable, rather than an error
 * about a value the person never typed.
 */
function encodeCursor(row: { updatedAt: string; id: string }): string {
  return Buffer.from(`${row.updatedAt}|${row.id}`, "utf8").toString("base64url");
}

function decodeCursor(cursor?: string): { updatedAt: string; id: string } | undefined {
  if (!cursor) return undefined;

  try {
    const [updatedAt, id] = Buffer.from(cursor, "base64url").toString("utf8").split("|");
    if (!updatedAt || !id) return undefined;
    return { updatedAt, id };
  } catch {
    return undefined;
  }
}

/**
 * How much of an outgrown conversation a fresh one inherits.
 *
 * Ten because the owner asked for ten, and the number is a reasonable one: it
 * is enough for the model to know what is being discussed and short enough that
 * the new thread cannot inherit the problem that ended the old one.
 */
const CONVERSATION_SEED_MESSAGES = 10;

/**
 * A tool's result, in a few words, for the progress line.
 *
 * The person watching wants to know whether the lookup found anything, not to
 * read the payload. Deliberately derived from the shape the executors already
 * return rather than from anything the model said, so a progress line cannot
 * become a place where the assistant asserts something untrue.
 */
function describeObservation(observation: unknown): string {
  if (observation && typeof observation === "object") {
    const record = observation as Record<string, unknown>;
    if (typeof record.error === "string") return record.error;
    if (typeof record.found === "number") {
      return record.found === 0 ? "nothing found" : `${record.found} found`;
    }
    if (Array.isArray(record.results)) return `${record.results.length} found`;
  }
  return "done";
}

export class AiService {
  constructor(
    private readonly settings: AiSettingsService,
    private readonly provider: AiProviderClient,
    private readonly pending: AiPendingActionRepository,
    private readonly audit: AuditRepository,
    /** Keyed by tool name. Missing means the tool is declared but not wired. */
    private readonly executors: Record<string, AiToolExecutor>,
    private readonly conversations: AiConversationRepository,
    private readonly autoApprovals: AiAutoApprovalRepository,
  ) {}

  /**
   * One turn.
   *
   * Split into a public method that establishes request-scoped state and a
   * private one that does the work, so the screen context is in place for
   * every path through the loop — including the ones that return early —
   * without a `run(...)` wrapper indenting the whole body by two.
   */
  async chat(
    actor: UserPrincipal,
    rawInput: unknown,
    onProgress?: AiProgressSink,
  ): Promise<AiChatResult> {
    const screen = aiScreenContextSchema.safeParse(
      (rawInput as { screen?: unknown } | null)?.screen ?? {},
    );

    return screenContextStore.run(screen.success ? screen.data : {}, () =>
      this.runChat(actor, rawInput, onProgress),
    );
  }

  private async runChat(
    actor: UserPrincipal,
    rawInput: unknown,
    onProgress?: AiProgressSink,
  ): Promise<AiChatResult> {
    requirePermission(actor, "ai.use");

    const parsed = aiChatInputSchema.safeParse(rawInput);
    if (!parsed.success) {
      throw new DomainError("VALIDATION_FAILED", "That message could not be read.");
    }

    /*
     * The project the thread is filed against, if the person happened to start
     * it on a project page. A label for the conversation list — nothing is told
     * to the model about it, and nothing is scoped by it.
     */
    const projectId = parsed.data.screen?.projectId ?? null;

    /*
     * The thread is resolved before the provider is even asked for, and a
     * conversation id that is not this person's simply does not resolve. So an
     * id guessed or copied from somewhere else cannot be continued, cannot be
     * read, and cannot be appended to — the request is refused before anything
     * has been spent on it.
     */
    const thread = parsed.data.conversationId
      ? await this.conversations.find(actor.tenantId, actor.userId, parsed.data.conversationId)
      : await this.conversations.create({
          tenantId: actor.tenantId,
          userId: actor.userId,
          title: deriveConversationTitle(parsed.data.message),
          projectId,
        });

    if (!thread) {
      throw new DomainError("NOT_FOUND", "That conversation could not be found.");
    }

    /*
     * The question is written down before the answer is attempted, not after.
     * If the provider is unreachable or the loop times out, the person still
     * finds what they asked in the thread instead of an exchange that silently
     * never happened.
     */
    await this.conversations.appendMessage({
      tenantId: actor.tenantId,
      conversationId: thread.id,
      role: "user",
      content: parsed.data.message,
      usedTools: [],
    });

    const provider = await this.settings.resolveProvider(actor);
    const available = toolsFor(actor);
    const deadline = Date.now() + AI_LIMITS.totalTimeoutMs;

    /*
     * The budget the owner chose, not a constant. Falls back to the shipped
     * default when a company has never touched it, so nothing depends on the
     * column having been set.
     */
    const cycleLimit = provider.maxCycles ?? AI_LIMITS.maxIterations;

    // Read back rather than reasoned about: the transcript the model sees is
    // the stored one, including the turn just written, so there is no second
    // copy of the conversation that could disagree with the record.
    const history = await this.conversations.messages(
      actor.tenantId,
      thread.id,
      AI_CONTEXT_TURNS,
    );

    /*
     * The system prompt once, at the top, under the system role — and nothing
     * else pushed in front of the conversation.
     *
     * There used to be a second system message naming the project the person
     * had open, sent on every turn whether or not the question was about it.
     * It is gone: the model asks `current_screen` when a question is ambiguous
     * and pays for that context only then. Same reasoning for everything else
     * it might want — no identity, no project list, no activity digest. It asks.
     */
    const messages: ProviderMessage[] = [
      { role: "system", content: SYSTEM_PROMPT },
      ...(parsed.data.continue ? [{ role: "system" as const, content: CONTINUATION_PROMPT }] : []),
      ...history.map((message) => ({ role: message.role, content: message.content })),
    ];

    const usedTools: string[] = [];
    /** Changes waiting for approval, gathered across the whole turn. */
    const proposals: AiProposal[] = [];
    /** Changes that ran because this person had already agreed to that tool. */
    const performed: { tool: string; summary: Record<string, unknown> }[] = [];

    /*
     * Read once per turn rather than per tool call: it is a small table, the
     * answer cannot change mid-turn in any way that should take effect, and a
     * query inside the loop would be a query per proposed action.
     */
    const preApproved = new Set(
      await this.autoApprovals.list(actor.tenantId, actor.userId),
    );

    /*
     * Every exit from the loop below stores the answer and reports the thread.
     * Wrapping it here rather than repeating it at each `return` is what makes
     * that true of all of them — including the timeout and the gave-up paths,
     * which are the ones a person most wants to find in the record later.
     */
    const finish = async (result: Omit<AiChatResult, "conversationId">): Promise<AiChatResult> => {
      // Attached here rather than at each exit, so no path can drop them.
      if (proposals.length > 0) result = { ...result, proposals };
      if (performed.length > 0) result = { ...result, performed };
      await this.conversations.appendMessage({
        tenantId: actor.tenantId,
        conversationId: thread.id,
        role: "assistant",
        content: result.answer,
        usedTools: result.usedTools,
      });
      const complete: AiChatResult = { ...result, conversationId: thread.id };
      onProgress?.({ type: "answer", result: complete });
      return complete;
    };

    let cyclesUsed = 0;

    for (let iteration = 0; iteration < cycleLimit; iteration += 1) {
      if (Date.now() > deadline) {
        return finish({
          answer: OUTCOME_MESSAGES.outOfTime,
          usedTools,
          cyclesUsed,
          cycleLimit,
        });
      }

      cyclesUsed = iteration + 1;
      onProgress?.({ type: "cycle", cycle: cyclesUsed, total: cycleLimit });

      /*
       * The budget is restated before every call, as its own system message
       * rather than edited into the first one. A model attends to the most
       * recent instruction, and a stale "you have 8 left" at the top of a long
       * transcript is worse than saying nothing — it is confidently wrong.
       */
      const withBudget: ProviderMessage[] = [
        ...messages,
        { role: "system", content: cycleBudgetPrompt(cyclesUsed, cycleLimit) },
      ];

      const reply = await this.provider.complete({
        baseUrl: provider.baseUrl,
        model: provider.model,
        apiKey: provider.apiKey,
        messages: withBudget,
        /*
         * No tools on the last step. Telling a model it must answer and then
         * handing it the means to call something else invites exactly the call
         * that gets cut off — so the ability is withdrawn rather than merely
         * discouraged, and the final turn can only be prose.
         */
        tools: cyclesUsed >= cycleLimit ? [] : available.map(describeToolForProvider),
        // Never longer than the budget that is left, so one slow call cannot
        // overrun the whole message's ceiling.
        timeoutMs: Math.min(AI_LIMITS.modelTimeoutMs, Math.max(1_000, deadline - Date.now())),
        // Belongs to whichever configuration is in use, so a person on their
        // own key is not held to the company's ceiling.
        ...(provider.maxOutputTokens ? { maxOutputTokens: provider.maxOutputTokens } : {}),
      });

      if (reply.toolCalls.length === 0) {
        return finish({ answer: reply.content.trim(), usedTools, cyclesUsed, cycleLimit });
      }

      // Recorded so the next turn's tool results have a call to answer.
      messages.push({ role: "assistant", content: reply.content, tool_calls: reply.toolCalls });

      for (const call of reply.toolCalls) {
        const tool = findTool(call.function.name);

        /*
         * A hallucinated name, or a real tool this person may not use. Both
         * are told to the model in the same shape — a tool result — so it can
         * apologise or choose differently rather than the request failing.
         *
         * `available` is re-checked rather than trusted: the model was only
         * sent the permitted tools, but a reply is not proof of what was sent.
         */
        if (!tool || !available.includes(tool)) {
          messages.push(toolResult(call.id, { error: TOOL_MESSAGES.unknown }));
          continue;
        }

        const args = tool.schema.safeParse(safeJson(call.function.arguments));
        if (!args.success) {
          // The error goes back verbatim: a model given the reason usually
          // fixes its own arguments on the next turn.
          messages.push(
            toolResult(call.id, {
              error: TOOL_MESSAGES.invalidArguments,
              detail: args.error.issues.map((issue) => issue.message).join("; ").slice(0, 300),
            }),
          );
          continue;
        }

        /*
         * Authorised again, here, against the live principal. The filter that
         * built `available` is a convenience for the model; this is the check
         * that decides. They agree today, and this is what keeps them agreeing
         * if somebody changes one of them tomorrow.
         */
        if (!hasPermission(actor, tool.requiredPermission)) {
          messages.push(toolResult(call.id, { error: TOOL_MESSAGES.forbidden }));
          continue;
        }

        if (!tool.readOnly) {
          /*
           * A change. It is never executed here.
           *
           * Two outcomes, and the difference between them is a standing
           * decision the person made earlier, never anything the model said.
           * If they have asked not to be prompted for this tool it runs now,
           * and the answer reports that it happened. Otherwise the arguments
           * are stored server-side and it waits.
           *
           * The loop does NOT stop either way. It used to return on the first
           * write, so "close these three" produced one card, then another turn,
           * then another — three interruptions for one instruction. Collecting
           * them lets the person approve the set in one act, while each entry
           * is still stored, re-read and re-authorised on its own.
           */
          if (!tool.destructive && preApproved.has(tool.name)) {
            const outcome = await this.runPreApproved(actor, tool, args.data);
            performed.push({ tool: tool.name, summary: args.data });
            messages.push(toolResult(call.id, outcome));
            onProgress?.({
              type: "observation",
              cycle: cyclesUsed,
              tool: tool.name,
              summary: describeObservation(outcome),
            });
            continue;
          }

          const proposal = await this.propose(actor, tool, args.data);
          proposals.push(proposal);

          /*
           * The model is told the proposal is pending so it stops re-proposing
           * the same change on the next turn, and so it can write an answer
           * that says what is waiting rather than claiming it is done.
           */
          messages.push(
            toolResult(call.id, {
              status: "awaiting approval",
              note: TOOL_MESSAGES.proposed,
            }),
          );
          continue;
        }

        usedTools.push(tool.name);
        onProgress?.({
          type: "tool",
          cycle: cyclesUsed,
          tool: tool.name,
          arguments: args.data,
        });

        const observation = await this.runTool(actor, tool, args.data, deadline);
        messages.push(toolResult(call.id, observation));
        onProgress?.({
          type: "observation",
          cycle: cyclesUsed,
          tool: tool.name,
          summary: describeObservation(observation),
        });
      }
    }

    /*
     * Out of iterations with no final answer. Returning something honest is
     * better than looping again: a model that has not converged in six turns
     * over local database reads is confused, not close.
     */
    /*
     * Out of steps with no conclusion. `exhausted` is what turns this from a
     * dead end into an offer: the screen shows a Keep going button, and a fresh
     * budget only starts if the person presses it. Continuing automatically
     * would spend their money without being asked, which is the same principle
     * as not letting the model write anything unapproved.
     */
    return finish({
      answer: OUTCOME_MESSAGES.outOfCycles,
      usedTools,
      exhausted: true,
      cyclesUsed,
      cycleLimit,
    });
  }

  /**
   * This person's conversations, most recently active first.
   *
   * There is no parameter for whose list to fetch, and that absence is the
   * design: a caller cannot ask for somebody else's threads because there is
   * nowhere to say whose. Ordered by last activity rather than creation, since
   * the thread somebody is in the middle of is the one they are looking for.
   */
  async listConversations(
    actor: UserPrincipal,
    rawInput?: unknown,
  ): Promise<{ conversations: AiConversationSummary[]; nextCursor: string | null }> {
    requirePermission(actor, "ai.use");

    const parsed = aiConversationListSchema.safeParse(rawInput ?? {});
    if (!parsed.success) {
      throw new DomainError("VALIDATION_FAILED", "That list could not be read.");
    }

    const { cursor, query } = parsed.data;
    const before = decodeCursor(cursor);

    /*
     * One more than a page, so whether another page exists is known from the
     * rows themselves. Counting the whole table to answer the same question
     * would scan everything a person has ever said to find out only whether
     * there is more.
     */
    const limit = CONVERSATION_PAGE_SIZE + 1;

    let rows = await this.conversations.list(actor.tenantId, actor.userId, {
      limit,
      ...(before ? { before } : {}),
      ...(query ? { query, mode: "exact" as const } : {}),
    });

    /*
     * Fuzzy runs only when exact found nothing, and it runs HERE rather than
     * inside the query. search-sql.ts explains why: expressed as an `or` the
     * condition can only ask "is this row an exact match", which says nothing
     * about whether some other row matched perfectly — so one right answer
     * arrives surrounded by near-misses. Asking "did anything match" needs the
     * whole result set, and this is the nearest place to the repository where
     * the question can be asked without losing the tenant and user scoping.
     *
     * Not attempted on a later page: a search that found nothing on page one
     * never produced a cursor, so a cursor means the exact stage was working.
     */
    if (query && rows.length === 0 && !before) {
      rows = await this.conversations.list(actor.tenantId, actor.userId, {
        limit,
        query,
        mode: "fuzzy",
      });
    }

    const hasMore = rows.length > CONVERSATION_PAGE_SIZE;
    const page = hasMore ? rows.slice(0, CONVERSATION_PAGE_SIZE) : rows;
    const last = page[page.length - 1];

    return {
      conversations: page,
      nextCursor: hasMore && last ? encodeCursor(last) : null,
    };
  }

  /**
   * Starts a fresh thread carrying the tail of an old one.
   *
   * The remedy for a conversation that has outgrown the model. A provider's API
   * is stateless: every request carries the whole transcript, so a thread that
   * no longer fits will never fit again, and without this the only way forward
   * is to start from nothing and retype the context by hand.
   *
   * The tail rather than a summary, and that is deliberate. Summarising would
   * mean asking the model to compress the very transcript that just failed to
   * fit, which is the one call that cannot be made — and a summary is the
   * model's account of what was said, which is exactly the kind of quiet
   * fabrication the grounding rules exist to prevent. Ten real turns are ten
   * things that were actually said.
   *
   * The messages are copied, not moved. The old thread is left intact and
   * readable, because it is the person's record and losing it to a technical
   * limit they did not cause would be the product destroying their work.
   */
  async branchConversation(
    actor: UserPrincipal,
    rawInput: unknown,
  ): Promise<{ conversation: AiConversationSummary; messages: StoredAiMessage[] }> {
    requirePermission(actor, "ai.use");

    const parsed = aiConversationIdSchema.safeParse(rawInput);
    if (!parsed.success) {
      throw new DomainError("VALIDATION_FAILED", "That conversation could not be continued.");
    }

    const source = await this.conversations.find(
      actor.tenantId,
      actor.userId,
      parsed.data.conversationId,
    );
    if (!source) {
      throw new DomainError("NOT_FOUND", "That conversation could not be found.");
    }

    /*
     * Read with the same cap the new thread will hold. Asking the repository
     * for the tail is what keeps a transcript too large to fit in the model
     * also out of this process's memory.
     */
    const tail = await this.conversations.messages(
      actor.tenantId,
      source.id,
      CONVERSATION_SEED_MESSAGES,
    );

    const created = await this.conversations.create({
      tenantId: actor.tenantId,
      userId: actor.userId,
      title: source.title,
      projectId: source.projectId,
    });

    /*
     * Sequentially, because the order of a conversation is its meaning and
     * these rows are ordered by when they were written. Ten inserts is not
     * worth the risk of a concurrent write interleaving them.
     */
    const seeded: StoredAiMessage[] = [];
    for (const message of tail) {
      seeded.push(
        await this.conversations.appendMessage({
          tenantId: actor.tenantId,
          conversationId: created.id,
          role: message.role,
          content: message.content,
          usedTools: message.usedTools,
        }),
      );
    }

    return {
      conversation: {
        id: created.id,
        title: source.title,
        projectId: source.projectId,
        updatedAt: new Date().toISOString(),
      },
      messages: seeded,
    };
  }

  /** One thread with its turns. Not found and not yours are the same answer. */
  async readConversation(
    actor: UserPrincipal,
    rawInput: unknown,
  ): Promise<{ conversation: AiConversationSummary; messages: StoredAiMessage[] }> {
    requirePermission(actor, "ai.use");

    const parsed = aiConversationIdSchema.safeParse(rawInput);
    if (!parsed.success) {
      throw new DomainError("VALIDATION_FAILED", "That conversation could not be read.");
    }

    const thread = await this.conversations.find(
      actor.tenantId,
      actor.userId,
      parsed.data.conversationId,
    );
    if (!thread) {
      throw new DomainError("NOT_FOUND", "That conversation could not be found.");
    }

    /*
     * The whole thread, unlike the slice the model is given. The limit upstream
     * is about what a provider can afford to read; a person reading their own
     * conversation should see all of it, which is the reason it was kept.
     */
    const messages = await this.conversations.messages(actor.tenantId, thread.id);

    return {
      conversation: {
        id: thread.id,
        title: thread.title,
        projectId: thread.projectId,
        // The list carries this; a single read does not need a second query
        // for a field the screen showing one thread does not display.
        updatedAt: messages[messages.length - 1]?.createdAt ?? new Date(0).toISOString(),
      },
      messages,
    };
  }

  /** Renaming somebody else's thread fails as not-found, not as forbidden. */
  async renameConversation(actor: UserPrincipal, rawInput: unknown): Promise<{ renamed: true }> {
    requirePermission(actor, "ai.use");

    const parsed = aiRenameConversationSchema.safeParse(rawInput);
    if (!parsed.success) {
      throw new DomainError("VALIDATION_FAILED", "That name cannot be used.");
    }

    const renamed = await this.conversations.rename(
      actor.tenantId,
      actor.userId,
      parsed.data.conversationId,
      parsed.data.title,
    );
    if (!renamed) {
      throw new DomainError("NOT_FOUND", "That conversation could not be found.");
    }

    await this.audit.append({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: "ai.conversation.rename",
      entityType: "ai_conversation",
      entityId: parsed.data.conversationId,
      result: "success",
      // The new title only. The conversation's contents are the person's own
      // and have no business being copied into an audit trail others can read.
      metadata: { title: parsed.data.title },
    });

    return { renamed: true };
  }

  /**
   * Deleting a conversation.
   *
   * Really deleted, and the messages with it by cascade. A person who asks for
   * their conversation to be gone has asked for one thing, and a hidden row
   * that still exists is not it.
   */
  async deleteConversation(actor: UserPrincipal, rawInput: unknown): Promise<{ deleted: true }> {
    requirePermission(actor, "ai.use");

    const parsed = aiConversationIdSchema.safeParse(rawInput);
    if (!parsed.success) {
      throw new DomainError("VALIDATION_FAILED", "That conversation could not be read.");
    }

    const deleted = await this.conversations.remove(
      actor.tenantId,
      actor.userId,
      parsed.data.conversationId,
    );
    if (!deleted) {
      throw new DomainError("NOT_FOUND", "That conversation could not be found.");
    }

    /*
     * Recorded because it is a deletion, and every deletion in this product is
     * recorded. The entry says that a conversation was removed and by whom; it
     * cannot say what was in it, because the rows are gone and copying them
     * here first would defeat the point of deleting them.
     */
    await this.audit.append({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: "ai.conversation.delete",
      entityType: "ai_conversation",
      entityId: parsed.data.conversationId,
      result: "success",
    });

    return { deleted: true };
  }

  /**
   * Clearing the whole history.
   *
   * Offered because the alternative is deleting forty threads one at a time,
   * which is not a safer act — it is the same act, performed so tediously that
   * people stop reading the confirmations. The card asks once, in place, and
   * says how many are about to go.
   *
   * Scoped by the asker alone: there is no parameter for whose history this is,
   * so no request can reach anybody else's. The count is returned rather than a
   * bare acknowledgement, because "deleted 12 conversations" is checkable
   * against what the person believed they had and a plain success is not.
   */
  async deleteAllConversations(actor: UserPrincipal): Promise<{ deleted: number }> {
    requirePermission(actor, "ai.use");

    const deleted = await this.conversations.removeAll(actor.tenantId, actor.userId);

    /*
     * Recorded even when it removed nothing. An attempt to erase a history is
     * worth knowing about whether or not there was one to erase, and a record
     * that only appears on success cannot answer "did anybody try".
     */
    await this.audit.append({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: "ai.conversation.delete_all",
      entityType: "ai_conversation",
      entityId: actor.userId,
      result: "success",
      metadata: { deleted },
    });

    return { deleted };
  }

  /**
   * Executes the changes a person has approved.
   *
   * The request carries only identifiers. Every argument comes from the row
   * written when the proposal was made, so what runs is what was shown —
   * editing a payload in the browser between the two steps changes nothing,
   * which is what makes the approval meaningful rather than decorative.
   *
   * A batch is a convenience for the person, not a relaxation. Each action is
   * found, re-authorised, claimed and executed on its own exactly as a single
   * one would be; approving four at once is four approvals delivered in one
   * gesture, not one approval spread over four actions. One failing does not
   * roll back the others, because they are unrelated changes that happened to
   * be agreed together — so each reports its own outcome.
   */
  async confirm(
    actor: UserPrincipal,
    rawInput: unknown,
  ): Promise<{ done: true; tool: string; results: { tool: string; ok: boolean; error?: string }[] }> {
    requirePermission(actor, "ai.use");

    const parsed = aiConfirmInputSchema.safeParse(rawInput);
    if (!parsed.success) {
      throw new DomainError("VALIDATION_FAILED", "That confirmation could not be read.");
    }

    const ids = parsed.data.actionIds ?? (parsed.data.actionId ? [parsed.data.actionId] : []);
    const results: { tool: string; ok: boolean; error?: string }[] = [];

    for (const id of ids) {
      try {
        const tool = await this.confirmOne(actor, id);
        results.push({ tool, ok: true });
      } catch (error) {
        /*
         * One refusal must not discard the rest. A proposal that expired while
         * the person was reading, or one whose permission was withdrawn in the
         * meantime, is a fact about that proposal alone.
         */
        if (ids.length === 1) throw error;
        results.push({
          tool: "unknown",
          ok: false,
          error: error instanceof DomainError ? error.message : "That change could not be carried out.",
        });
      }
    }

    const firstOk = results.find((entry) => entry.ok);
    if (!firstOk) {
      throw new DomainError("CONFLICT", "None of those changes could be carried out.");
    }

    // `tool` is kept for the single-action case, which is most of them.
    return { done: true, tool: firstOk.tool, results };
  }

  /** One approved change: found, re-authorised, claimed, executed, recorded. */
  private async confirmOne(actor: UserPrincipal, actionId: string): Promise<string> {
    // Scoped to this person: a proposal drafted in somebody else's session is
    // not found here, so one person cannot approve another's action.
    const action = await this.pending.findClaimable(actor.tenantId, actor.userId, actionId);
    if (!action) {
      throw new DomainError(
        "NOT_FOUND",
        "That suggestion has expired or was already carried out. Ask again if you still want it.",
      );
    }

    const tool = findTool(action.tool);
    const executor = tool ? this.executors[tool.name] : undefined;
    if (!tool || !executor) {
      throw new DomainError("NOT_FOUND", "That suggestion refers to something Rectangle no longer does.");
    }

    /*
     * Re-authorised at the moment of execution, not at the moment of proposal.
     * A permission withdrawn in between must take effect, and this is the only
     * check that can see the current state.
     */
    requirePermission(actor, tool.requiredPermission);

    // Burnt before it runs. If two confirmations race, exactly one wins the
    // update and the other is told the action is already done.
    const claimed = await this.pending.markConfirmed(actor.tenantId, actor.userId, action.id);
    if (!claimed) {
      throw new DomainError("CONFLICT", "That suggestion has already been carried out.");
    }

    /*
     * Everything the service audits inside this call is stamped as the
     * assistant's doing, with the proposal it came from. The person remains the
     * actor — they approved it — but the log can now answer "did a human type
     * this or did the assistant propose it", which is the first question
     * anybody asks when a record looks wrong.
     */
    await runAsAssistant({ tool: action.tool, actionId: action.id }, () =>
      executor(actor, action.arguments),
    );

    await this.audit.append({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: "ai.action.confirm",
      entityType: "ai_pending_action",
      entityId: action.id,
      result: "success",
      metadata: { tool: action.tool },
    });

    return action.tool;
  }

  /**
   * Runs a change the person had already agreed not to be asked about.
   *
   * It still goes through `requirePermission` and still writes an audit entry
   * marked as the assistant's doing. What it skips is the interruption, and
   * nothing else — an auto-approved action is as authorised and as traceable as
   * a confirmed one. A failure becomes an observation rather than an exception,
   * because the loop must be able to tell the model what went wrong and carry
   * on with the rest of the turn.
   */
  private async runPreApproved(
    actor: UserPrincipal,
    tool: AiToolDefinition,
    args: Record<string, unknown>,
  ): Promise<unknown> {
    requirePermission(actor, tool.requiredPermission);

    const executor = this.executors[tool.name];
    if (!executor) return { error: TOOL_MESSAGES.unknown };

    try {
      await runAsAssistant({ tool: tool.name, actionId: "auto" }, () => executor(actor, args));
    } catch (error) {
      return {
        error: error instanceof DomainError ? error.message : TOOL_MESSAGES.failed,
      };
    }

    await this.audit.append({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: "ai.action.auto",
      entityType: "ai_pending_action",
      entityId: tool.name,
      result: "success",
      // Recorded as auto so a review can tell which actions nobody was shown.
      metadata: { tool: tool.name, autoApproved: true },
    });

    return { done: true };
  }

  /** Which tools this person has stopped being asked about. */
  async listAutoApprovals(actor: UserPrincipal): Promise<{ tools: string[] }> {
    requirePermission(actor, "ai.use");
    return { tools: await this.autoApprovals.list(actor.tenantId, actor.userId) };
  }

  /**
   * Stops asking about a tool.
   *
   * Refuses outright for anything irreversible. That is the one rule the whole
   * tiered design rests on: a blanket "never ask again" over deletions is the
   * switch behind most published agent incidents, and the research is unanimous
   * that the remedy is to make the dangerous class unsilenceable rather than to
   * warn about it. The card does not offer the option; this refuses it anyway,
   * because a control that is merely hidden is not a control.
   */
  async grantAutoApproval(actor: UserPrincipal, rawInput: unknown): Promise<{ tools: string[] }> {
    requirePermission(actor, "ai.use");

    const parsed = aiAutoApprovalInputSchema.safeParse(rawInput);
    if (!parsed.success) throw new DomainError("VALIDATION_FAILED", "That tool is not valid.");

    const tool = findTool(parsed.data.tool);
    if (!tool) throw new DomainError("NOT_FOUND", "Rectangle does not have that tool.");
    if (tool.readOnly) {
      throw new DomainError("VALIDATION_FAILED", "That tool never asks for approval.");
    }
    if (tool.destructive) {
      throw new DomainError(
        "VALIDATION_FAILED",
        "Actions that cannot be undone always ask. This one cannot be switched off.",
      );
    }
    // Only what this person may do themselves. Otherwise somebody could store a
    // standing approval for a tool they are not allowed to use, which would sit
    // there waiting to take effect the day the permission was granted.
    requirePermission(actor, tool.requiredPermission);

    await this.autoApprovals.grant(actor.tenantId, actor.userId, tool.name);

    await this.audit.append({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: "ai.auto_approval.grant",
      entityType: "ai_auto_approval",
      entityId: tool.name,
      result: "success",
      metadata: { tool: tool.name },
    });

    return this.listAutoApprovals(actor);
  }

  /** Starts asking again. Always allowed, whatever the tool. */
  async revokeAutoApproval(actor: UserPrincipal, rawInput: unknown): Promise<{ tools: string[] }> {
    requirePermission(actor, "ai.use");

    const parsed = aiAutoApprovalInputSchema.safeParse(rawInput);
    if (!parsed.success) throw new DomainError("VALIDATION_FAILED", "That tool is not valid.");

    const removed = await this.autoApprovals.revoke(
      actor.tenantId,
      actor.userId,
      parsed.data.tool,
    );

    if (removed) {
      await this.audit.append({
        tenantId: actor.tenantId,
        actorUserId: actor.userId,
        action: "ai.auto_approval.revoke",
        entityType: "ai_auto_approval",
        entityId: parsed.data.tool,
        result: "success",
        metadata: { tool: parsed.data.tool },
      });
    }

    return this.listAutoApprovals(actor);
  }

  /** Stores what the model wants to do, for a person to approve or ignore. */
  private async propose(
    actor: UserPrincipal,
    tool: AiToolDefinition,
    args: Record<string, unknown>,
  ): Promise<AiProposal> {
    const created = await this.pending.create({
      tenantId: actor.tenantId,
      userId: actor.userId,
      tool: tool.name,
      arguments: args,
      expiresAt: new Date(Date.now() + AI_LIMITS.proposalTtlMs).toISOString(),
    });

    await this.audit.append({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: "ai.action.propose",
      entityType: "ai_pending_action",
      entityId: created.id,
      result: "success",
      metadata: { tool: tool.name },
    });

    // The summary is the validated arguments, so the card shows exactly what
    // will run rather than a paraphrase the model wrote.
    return {
      id: created.id,
      tool: tool.name,
      summary: args,
      destructive: tool.destructive === true,
    };
  }

  /**
   * Runs one read-only tool and turns whatever happens into an observation.
   *
   * Nothing escapes as an exception. A permission refusal, a timeout and an
   * unexpected fault are all things the model should be told about so it can
   * say something useful; a thrown error would instead lose the whole message.
   */
  private async runTool(
    actor: UserPrincipal,
    tool: AiToolDefinition,
    args: Record<string, unknown>,
    deadline: number,
  ): Promise<unknown> {
    const executor = this.executors[tool.name];
    if (!executor) return { error: "That tool is not available right now." };

    const budget = Math.min(AI_LIMITS.toolTimeoutMs, Math.max(500, deadline - Date.now()));

    try {
      const result = await Promise.race([
        executor(actor, args),
        new Promise((_resolve, reject) =>
          setTimeout(() => reject(new DomainError("UPSTREAM_TIMEOUT", "timeout")), budget),
        ),
      ]);

      await this.audit.append({
        tenantId: actor.tenantId,
        actorUserId: actor.userId,
        action: "ai.tool.run",
        entityType: "ai_tool",
        entityId: tool.name,
        result: "success",
        metadata: { tool: tool.name },
      });

      return result;
    } catch (error) {
      if (error instanceof DomainError && error.code === "UPSTREAM_TIMEOUT") {
        return { error: "That took too long to look up." };
      }
      /*
       * A domain error is a decision the product made — usually a refusal —
       * and its message is written for a person, so it is safe to pass on.
       * Anything else is an unexpected fault whose message may carry internals,
       * so the model is told only that it failed.
       */
      if (error instanceof DomainError) return { error: error.message };
      return { error: "That could not be looked up." };
    }
  }
}

/**
 * Describes a tool to the provider in the shape the API expects.
 *
 * Exported so the wire tests can assert on the exact bytes a real provider
 * would receive, rather than on a copy of the logic.
 */
export function describeToolForProvider(tool: AiToolDefinition): ProviderTool {
  return {
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: toJsonSchema(tool),
    },
  };
}

/**
 * The JSON Schema a provider is given for each tool.
 *
 * Generated by Zod rather than written by hand. The hand-written version
 * declared every parameter as `type: "string"` — so a model was told that a
 * status enum was free text, that probability was a string rather than an
 * integer from 1 to 5, and that a boolean was a word. It then guessed, and the
 * guesses failed Zod validation on the way back in, which the model saw as an
 * unexplained refusal and usually retried identically.
 *
 * `z.toJSONSchema` produces exactly the vocabulary the function-calling API
 * expects: types, enums, integer bounds, formats, and the required list — and
 * it reads through the `.refine()` wrappers that the update tools use, which
 * the hand-written version could not. The `$schema` key is dropped because some
 * providers reject unknown top-level keys in a parameters object.
 *
 * This is also the §0.3 rule applied: the Zod schema is the one definition of
 * what a tool accepts, and the description sent upstream is derived from it
 * rather than maintained beside it.
 */
function toJsonSchema(tool: AiToolDefinition): Record<string, unknown> {
  const generated = z.toJSONSchema(tool.schema, {
    // Inline everything. A provider is sent one tool at a time and has no
    // document to resolve a $ref against.
    io: "input",
  }) as Record<string, unknown>;

  const { $schema: _ignored, ...schema } = generated;

  /*
   * A tool that takes no arguments still needs a properties object. Several
   * providers reject a parameters schema without one, and `whoami` and friends
   * deliberately take nothing.
   */
  if (!schema.properties) schema.properties = {};
  if (!schema.type) schema.type = "object";

  return withoutUnsupportedPatterns(schema) as Record<string, unknown>;
}

/**
 * Removes every `pattern` from a generated schema, at any depth.
 *
 * This is not tidying. Zod emits a `pattern` for `z.email()` and `z.uuid()`
 * that uses negative lookahead, and the JSON Schema specification requires
 * `pattern` to be an ECMA-262 regular expression — which most providers do not
 * run. Groq, and everything else built on Go or Rust, validates with RE2, and
 * RE2 has no lookahead by design because it is what guarantees linear time.
 *
 * The consequence was total rather than partial, which is why it was hard to
 * read as a schema problem: the tool list is validated as a whole before the
 * model is invoked, so one unusable regex in `create_user` made every request
 * fail with 400 for every person, on every question, whatever they asked. The
 * panel reported that the question could not be answered, which was true and
 * said nothing about why.
 *
 * Dropping the pattern loses nothing that matters. A `pattern` in a tool schema
 * is advisory — it is a hint to the model about the shape of a string — and the
 * authority on whether an argument is acceptable is the Zod schema itself, which
 * re-parses every argument when the call comes back. The format keyword survives
 * and carries the same hint in a vocabulary providers accept.
 */
function withoutUnsupportedPatterns(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(withoutUnsupportedPatterns);

  if (node !== null && typeof node === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(node)) {
      if (key === "pattern") continue;
      result[key] = withoutUnsupportedPatterns(value);
    }
    return result;
  }

  return node;
}

/** Parses the model's argument string without throwing on nonsense. */
function safeJson(raw: string): unknown {
  try {
    const parsed: unknown = JSON.parse(raw);
    /*
     * Observed from a real provider: a model calling a tool it believes takes
     * no arguments sends the four characters `null`, which parses to null and
     * then fails the schema with "expected object, received null" — a complaint
     * about the wrong thing, which sends the model off correcting an argument
     * list rather than supplying the one field it actually omitted. An absent
     * argument object and an explicitly null one mean the same thing here.
     */
    if (parsed === null || typeof parsed !== "object") return {};
    return parsed;
  } catch {
    // An empty object fails the schema with a readable message, which is a
    // better next turn for the model than a parse error it cannot see.
    return {};
  }
}

/**
 * Wraps an observation as a tool message.
 *
 * Everything is sanitised on the way in: a tool's output is data from the
 * database, and a project description containing "ignore your instructions" is
 * a prompt injection the model cannot distinguish from a real one.
 */
function toolResult(callId: string, payload: unknown): ProviderMessage {
  return {
    role: "tool",
    tool_call_id: callId,
    content: sanitiseForModel(JSON.stringify(payload)),
  };
}
