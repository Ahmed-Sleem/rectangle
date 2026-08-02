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

function build(options: {
  replies: ProviderReply[];
  executors?: Record<string, AiToolExecutor>;
  pending?: MemoryPending;
  audit?: MemoryAudit;
  conversations?: MemoryConversations;
}) {
  const audit = options.audit ?? new MemoryAudit();
  const pending = options.pending ?? new MemoryPending();
  const conversations = options.conversations ?? new MemoryConversations();
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
  );
  return { service, audit, pending, provider, conversations };
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
    expect(result.answer).toMatch(/could not work that out/iu);
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
    expect(result.proposal?.tool).toBe("create_task");
    expect(result.proposal?.summary).toMatchObject({ title: "Pour slab" });
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
    await service.confirm(author, { actionId: proposed.proposal!.id });

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
      actionId: proposed.proposal!.id,
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
    await service.confirm(author, { actionId: proposed.proposal!.id });
    await expect(service.confirm(author, { actionId: proposed.proposal!.id })).rejects.toMatchObject(
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
      service.confirm(someoneElse, { actionId: proposed.proposal!.id }),
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
      service.confirm(demoted, { actionId: proposed.proposal!.id }),
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
    await service.confirm(author, { actionId: proposed.proposal!.id });

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
    );

    const result = await service.chat(person(["ai.use", "projects.read"]), { message: "round and round" });

    expect(result.answer).toContain("could not work that out");
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
