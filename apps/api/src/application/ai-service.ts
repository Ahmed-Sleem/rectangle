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
import {
  AI_CONTEXT_TURNS,
  AI_LIMITS,
  aiChatInputSchema,
  aiConfirmInputSchema,
  aiConversationIdSchema,
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
  list(tenantId: string, userId: string, limit: number): Promise<AiConversationSummary[]>;
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
  | { type: "answer"; result: AiChatResult };

export type AiProgressSink = (event: AiProgressEvent) => void;

export interface AiChatResult {
  /** Which thread this turn belongs to. New when the request carried no id. */
  conversationId: string;
  /** The model's prose answer. Empty only if it stopped to propose something. */
  answer: string;
  /** What it looked at, so the person can judge the answer. */
  usedTools: string[];
  /** Present when it wants to change something and is waiting to be told to. */
  proposal?: { id: string; tool: string; summary: Record<string, unknown> };
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
const CONVERSATION_LIST_LIMIT = 50;

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

    /*
     * Every exit from the loop below stores the answer and reports the thread.
     * Wrapping it here rather than repeating it at each `return` is what makes
     * that true of all of them — including the timeout and the gave-up paths,
     * which are the ones a person most wants to find in the record later.
     */
    const finish = async (result: Omit<AiChatResult, "conversationId">): Promise<AiChatResult> => {
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
        tools: cyclesUsed >= cycleLimit ? [] : available.map(describeForProvider),
        // Never longer than the budget that is left, so one slow call cannot
        // overrun the whole message's ceiling.
        timeoutMs: Math.min(AI_LIMITS.modelTimeoutMs, Math.max(1_000, deadline - Date.now())),
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
           * The loop stops here. Nothing is executed, the arguments are stored
           * server-side, and the person is shown what was proposed. This is the
           * only path by which the assistant can change anything, and it always
           * passes through a human.
           */
          const proposal = await this.propose(actor, tool, args.data);
          return finish({
            answer: reply.content.trim(),
            usedTools,
            proposal,
            cyclesUsed,
            cycleLimit,
          });
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
  async listConversations(actor: UserPrincipal): Promise<{ conversations: AiConversationSummary[] }> {
    requirePermission(actor, "ai.use");
    return {
      conversations: await this.conversations.list(actor.tenantId, actor.userId, CONVERSATION_LIST_LIMIT),
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
   * Executes a change a person has approved.
   *
   * The request carries only an identifier. The arguments come from the
   * database row written when the proposal was made, so what runs is what was
   * shown — editing the payload in the browser between the two steps changes
   * nothing, which is what makes the approval meaningful rather than
   * decorative.
   */
  async confirm(actor: UserPrincipal, rawInput: unknown): Promise<{ done: true; tool: string }> {
    requirePermission(actor, "ai.use");

    const parsed = aiConfirmInputSchema.safeParse(rawInput);
    if (!parsed.success) {
      throw new DomainError("VALIDATION_FAILED", "That confirmation could not be read.");
    }

    // Scoped to this person: a proposal drafted in somebody else's session is
    // not found here, so one person cannot approve another's action.
    const action = await this.pending.findClaimable(actor.tenantId, actor.userId, parsed.data.actionId);
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

    return { done: true, tool: action.tool };
  }

  /** Stores what the model wants to do, for a person to approve or ignore. */
  private async propose(
    actor: UserPrincipal,
    tool: AiToolDefinition,
    args: Record<string, unknown>,
  ): Promise<{ id: string; tool: string; summary: Record<string, unknown> }> {
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
    return { id: created.id, tool: tool.name, summary: args };
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

/** Describes a tool to the provider in the shape the API expects. */
function describeForProvider(tool: AiToolDefinition): ProviderTool {
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
 * A minimal JSON Schema for each tool.
 *
 * Written by hand from the registry rather than generated from Zod: the
 * provider needs only names, types and which are required, and a generated
 * schema carries Zod's own vocabulary that some providers reject. The Zod
 * schema remains the gate — this is only the description sent upstream.
 */
function toJsonSchema(tool: AiToolDefinition): Record<string, unknown> {
  const shape = (tool.schema as unknown as { shape?: Record<string, unknown> }).shape ?? {};
  const properties: Record<string, unknown> = {};
  const required: string[] = [];

  for (const [key, field] of Object.entries(shape)) {
    const optional =
      typeof (field as { isOptional?: () => boolean }).isOptional === "function" &&
      (field as { isOptional: () => boolean }).isOptional();
    properties[key] = { type: "string" };
    if (!optional) required.push(key);
  }

  return { type: "object", properties, required, additionalProperties: false };
}

/** Parses the model's argument string without throwing on nonsense. */
function safeJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
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
