/**
 * The harness, tested against a model that misbehaves.
 *
 * A fake provider is the point rather than a limitation: it lets the model do
 * the things a real one occasionally does — invent a tool, send arguments that
 * do not validate, reach for something the person may not use, loop without
 * converging — and asserts that none of them can hurt anybody. A test against
 * a well-behaved model would prove almost nothing.
 *
 * The write path is tested hardest, because it is the only one that changes
 * anything.
 */
import { describe, expect, it, vi } from "vitest";
import {
  AiService,
  type AiAutoApprovalRepository,
  type AiConversationRepository,
  type AiPendingActionRepository,
  type AiToolExecutor,
} from "../src/application/ai-service.js";
import type { AiSettingsService } from "../src/application/ai-settings-service.js";
import type { AiProviderClient, ProviderReply, ProviderRequest } from "../src/infrastructure/ai-provider.js";
import type { AuditEventInput, AuditRepository } from "../src/application/project-service.js";
import type { UserPrincipal } from "../src/domain/auth.js";
import { AI_LIMITS } from "../src/domain/ai.js";

const tenantId = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";
const projectId = "33333333-3333-4333-8333-333333333333";

function person(permissions: string[]): UserPrincipal {
  return { tenantId, userId, roles: ["none"], permissions: permissions as never };
}

class MemoryAudit implements AuditRepository {
  readonly events: AuditEventInput[] = [];
  async append(event: AuditEventInput): Promise<void> {
    this.events.push(event);
  }
}

class MemoryPending implements AiPendingActionRepository {
  rows: Array<{
    id: string;
    tenantId: string;
    userId: string;
    tool: string;
    arguments: Record<string, unknown>;
    expiresAt: string;
    confirmedAt?: string;
  }> = [];
  private next = 1;

  async create(input: {
    tenantId: string;
    userId: string;
    tool: string;
    arguments: Record<string, unknown>;
    expiresAt: string;
  }) {
    const id = `aaaaaaaa-0000-4000-8000-00000000000${this.next++}`;
    this.rows.push({ id, ...input });
    return { id };
  }

  async findClaimable(searchTenant: string, searchUser: string, id: string) {
    const row = this.rows.find(
      (candidate) =>
        candidate.id === id &&
        candidate.tenantId === searchTenant &&
        candidate.userId === searchUser &&
        !candidate.confirmedAt &&
        new Date(candidate.expiresAt).getTime() > Date.now(),
    );
    return row ? { id: row.id, tool: row.tool, arguments: row.arguments } : null;
  }

  async markConfirmed(searchTenant: string, searchUser: string, id: string) {
    const row = this.rows.find(
      (candidate) =>
        candidate.id === id &&
        candidate.tenantId === searchTenant &&
        candidate.userId === searchUser &&
        !candidate.confirmedAt,
    );
    if (!row) return false;
    row.confirmedAt = new Date().toISOString();
    return true;
  }
}

/** Replies in the order given, so a test can script a whole conversation. */
class ScriptedProvider implements AiProviderClient {
  readonly requests: ProviderRequest[] = [];
  constructor(private readonly replies: ProviderReply[]) {}
  async complete(request: ProviderRequest): Promise<ProviderReply> {
    this.requests.push(request);
    return (
      this.replies.shift() ?? { content: "done", toolCalls: [] }
    );
  }
}

function toolCall(name: string, args: unknown) {
  return {
    id: `call-${name}`,
    type: "function" as const,
    function: { name, arguments: JSON.stringify(args) },
  };
}

/**
 * Conversations held in memory.
 *
 * Faithful to the contract in one respect that matters: `find` requires the
 * tenant and the person, so a test that reaches for somebody else's thread
 * gets nothing here for the same reason it would get nothing from Postgres.
 */
class MemoryConversations implements AiConversationRepository {
  rows: Array<{ id: string; tenantId: string; userId: string; title: string; projectId: string | null }> = [];
  said: Array<{
    id: string;
    tenantId: string;
    conversationId: string;
    role: "user" | "assistant";
    content: string;
    usedTools: string[];
    createdAt: string;
  }> = [];
  private next = 1;

  async create(input: { tenantId: string; userId: string; title: string; projectId: string | null }) {
    const id = `cccccccc-0000-4000-8000-00000000000${this.next++}`;
    this.rows.push({ id, ...input });
    return { id };
  }

  async find(tenantId: string, userId: string, id: string) {
    const row = this.rows.find(
      (candidate) => candidate.id === id && candidate.tenantId === tenantId && candidate.userId === userId,
    );
    return row ? { id: row.id, title: row.title, projectId: row.projectId } : null;
  }

  async list(tenantId: string, userId: string, limit: number) {
    return this.rows
      .filter((row) => row.tenantId === tenantId && row.userId === userId)
      .slice(0, limit)
      .map((row) => ({
        id: row.id,
        title: row.title,
        projectId: row.projectId,
        updatedAt: new Date(0).toISOString(),
      }));
  }

  async messages(tenantId: string, conversationId: string, limit?: number) {
    const all = this.said.filter(
      (row) => row.tenantId === tenantId && row.conversationId === conversationId,
    );
    return limit === undefined ? all : all.slice(-limit);
  }

  async appendMessage(input: {
    tenantId: string;
    conversationId: string;
    role: "user" | "assistant";
    content: string;
    usedTools: string[];
  }) {
    const row = {
      id: `dddddddd-0000-4000-8000-00000000000${this.said.length + 1}`,
      createdAt: new Date(2026, 0, 1, 0, this.said.length).toISOString(),
      ...input,
    };
    this.said.push(row);
    return row;
  }

