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
import { AiService, type AiPendingActionRepository, type AiToolExecutor } from "../src/application/ai-service.js";
import type { AiSettingsService } from "../src/application/ai-settings-service.js";
import type { AiProviderClient, ProviderReply, ProviderRequest } from "../src/infrastructure/ai-provider.js";
import type { AuditEventInput, AuditRepository } from "../src/application/project-service.js";
import type { UserPrincipal } from "../src/domain/auth.js";

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

function build(options: {
  replies: ProviderReply[];
  executors?: Record<string, AiToolExecutor>;
  pending?: MemoryPending;
  audit?: MemoryAudit;
}) {
  const audit = options.audit ?? new MemoryAudit();
  const pending = options.pending ?? new MemoryPending();
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
  );
  return { service, audit, pending, provider };
}

describe("who may use the assistant at all", () => {
  it("refuses somebody without the permission", async () => {
    const { service } = build({ replies: [] });
    await expect(service.chat(person([]), { messages: [{ role: "user", content: "hello" }] }))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("the model asking for tools", () => {
  it("answers directly when it needs none", async () => {
    const { service } = build({ replies: [{ content: "Two projects are active.", toolCalls: [] }] });

    const result = await service.chat(person(["ai.use"]), {
      messages: [{ role: "user", content: "how many projects" }],
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
      messages: [{ role: "user", content: "find Nile" }],
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
      messages: [{ role: "user", content: "hi" }],
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
      messages: [{ role: "user", content: "delete it all" }],
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
      messages: [{ role: "user", content: "any risks?" }],
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
    );

    await service.chat(revoking, { messages: [{ role: "user", content: "any risks?" }] });

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
      messages: [{ role: "user", content: "search" }],
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
      messages: [{ role: "user", content: "find a" }],
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
      messages: [{ role: "user", content: "loop" }],
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
      messages: [{ role: "user", content: "add a task to pour the slab" }],
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
      messages: [{ role: "user", content: "add it" }],
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

    const proposed = await service.chat(author, { messages: [{ role: "user", content: "add" }] });
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

    const proposed = await service.chat(author, { messages: [{ role: "user", content: "add" }] });
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

    const proposed = await service.chat(author, { messages: [{ role: "user", content: "add" }] });

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

    const proposed = await service.chat(author, { messages: [{ role: "user", content: "add" }] });

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

    const proposed = await service.chat(author, { messages: [{ role: "user", content: "add" }] });
    await service.confirm(author, { actionId: proposed.proposal!.id });

    const actions = audit.events.map((event) => event.action);
    expect(actions).toContain("ai.action.propose");
    expect(actions).toContain("ai.action.confirm");
  });
});