  async rename(tenantId: string, userId: string, id: string, title: string) {
    const row = this.rows.find(
      (candidate) => candidate.id === id && candidate.tenantId === tenantId && candidate.userId === userId,
    );
    if (!row) return false;
    row.title = title;
    return true;
  }

  async remove(tenantId: string, userId: string, id: string) {
    const before = this.rows.length;
    this.rows = this.rows.filter(
      (row) => !(row.id === id && row.tenantId === tenantId && row.userId === userId),
    );
    this.said = this.said.filter((row) => row.conversationId !== id);
    return this.rows.length < before;
  }
}

/** Tools a person has said they no longer want to be asked about. */
class MemoryAutoApprovals implements AiAutoApprovalRepository {
  rows = new Set<string>();
  private key(tenantId: string, userId: string, tool: string) {
    return `${tenantId}:${userId}:${tool}`;
  }
  async list(tenantId: string, userId: string) {
    return [...this.rows]
      .filter((row) => row.startsWith(`${tenantId}:${userId}:`))
      .map((row) => row.split(":")[2] ?? "");
  }
  async grant(tenantId: string, userId: string, tool: string) {
    this.rows.add(this.key(tenantId, userId, tool));
  }
  async revoke(tenantId: string, userId: string, tool: string) {
    return this.rows.delete(this.key(tenantId, userId, tool));
  }
}

function build(options: {
  replies: ProviderReply[];
  executors?: Record<string, AiToolExecutor>;
  pending?: MemoryPending;
  audit?: MemoryAudit;
  conversations?: MemoryConversations;
  autoApprovals?: MemoryAutoApprovals;
}) {
  const audit = options.audit ?? new MemoryAudit();
  const pending = options.pending ?? new MemoryPending();
  const conversations = options.conversations ?? new MemoryConversations();
  const autoApprovals = options.autoApprovals ?? new MemoryAutoApprovals();
  const provider = new ScriptedProvider(options.replies);
  const settings = {
    resolveProvider: async () => ({
      baseUrl: "https://provider.test/v1",
      model: "some-model",
      apiKey: "sk-secret",
    }),
  } as unknown as AiSettingsService;

  const service = new AiService(
    settings,
    provider,
    pending,
    audit,
    options.executors ?? {},
    conversations,
    autoApprovals,
  );
  return { service, audit, pending, provider, conversations, autoApprovals };
}

describe("who may use the assistant at all", () => {
  it("refuses somebody without the permission", async () => {
    const { service } = build({ replies: [] });
    await expect(service.chat(person([]), { message: "hello" }))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("the model asking for tools", () => {
  it("answers directly when it needs none", async () => {
    const { service } = build({ replies: [{ content: "Two projects are active.", toolCalls: [] }] });

    const result = await service.chat(person(["ai.use"]), {
      message: "how many projects",
    });

    expect(result.answer).toBe("Two projects are active.");
    expect(result.usedTools).toEqual([]);
  });

  it("runs a read tool and answers from what it returned", async () => {
    const search = vi.fn(async () => [{ title: "Nile Tower", subtitle: "NT-001" }]);
    const { service } = build({
      replies: [
        { content: "", toolCalls: [toolCall("search_projects", { query: "Nile" })] },
        { content: "Nile Tower, code NT-001.", toolCalls: [] },
      ],
      executors: { search_projects: search },
    });

    const result = await service.chat(person(["ai.use", "projects.read"]), {
      message: "find Nile",
    });

    expect(search).toHaveBeenCalledOnce();
    expect(result.usedTools).toEqual(["search_projects"]);
    expect(result.answer).toContain("NT-001");
  });

  it("is only told about the tools the person may use", async () => {
    /*
     * Least privilege enforced by absence. A tool the model was never told
     * about cannot be talked into existence by anything in the conversation.
     */
    const { service, provider } = build({ replies: [{ content: "ok", toolCalls: [] }] });

    await service.chat(person(["ai.use", "projects.read"]), {
      message: "hi",
    });

    const offered = provider.requests[0]!.tools.map((tool) => tool.function.name);
    expect(offered).toContain("search_projects");
    expect(offered).not.toContain("search_risks");
    expect(offered).not.toContain("create_task");
  });

  it("tells the model when it invents a tool, rather than failing", async () => {
    // Models hallucinate names. The message must survive it.
    const { service } = build({
      replies: [
        { content: "", toolCalls: [toolCall("delete_everything", {})] },
        { content: "Sorry, I cannot do that.", toolCalls: [] },
      ],
    });

    const result = await service.chat(person(["ai.use", "projects.read"]), {
      message: "delete it all",
    });

    expect(result.answer).toBe("Sorry, I cannot do that.");
    expect(result.usedTools).toEqual([]);
  });

  it("refuses a real tool the person may not use, even if the model asks", async () => {
    /*
     * The model was not offered this tool, but a reply is not proof of what
     * was sent, so the harness refuses it on the way back.
     */
    const risks = vi.fn();
    const { service } = build({
      replies: [
        { content: "", toolCalls: [toolCall("search_risks", { query: "x" })] },
        { content: "I cannot see risks.", toolCalls: [] },
      ],
      executors: { search_risks: risks as unknown as AiToolExecutor },
    });

    await service.chat(person(["ai.use", "projects.read"]), {
      message: "any risks?",
    });

    expect(risks).not.toHaveBeenCalled();
  });

  it("checks the permission itself, not only that the tool was offered", async () => {
    /*
     * Defence in depth, isolated so it is actually tested.
     *
     * Two things stop an unauthorised call: the tool is missing from the list
     * the model was given, and the harness re-checks the permission before
     * executing. The first masks the second — break-testing showed that
     * deleting the permission check left every test green, which made it an
     * assumption wearing a test's clothing.
     *
     * So this drives the person's permissions apart from the tool's: they hold
     * `risks.read` when the tool list is built, and it is taken away before
     * the reply comes back. Only the second check can catch that, which is
     * exactly the case a permission revoked mid-conversation produces.
     */
    const risks = vi.fn();
    const revoking = person(["ai.use", "risks.read"]);

    const provider: AiProviderClient = {
      async complete() {
        // The permission disappears between the request and the reply.
        (revoking as { permissions: string[] }).permissions = ["ai.use"];
        return { content: "", toolCalls: [toolCall("search_risks", { query: "x" })] };
      },
    };

    const service = new AiService(
      { resolveProvider: async () => ({ baseUrl: "https://p.test", model: "m", apiKey: "k" }) } as unknown as AiSettingsService,
      provider,
      new MemoryPending(),
      new MemoryAudit(),
      { search_risks: risks as unknown as AiToolExecutor },
      new MemoryConversations(),
      new MemoryAutoApprovals(),
    );

    await service.chat(revoking, { message: "any risks?" });

    expect(risks).not.toHaveBeenCalled();
  });

  it("hands invalid arguments back instead of running the tool", async () => {
    const search = vi.fn();
    const { service } = build({
      replies: [
        // `query` is required and must not be empty.
        { content: "", toolCalls: [toolCall("search_projects", { query: "" })] },
        { content: "What should I search for?", toolCalls: [] },
      ],
      executors: { search_projects: search as unknown as AiToolExecutor },
    });

    const result = await service.chat(person(["ai.use", "projects.read"]), {
      message: "search",
    });

    expect(search).not.toHaveBeenCalled();
    expect(result.answer).toContain("What should I search for?");
  });

  /*
   * Observed from a real provider, not imagined. Asked a question that needed a
   * no-argument tool, Groq sent the four characters `null` as the arguments
   * string. That parses, so the JSON guard let it through, and Zod then failed
   * with "expected object, received null" — a complaint about the wrong thing.
   * The model read it as an argument-list problem, could not see what to
   * correct, and burned its remaining steps re-sending the same call.
   */
  it("treats a null argument payload as an empty one", async () => {
    const whoami = vi.fn(async () => ({ name: "Mona" }));
    const { service } = build({
      replies: [
        {
          content: "",
          toolCalls: [
            { id: "call-whoami", type: "function" as const, function: { name: "whoami", arguments: "null" } },
          ],
        },
        { content: "You are Mona.", toolCalls: [] },
      ],
      executors: { whoami },
    });

    const result = await service.chat(person(["ai.use"]), { message: "who am I?" });

    expect(whoami).toHaveBeenCalledOnce();
    expect(result.answer).toContain("Mona");
  });

  it("survives a tool that fails", async () => {
    // A tool must never take the whole message down with it.
    const { service } = build({
      replies: [
        { content: "", toolCalls: [toolCall("search_projects", { query: "a" })] },
        { content: "I could not look that up.", toolCalls: [] },
      ],
      executors: {
        search_projects: async () => {
          throw new Error("database on fire");
        },
      },
    });

    const result = await service.chat(person(["ai.use", "projects.read"]), {
      message: "find a",
    });

    expect(result.answer).toBe("I could not look that up.");
  });

  it("stops rather than looping forever", async () => {
    /*
     * A model that keeps calling tools and never concludes. Without a ceiling
     * this occupies a worker indefinitely.
     */
    const replies = Array.from({ length: 20 }, () => ({
      content: "",
      toolCalls: [toolCall("search_projects", { query: "again" })],
    }));
    const { service, provider } = build({
      replies,
      executors: { search_projects: async () => [] },
    });

    const result = await service.chat(person(["ai.use", "projects.read"]), {
      message: "loop",
    });

    expect(provider.requests.length).toBeLessThanOrEqual(6);
    /*
     * Running out of steps is now an offer rather than a dead end: the reply
     * says it can pick up where it left off, and `exhausted` is what puts the
     * Keep going button on the screen.
     */
    expect(result.answer).toMatch(/ran out of steps/iu);
    expect(result.exhausted).toBe(true);
    expect(result.cyclesUsed).toBe(result.cycleLimit);
  });
});

describe("changing something", () => {
  const author = person(["ai.use", "tasks.create"]);

  it("proposes rather than acting, and executes nothing yet", async () => {
    const create = vi.fn();
    const { service } = build({
      replies: [
        {
          content: "I can add that.",
          toolCalls: [toolCall("create_task", { projectId, title: "Pour slab" })],
        },
      ],
      executors: { create_task: create as unknown as AiToolExecutor },
    });

    const result = await service.chat(author, {
      message: "add a task to pour the slab",
    });

    expect(create).not.toHaveBeenCalled();
    expect(result.proposals?.[0]?.tool).toBe("create_task");
    expect(result.proposals?.[0]?.summary).toMatchObject({ title: "Pour slab" });
  });

  it("carries it out once the person confirms", async () => {
    const create: AiToolExecutor = vi.fn(async () => ({ id: "task-1" }));
    const pending = new MemoryPending();
    const { service } = build({
      replies: [
        { content: "", toolCalls: [toolCall("create_task", { projectId, title: "Pour slab" })] },
      ],
      executors: { create_task: create },
      pending,
    });

    const proposed = await service.chat(author, {
      message: "add it",
    });
    await service.confirm(author, { actionId: proposed.proposals?.[0]!.id });

    expect(create).toHaveBeenCalledOnce();
    expect(vi.mocked(create).mock.calls[0]![1]).toMatchObject({ projectId, title: "Pour slab" });
  });

  it("executes the arguments it stored, not the ones sent back", async () => {
    /*
     * The reason the draft is held server-side. If the browser could supply
     * the arguments at confirmation time, the approval would be meaningless:
     * a person approves what they were shown, and something else runs.
     */
    const create: AiToolExecutor = vi.fn(async () => ({ id: "task-1" }));
    const { service } = build({
      replies: [
        { content: "", toolCalls: [toolCall("create_task", { projectId, title: "Pour slab" })] },
      ],
      executors: { create_task: create },
    });

    const proposed = await service.chat(author, { message: "add" });
    await service.confirm(author, {
      actionId: proposed.proposals?.[0]!.id,
      // Tampered payload, as a hostile client would send.
      title: "Delete everything",
      projectId: "99999999-9999-4999-8999-999999999999",
    } as unknown);

    expect(vi.mocked(create).mock.calls[0]![1]).toMatchObject({ projectId, title: "Pour slab" });
  });

  it("runs once, however many times it is confirmed", async () => {
    const create: AiToolExecutor = vi.fn(async () => ({ id: "task-1" }));
    const { service } = build({
      replies: [
        { content: "", toolCalls: [toolCall("create_task", { projectId, title: "Pour slab" })] },
      ],
      executors: { create_task: create },
    });

    const proposed = await service.chat(author, { message: "add" });
    await service.confirm(author, { actionId: proposed.proposals?.[0]!.id });
    await expect(service.confirm(author, { actionId: proposed.proposals?.[0]!.id })).rejects.toMatchObject(
      { code: "NOT_FOUND" },
    );

    expect(create).toHaveBeenCalledOnce();
  });

  it("refuses a proposal drafted in somebody else's session", async () => {
    // Otherwise one person could approve an action another person's assistant
    // suggested, which is an approval by the wrong human.
    const create = vi.fn();
    const pending = new MemoryPending();
    const { service } = build({
      replies: [
        { content: "", toolCalls: [toolCall("create_task", { projectId, title: "Pour slab" })] },
      ],
      executors: { create_task: create as unknown as AiToolExecutor },
      pending,
    });

    const proposed = await service.chat(author, { message: "add" });

    const someoneElse: UserPrincipal = {
      tenantId,
      userId: "44444444-4444-4444-8444-444444444444",
      roles: ["none"],
      permissions: ["ai.use", "tasks.create"] as never,
    };
    await expect(
      service.confirm(someoneElse, { actionId: proposed.proposals?.[0]!.id }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(create).not.toHaveBeenCalled();
  });

  it("refuses if the permission was withdrawn between proposing and confirming", async () => {
    /*
     * The gap that only a check at execution time can close. Authorising when
     * the proposal was made would let a revoked permission still act.
     */
    const create = vi.fn();
    const { service } = build({
      replies: [
        { content: "", toolCalls: [toolCall("create_task", { projectId, title: "Pour slab" })] },
      ],
      executors: { create_task: create as unknown as AiToolExecutor },
    });

    const proposed = await service.chat(author, { message: "add" });

    const demoted = person(["ai.use"]);
    await expect(
      service.confirm(demoted, { actionId: proposed.proposals?.[0]!.id }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(create).not.toHaveBeenCalled();
  });

  it("records both the proposal and the confirmation", async () => {
    // An action taken by an assistant must be as auditable as one taken by
    // hand — more so, because somebody will ask later why it happened.
    const audit = new MemoryAudit();
    const { service } = build({
      replies: [
        { content: "", toolCalls: [toolCall("create_task", { projectId, title: "Pour slab" })] },
      ],
      executors: { create_task: async () => ({}) },
      audit,
    });

    const proposed = await service.chat(author, { message: "add" });
    await service.confirm(author, { actionId: proposed.proposals?.[0]!.id });

    const actions = audit.events.map((event) => event.action);
    expect(actions).toContain("ai.action.propose");
    expect(actions).toContain("ai.action.confirm");
  });
});

describe("conversations are kept", () => {
  const reply = (content: string): ProviderReply => ({ content, toolCalls: [] });

  it("starts a thread when none is named, and stores both sides of the turn", async () => {
    const { service, conversations } = build({ replies: [reply("Four projects are running.")] });

    const result = await service.chat(person(["ai.use"]), { message: "how many projects" });

    expect(result.conversationId).toBeTruthy();
    expect(conversations.said.map((row) => [row.role, row.content])).toEqual([
      ["user", "how many projects"],
      ["assistant", "Four projects are running."],
    ]);
  });

  it("titles the thread from the opening question", async () => {
    const { service, conversations } = build({ replies: [reply("ok")] });

    await service.chat(person(["ai.use"]), { message: "which risks are overdue" });

    expect(conversations.rows[0]?.title).toBe("which risks are overdue");
  });

  it("continues the named thread rather than starting another", async () => {
    const { service, conversations } = build({ replies: [reply("one"), reply("two")] });
    const actor = person(["ai.use"]);

    const first = await service.chat(actor, { message: "opening question" });
    const second = await service.chat(actor, {
      conversationId: first.conversationId,
      message: "and then?",
    });

    expect(second.conversationId).toBe(first.conversationId);
    expect(conversations.rows).toHaveLength(1);
    expect(conversations.said).toHaveLength(4);
  });

  /*
   * The reason the transcript moved to the server. What the model is shown is
   * read back out of storage, so a client cannot present the model with a
   * conversation that differs from the one on the record.
   */
  it("replays the stored thread to the model, not anything the caller sent", async () => {
    const conversations = new MemoryConversations();
    const { service, provider } = build({
      replies: [reply("first answer"), reply("second answer")],
      conversations,
    });
    const actor = person(["ai.use"]);

    const first = await service.chat(actor, { message: "remember this" });
    await service.chat(actor, { conversationId: first.conversationId, message: "what did I say" });

    const lastRequest = provider.requests[provider.requests.length - 1] as ProviderRequest;
    expect(lastRequest.messages.map((message) => message.content)).toContain("remember this");
    expect(lastRequest.messages.map((message) => message.content)).toContain("first answer");
  });

  /*
   * The question survives a failure. Somebody whose provider was unreachable
   * must still find what they asked in the thread, rather than an exchange
   * that appears never to have happened.
   */
  it("keeps the question even when answering fails", async () => {
    const conversations = new MemoryConversations();
    const failing: AiProviderClient = {
      async complete() {
        throw new Error("upstream is down");
      },
    };
    const service = new AiService(
      { resolveProvider: async () => ({ baseUrl: "https://p.test", model: "m", apiKey: "k" }) } as unknown as AiSettingsService,
      failing,
      new MemoryPending(),
      new MemoryAudit(),
      {},
      conversations,
      new MemoryAutoApprovals(),
    );

    await expect(service.chat(person(["ai.use"]), { message: "did this survive" })).rejects.toThrow();

    expect(conversations.said.map((row) => row.content)).toEqual(["did this survive"]);
  });

  /*
   * Added after a break-test passed when it should not have. Removing the
   * store from the timeout exit left every test green, because none of them
   * reached that branch — the classic test that cannot see the bug. These two
   * drive the loop's other two ways out, so all four exits are now covered and
   * a person always finds what the assistant said, including when it gave up.
   */
  it("stores the answer when the loop runs out of time", async () => {
    const conversations = new MemoryConversations();
    let clock = Date.now();
    const nowSpy = vi.spyOn(Date, "now").mockImplementation(() => clock);

    try {
      const provider: AiProviderClient = {
        async complete() {
          // The whole budget disappears while the model is thinking.
          clock += AI_LIMITS.totalTimeoutMs + 1;
          return { content: "", toolCalls: [toolCall("search_projects", { query: "a" })] };
        },
      };
      const service = new AiService(
        { resolveProvider: async () => ({ baseUrl: "https://p.test", model: "m", apiKey: "k" }) } as unknown as AiSettingsService,
        provider,
        new MemoryPending(),
        new MemoryAudit(),
        { search_projects: (async () => ({ found: 0 })) as unknown as AiToolExecutor },
        conversations,
        new MemoryAutoApprovals(),
      );

      const result = await service.chat(person(["ai.use", "projects.read"]), { message: "slow one" });

      expect(result.answer).toContain("longer than expected");
      expect(conversations.said.map((row) => row.role)).toEqual(["user", "assistant"]);
      expect(conversations.said[1]?.content).toBe(result.answer);
    } finally {
      nowSpy.mockRestore();
    }
  });

  it("stores the answer when the loop gives up without converging", async () => {
    const conversations = new MemoryConversations();
    const provider: AiProviderClient = {
      // Never reaches a final answer: always reaches for the tool again.
      async complete() {
        return { content: "", toolCalls: [toolCall("search_projects", { query: "a" })] };
      },
    };
    const service = new AiService(
      { resolveProvider: async () => ({ baseUrl: "https://p.test", model: "m", apiKey: "k" }) } as unknown as AiSettingsService,
      provider,
      new MemoryPending(),
      new MemoryAudit(),
      { search_projects: (async () => ({ found: 0 })) as unknown as AiToolExecutor },
      conversations,
      new MemoryAutoApprovals(),
    );

    const result = await service.chat(person(["ai.use", "projects.read"]), { message: "round and round" });

    expect(result.answer).toMatch(/ran out of steps/iu);
    expect(conversations.said[1]?.content).toBe(result.answer);
  });

  it("records which tools an answer was built from", async () => {
    const { service, conversations } = build({
      replies: [
        { content: "", toolCalls: [toolCall("search_projects", { query: "Nile" })] },
        reply("One project matches."),
      ],
      executors: { search_projects: (async () => ({ found: 1 })) as unknown as AiToolExecutor },
    });

    await service.chat(person(["ai.use", "projects.read"]), { message: "find Nile" });

    const answer = conversations.said.find((row) => row.role === "assistant");
    expect(answer?.usedTools).toEqual(["search_projects"]);
  });
});

describe("a conversation belongs to one person", () => {
  const otherUserId = "44444444-4444-4444-8444-444444444444";
  const otherTenantId = "55555555-5555-4555-8555-555555555555";

  /*
   * The isolation break-tests. Each one holds a real conversation id — so the
   * id is not the secret — and differs only in who is asking. Deleting the
   * owner condition from any repository query makes these fail.
   */
  it("refuses to read somebody else's thread", async () => {
    const { service, conversations } = build({ replies: [{ content: "hello", toolCalls: [] }] });
    const owner = person(["ai.use"]);
    const started = await service.chat(owner, { message: "my private question" });

    const colleague: UserPrincipal = { ...owner, userId: otherUserId };

    await expect(
      service.readConversation(colleague, { conversationId: started.conversationId }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(conversations.said.some((row) => row.content === "my private question")).toBe(true);
  });

  it("refuses to read a thread from another company", async () => {
    const { service } = build({ replies: [{ content: "hello", toolCalls: [] }] });
    const owner = person(["ai.use"]);
    const started = await service.chat(owner, { message: "our question" });

    const outsider: UserPrincipal = { ...owner, tenantId: otherTenantId };

    await expect(
      service.readConversation(outsider, { conversationId: started.conversationId }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("refuses to continue somebody else's thread", async () => {
    const { service } = build({ replies: [{ content: "hello", toolCalls: [] }] });
    const owner = person(["ai.use"]);
    const started = await service.chat(owner, { message: "mine" });

    const colleague: UserPrincipal = { ...owner, userId: otherUserId };

    await expect(
      service.chat(colleague, { conversationId: started.conversationId, message: "let me in" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("refuses to rename or delete somebody else's thread", async () => {
    const { service, conversations } = build({ replies: [{ content: "hello", toolCalls: [] }] });
    const owner = person(["ai.use"]);
    const started = await service.chat(owner, { message: "mine" });
    const colleague: UserPrincipal = { ...owner, userId: otherUserId };

    await expect(
      service.renameConversation(colleague, { conversationId: started.conversationId, title: "yours now" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      service.deleteConversation(colleague, { conversationId: started.conversationId }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    expect(conversations.rows).toHaveLength(1);
  });

  it("lists only the asker's own threads", async () => {
    const conversations = new MemoryConversations();
    const { service } = build({ replies: [{ content: "a", toolCalls: [] }], conversations });
    const owner = person(["ai.use"]);
    await service.chat(owner, { message: "mine" });

    conversations.rows.push({
      id: "eeeeeeee-0000-4000-8000-000000000001",
      tenantId,
      userId: otherUserId,
      title: "somebody else's",
      projectId: null,
    });

    const listed = await service.listConversations(owner);

    expect(listed.conversations.map((row) => row.title)).toEqual(["mine"]);
  });

  it("refuses the whole conversation surface without the permission", async () => {
    const { service } = build({ replies: [] });
    const stranger = person([]);
    const anyId = "eeeeeeee-0000-4000-8000-000000000002";

    await expect(service.listConversations(stranger)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(service.readConversation(stranger, { conversationId: anyId })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(service.renameConversation(stranger, { conversationId: anyId, title: "x" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(service.deleteConversation(stranger, { conversationId: anyId })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("takes the messages with the thread when it is deleted", async () => {
    const { service, conversations } = build({ replies: [{ content: "hello", toolCalls: [] }] });
    const owner = person(["ai.use"]);
    const started = await service.chat(owner, { message: "forget this" });

    await service.deleteConversation(owner, { conversationId: started.conversationId });

    expect(conversations.rows).toHaveLength(0);
    expect(conversations.said).toHaveLength(0);
  });
});

describe("the reasoning budget", () => {
  /** A provider that always reaches for a tool, so the loop can only end on a limit. */
  function neverConverges(maxCycles?: number) {
    const conversations = new MemoryConversations();
    const provider: AiProviderClient = {
      async complete(request: ProviderRequest) {
        // The last turn withdraws the tools, so the model can only answer.
        if ((request.tools ?? []).length === 0) {
          return { content: "Here is what I found so far.", toolCalls: [] };
        }
        return { content: "", toolCalls: [toolCall("search_projects", { query: "a" })] };
      },
    };
    const service = new AiService(
      {
        resolveProvider: async () => ({
          baseUrl: "https://p.test",
          model: "m",
          apiKey: "k",
          ...(maxCycles === undefined ? {} : { maxCycles }),
        }),
      } as unknown as AiSettingsService,
      provider,
      new MemoryPending(),
      new MemoryAudit(),
      { search_projects: (async () => ({ found: 0 })) as unknown as AiToolExecutor },
      conversations,
      new MemoryAutoApprovals(),
    );
    return { service, conversations, provider };
  }

  it("honours the company's configured limit rather than a constant", async () => {
    const { service } = neverConverges(3);

    const result = await service.chat(person(["ai.use", "projects.read"]), { message: "dig" });

    expect(result.cycleLimit).toBe(3);
    expect(result.cyclesUsed).toBe(3);
  });

  it("falls back to the shipped default when a company has not chosen one", async () => {
    const { service } = neverConverges();

    const result = await service.chat(person(["ai.use", "projects.read"]), { message: "dig" });

    expect(result.cycleLimit).toBe(AI_LIMITS.maxIterations);
  });

  /*
   * The owner asked that the model know where it is in the budget. Telling it
   * is what lets it prioritise and write a useful summary on its last turn
   * instead of being cut off mid-investigation.
   */
  it("tells the model which step it is on and how many remain", async () => {
    const conversations = new MemoryConversations();
    const seen: string[] = [];
    const provider: AiProviderClient = {
      async complete(request: ProviderRequest) {
        const budget = request.messages.filter((m) => m.role === "system").at(-1);
        seen.push(String(budget?.content ?? ""));
        if ((request.tools ?? []).length === 0) return { content: "done", toolCalls: [] };
        return { content: "", toolCalls: [toolCall("search_projects", { query: "a" })] };
      },
    };
    const service = new AiService(
      { resolveProvider: async () => ({ baseUrl: "https://p.test", model: "m", apiKey: "k", maxCycles: 3 }) } as unknown as AiSettingsService,
      provider,
      new MemoryPending(),
      new MemoryAudit(),
      { search_projects: (async () => ({ found: 0 })) as unknown as AiToolExecutor },
      conversations,
      new MemoryAutoApprovals(),
    );

    await service.chat(person(["ai.use", "projects.read"]), { message: "dig" });

    expect(seen[0]).toContain("Step 1 of 3");
    expect(seen[0]).toContain("2 steps left");
    // The final turn is told it is final, in as many words.
    expect(seen[seen.length - 1]).toMatch(/last step/iu);
  });

  /*
   * Handing a model the means to call a tool while telling it it must answer
   * invites the call that gets cut off. The ability is withdrawn, not merely
   * discouraged.
   */
  it("offers no tools at all on the final step", async () => {
    const toolCounts: number[] = [];
    const conversations = new MemoryConversations();
    const provider: AiProviderClient = {
      async complete(request: ProviderRequest) {
        toolCounts.push((request.tools ?? []).length);
        if ((request.tools ?? []).length === 0) return { content: "final", toolCalls: [] };
        return { content: "", toolCalls: [toolCall("search_projects", { query: "a" })] };
      },
    };
    const service = new AiService(
      { resolveProvider: async () => ({ baseUrl: "https://p.test", model: "m", apiKey: "k", maxCycles: 2 }) } as unknown as AiSettingsService,
      provider,
      new MemoryPending(),
      new MemoryAudit(),
      { search_projects: (async () => ({ found: 0 })) as unknown as AiToolExecutor },
      conversations,
      new MemoryAutoApprovals(),
    );

    await service.chat(person(["ai.use", "projects.read"]), { message: "dig" });

    expect(toolCounts[0]).toBeGreaterThan(0);
    expect(toolCounts[toolCounts.length - 1]).toBe(0);
  });

  it("tells a continuing turn why it has room again", async () => {
    const conversations = new MemoryConversations();
    const seen: string[][] = [];
    const provider: AiProviderClient = {
      async complete(request: ProviderRequest) {
        seen.push(request.messages.filter((m) => m.role === "system").map((m) => String(m.content)));
        return { content: "ok", toolCalls: [] };
      },
    };
    const service = new AiService(
      { resolveProvider: async () => ({ baseUrl: "https://p.test", model: "m", apiKey: "k" }) } as unknown as AiSettingsService,
      provider,
      new MemoryPending(),
      new MemoryAudit(),
      {},
      conversations,
      new MemoryAutoApprovals(),
    );
    const actor = person(["ai.use"]);

    const first = await service.chat(actor, { message: "start" });
    await service.chat(actor, { conversationId: first.conversationId, message: "more", continue: true });

    expect(seen[0]?.join(" ")).not.toMatch(/keep going/iu);
    expect(seen[1]?.join(" ")).toMatch(/keep going/iu);
  });

  /*
   * The progress feed. Each event is a fact the harness knows — which cycle,
   * which tool, what came back — so nothing on the screen can be a claim the
   * model invented.
   */
  it("reports each step as it happens", async () => {
    const events: string[] = [];
    const { service } = build({
      replies: [
        { content: "", toolCalls: [toolCall("search_projects", { query: "Nile" })] },
        { content: "One match.", toolCalls: [] },
      ],
      executors: { search_projects: (async () => ({ found: 1 })) as unknown as AiToolExecutor },
    });

    await service.chat(
      person(["ai.use", "projects.read"]),
      { message: "find Nile" },
      (event) => events.push(event.type),
    );

    expect(events).toContain("cycle");
    expect(events).toContain("tool");
    expect(events).toContain("observation");
    // The answer is the last thing said, always.
    expect(events[events.length - 1]).toBe("answer");
  });

  it("names the tool and what came back, not what the model claimed", async () => {
    const events: Array<Record<string, unknown>> = [];
    const { service } = build({
      replies: [
        { content: "I will look.", toolCalls: [toolCall("search_projects", { query: "Nile" })] },
        { content: "Nothing.", toolCalls: [] },
      ],
      executors: { search_projects: (async () => ({ found: 0 })) as unknown as AiToolExecutor },
    });

    await service.chat(
      person(["ai.use", "projects.read"]),
      { message: "find Nile" },
      (event) => events.push(event as unknown as Record<string, unknown>),
    );

    const tool = events.find((event) => event.type === "tool");
    expect(tool?.tool).toBe("search_projects");
    expect(tool?.arguments).toMatchObject({ query: "Nile" });

    const observation = events.find((event) => event.type === "observation");
    expect(observation?.summary).toBe("nothing found");
  });
});

describe("approving changes", () => {
  const author = () => person(["ai.use", "tasks.create", "tasks.edit", "tasks.delete"]);

  /*
   * One instruction often means several changes. The loop used to return on the
   * first write, so "close these three" produced a card, then another turn,
   * then another card — three interruptions for one instruction, which is
   * exactly how an approval becomes a reflex.
   */
  it("gathers several changes from one turn instead of stopping at the first", async () => {
    const { service } = build({
      replies: [
        {
          content: "I can do all three.",
          toolCalls: [
            toolCall("create_task", { projectId, title: "Pour the slab" }),
            toolCall("create_task", { projectId, title: "Order rebar" }),
            toolCall("create_task", { projectId, title: "Book the crane" }),
          ],
        },
        { content: "Three tasks are waiting for your approval.", toolCalls: [] },
      ],
    });

    const result = await service.chat(author(), { message: "add three tasks" });

    expect(result.proposals).toHaveLength(3);
    expect(result.proposals?.map((entry) => entry.summary.title)).toEqual([
      "Pour the slab",
      "Order rebar",
      "Book the crane",
    ]);
  });

  it("approves a batch, and each one is still executed on its own", async () => {
    const created: string[] = [];
    const { service } = build({
      replies: [
        {
          content: "",
          toolCalls: [
            toolCall("create_task", { projectId, title: "One" }),
            toolCall("create_task", { projectId, title: "Two" }),
          ],
        },
        { content: "Waiting for you.", toolCalls: [] },
      ],
      executors: {
        create_task: (async (_actor: unknown, args: Record<string, unknown>) => {
          created.push(String(args.title));
          return { id: "t" };
        }) as unknown as AiToolExecutor,
      },
    });

    const actor = author();
    const proposed = await service.chat(actor, { message: "add two" });
    expect(created).toHaveLength(0);

    const ids = (proposed.proposals ?? []).map((entry) => entry.id);
    const outcome = await service.confirm(actor, { actionIds: ids });

    expect(created).toEqual(["One", "Two"]);
    expect(outcome.results.every((entry) => entry.ok)).toBe(true);
  });

  /*
   * A batch is a convenience for the person, not a relaxation of the rule. Each
   * action is re-read and re-authorised, so one that has expired or lost its
   * permission fails alone rather than taking the others with it.
   */
  it("carries out the rest when one of a batch cannot be done", async () => {
    const created: string[] = [];
    const { service } = build({
      replies: [
        {
          content: "",
          toolCalls: [
            toolCall("create_task", { projectId, title: "Good" }),
            toolCall("create_task", { projectId, title: "Also good" }),
          ],
        },
        { content: "Waiting.", toolCalls: [] },
      ],
      executors: {
        create_task: (async (_actor: unknown, args: Record<string, unknown>) => {
          created.push(String(args.title));
          return { id: "t" };
        }) as unknown as AiToolExecutor,
      },
    });

    const actor = author();
    const proposed = await service.chat(actor, { message: "add two" });
    const ids = (proposed.proposals ?? []).map((entry) => entry.id);

    const outcome = await service.confirm(actor, {
      // A real id and one that was never proposed.
      actionIds: [ids[0]!, "99999999-9999-4999-8999-999999999999"],
    });

    expect(created).toEqual(["Good"]);
    expect(outcome.results.filter((entry) => entry.ok)).toHaveLength(1);
    expect(outcome.results.filter((entry) => !entry.ok)).toHaveLength(1);
  });
});

describe("not being asked again", () => {
  const author = () => person(["ai.use", "tasks.create", "tasks.edit", "tasks.delete"]);

  it("runs a pre-approved change without asking, and says that it did", async () => {
    const created: string[] = [];
    const autoApprovals = new MemoryAutoApprovals();
    await autoApprovals.grant(tenantId, userId, "create_task");

    const { service } = build({
      replies: [
        { content: "", toolCalls: [toolCall("create_task", { projectId, title: "Pour" })] },
        { content: "Added it.", toolCalls: [] },
      ],
      executors: {
        create_task: (async (_actor: unknown, args: Record<string, unknown>) => {
          created.push(String(args.title));
          return { id: "t" };
        }) as unknown as AiToolExecutor,
      },
      autoApprovals,
    });

    const result = await service.chat(author(), { message: "add a task" });

    expect(created).toEqual(["Pour"]);
    // Nothing waiting, and the answer reports what happened — an auto-approved
    // action that is invisible is indistinguishable from an agent acting alone.
    expect(result.proposals).toBeUndefined();
    expect(result.performed).toEqual([
      { tool: "create_task", summary: { projectId, title: "Pour" } },
    ]);
  });

  /*
   * The rule the whole tiered design rests on. A blanket "never ask again" over
   * deletions is the switch behind most published agent incidents; the remedy
   * the research agrees on is to make that class unsilenceable rather than to
   * warn about it.
   */
  it("refuses to stop asking about anything irreversible", async () => {
    const { service } = build({ replies: [] });

    await expect(
      service.grantAutoApproval(author(), { tool: "delete_task" }),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
  });

  it("still asks about a destructive tool even if the row somehow exists", async () => {
    const autoApprovals = new MemoryAutoApprovals();
    // Written straight to storage, bypassing the service that would refuse it.
    await autoApprovals.grant(tenantId, userId, "delete_task");

    const deleted: string[] = [];
    const { service } = build({
      replies: [
        { content: "", toolCalls: [toolCall("delete_task", { taskId: projectId })] },
        { content: "Waiting.", toolCalls: [] },
      ],
      executors: {
        delete_task: (async (_actor: unknown, args: Record<string, unknown>) => {
          deleted.push(String(args.taskId));
          return { deleted: true };
        }) as unknown as AiToolExecutor,
      },
      autoApprovals,
    });

    const result = await service.chat(author(), { message: "delete it" });

    expect(deleted).toHaveLength(0);
    expect(result.proposals).toHaveLength(1);
    expect(result.proposals?.[0]?.destructive).toBe(true);
  });

  it("refuses a preference for a tool the person may not use", async () => {
    const { service } = build({ replies: [] });
    // Holds ai.use but not tasks.create.
    await expect(
      service.grantAutoApproval(person(["ai.use"]), { tool: "create_task" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("lets somebody start being asked again", async () => {
    const autoApprovals = new MemoryAutoApprovals();
    const { service } = build({ replies: [], autoApprovals });
    const actor = author();

    await service.grantAutoApproval(actor, { tool: "create_task" });
    expect((await service.listAutoApprovals(actor)).tools).toEqual(["create_task"]);

    await service.revokeAutoApproval(actor, { tool: "create_task" });
    expect((await service.listAutoApprovals(actor)).tools).toEqual([]);
  });

  it("keeps one person's preferences away from another's", async () => {
    const autoApprovals = new MemoryAutoApprovals();
    const { service } = build({ replies: [], autoApprovals });
    const owner = author();
    const colleague: UserPrincipal = { ...owner, userId: "44444444-4444-4444-8444-444444444444" };

    await service.grantAutoApproval(owner, { tool: "create_task" });

    expect((await service.listAutoApprovals(colleague)).tools).toEqual([]);
  });
});
