/**
 * Guards who may read the audit trail.
 *
 * The trail was previously readable in full by anyone holding `projects.read`,
 * which is everyone: new hires and their email addresses, failed sign-ins,
 * disabled accounts, the mail server, and work on projects the reader had been
 * deliberately excluded from. These tests exercise the real SQL builder against
 * a fake pool, because the service tests mock the repository and would not have
 * caught the original fault either.
 */
import { describe, expect, it } from "vitest";
import { ActivityService, availableScopes } from "../src/application/activity-service.js";
import { classifyActivity, redactMetadata } from "../src/domain/activity.js";
import { PostgresActivityRepository } from "../src/infrastructure/postgres/activity-repository.js";
import { parseActivityQuery, resolvePresetRange } from "../src/domain/activity.js";
import type { UserPrincipal } from "../src/domain/auth.js";

const tenantId = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";

const viewer: UserPrincipal = { tenantId, userId, roles: ["none"], permissions: [] };
const admin: UserPrincipal = { tenantId, userId, roles: ["owner"], permissions: [] };

interface Captured {
  sql: string;
  values: unknown[];
}

function fakePool(captured: Captured[], rows: Array<Record<string, unknown>> = []) {
  return {
    async query(sql: string, values: unknown[]) {
      captured.push({ sql, values });
      return { rows, rowCount: rows.length };
    },
  } as never;
}

function placeholderCount(sql: string): number {
  const used = new Set([...sql.matchAll(/\$(\d+)/gu)].map((match) => Number(match[1])));
  return used.size === 0 ? 0 : Math.max(...used);
}

describe("activity sensitivity", () => {
  it("classifies work, account, security and administration apart", () => {
    expect(classifyActivity("project.update")).toBe("operational");
    expect(classifyActivity("task.create")).toBe("operational");
    expect(classifyActivity("risk.delete")).toBe("operational");
    expect(classifyActivity("auth.login_failed")).toBe("security");
    expect(classifyActivity("profile.password_change")).toBe("personal");
    expect(classifyActivity("user.email_changed")).toBe("personal");
    expect(classifyActivity("user.create")).toBe("administrative");
    expect(classifyActivity("user_type.update")).toBe("administrative");
    expect(classifyActivity("email_settings.update")).toBe("administrative");
  });

  /*
   * The assistant acts as a person, so what it did is that person's own record.
   * Unclassified these fell through to `administrative`, meaning administrators
   * only — somebody could not see the actions their own assistant had taken for
   * them. The approval design rests on every action being visible to whoever
   * approved it, or agreed in advance not to be asked, so hiding them from the
   * principal defeated the point of recording them.
   */
  it("shows a person what their own assistant did", () => {
    expect(classifyActivity("ai.action.confirm")).toBe("personal");
    expect(classifyActivity("ai.action.auto")).toBe("personal");
    expect(classifyActivity("ai.auto_approval.grant")).toBe("personal");
    expect(classifyActivity("ai.conversation.delete")).toBe("personal");
  });

  /*
   * The work the assistant does is still filed as work. Creating a task through
   * it writes `task.create`, which stays operational and visible with the
   * record; only the assistant's own affairs are personal.
   */
  it("still files the work itself as work, whoever asked for it", () => {
    expect(classifyActivity("task.create")).toBe("operational");
  });

  it("treats an unrecognised action as administrative rather than public", () => {
    // Failing closed is the only safe default for a value that decides who may
    // read the row. A new action added without a decision must not leak.
    expect(classifyActivity("something.brand_new")).toBe("administrative");
  });
});

describe("activity metadata redaction", () => {
  it("removes the addresses and hosts that made the trail a directory leak", () => {
    const metadata = { email: "newhire@example.com", userTypeIds: ["a"], invited: true };
    expect(redactMetadata(metadata, false)).toEqual({ userTypeIds: ["a"], invited: true });
    expect(redactMetadata(metadata, true)).toEqual(metadata);
  });

  it("removes mail server details", () => {
    const metadata = { host: "smtp.example.com", recipientEmail: "a@b.co", enabled: true };
    expect(redactMetadata(metadata, false)).toEqual({ enabled: true });
  });
});

describe("activity scopes offered", () => {
  it("offers only self to an ordinary user", () => {
    expect(availableScopes(viewer)).toEqual(["self"]);
  });

  it("offers everything to an administrator", () => {
    expect(availableScopes(admin)).toEqual(["self", "team", "all"]);
  });

  it("refuses a scope the caller was not offered", async () => {
    const repository = new PostgresActivityRepository(fakePool([]));
    const service = new ActivityService(repository);

    await expect(service.list(viewer, { scope: "all" })).rejects.toThrow(/permission/iu);
  });

  it("lets an administrator read the whole tenant", async () => {
    const captured: Captured[] = [];
    const service = new ActivityService(new PostgresActivityRepository(fakePool(captured)));

    await service.list(admin, { scope: "all" });

    const { sql } = captured[0]!;
    // No membership predicate: an administrator is allowed everything.
    expect(sql).not.toContain("project_members");
  });
});

describe("activity SQL", () => {
  it("restricts an ordinary user to their own actions and their own projects", async () => {
    const captured: Captured[] = [];
    const repository = new PostgresActivityRepository(fakePool(captured));

    await repository.list({
      tenantId,
      userId,
      scope: "self",
      query: parseActivityQuery({}),
    });

    const { sql } = captured[0]!;
    expect(sql).toContain("a.actor_user_id = $2");
    // Work on projects they belong to — and only operational entries, so a
    // colleague's password change never appears via a shared project.
    expect(sql).toContain("project_members");
    expect(sql).toContain("a.sensitivity = 'operational'");
    expect(sql).toContain("m.tenant_id = a.tenant_id");
  });

  it("shows a member only their own actions on a project they do not run", async () => {
    const captured: Captured[] = [];
    const repository = new PostgresActivityRepository(fakePool(captured));

    await repository.list({ tenantId, userId, scope: "self", query: parseActivityQuery({}) });

    const { sql } = captured[0]!;
    // Being on a job does not entitle you to a colleague's history there;
    // running it does. Without this clause a junior saw every action their
    // colleagues took on every project they were added to.
    expect(sql).toContain("m.role in ('owner', 'manager')");
  });

  it("never lets the team scope reach personal or security entries", async () => {
    const captured: Captured[] = [];
    const repository = new PostgresActivityRepository(fakePool(captured));

    await repository.list({
      tenantId,
      userId,
      scope: "team",
      query: parseActivityQuery({}),
    });

    const { sql } = captured[0]!;
    expect(sql).toContain("a.sensitivity = 'operational'");
  });

  it("binds exactly the parameters it references, for every filter combination", async () => {
    const combinations = [
      {},
      { action: "project.update" },
      { entityType: "project" },
      { result: "success" as const },
      { from: "2026-01-01", to: "2026-02-01" },
      { projectId: "33333333-3333-4333-8333-333333333333" },
      { actorUserId: userId },
      {
        action: "task.create",
        entityType: "task",
        result: "failure" as const,
        from: "2026-01-01",
        to: "2026-02-01",
        projectId: "33333333-3333-4333-8333-333333333333",
        actorUserId: userId,
      },
    ];

    for (const extra of combinations) {
      const captured: Captured[] = [];
      const repository = new PostgresActivityRepository(fakePool(captured));

      await repository.list({
        tenantId,
        userId,
        scope: "self",
        query: parseActivityQuery(extra),
      });

      const { sql, values } = captured[0]!;
      expect(placeholderCount(sql)).toBe(values.length);
    }
  });

  it("always scopes to the tenant, whatever else is asked for", async () => {
    const captured: Captured[] = [];
    const repository = new PostgresActivityRepository(fakePool(captured));

    await repository.list({ tenantId, userId, scope: "all", query: parseActivityQuery({}) });

    expect(captured[0]!.sql).toContain("a.tenant_id = $1");
    expect(captured[0]!.values[0]).toBe(tenantId);
  });

  it("includes the whole of the end day when a date range is given", async () => {
    const captured: Captured[] = [];
    const repository = new PostgresActivityRepository(fakePool(captured));

    await repository.list({
      tenantId,
      userId,
      scope: "all",
      query: parseActivityQuery({ to: "2026-02-01" }),
    });

    // Filtering "to the 1st" must include the 1st, or a person searching a
    // single day gets nothing.
    expect(captured[0]!.sql).toContain("interval '1 day'");
  });
});

describe("the project workspace feed", () => {
  it("shows work on the project and nothing about the people doing it", async () => {
    const captured: Captured[] = [];
    const { PostgresProjectTeamRepository } = await import(
      "../src/infrastructure/postgres/project-team-repository.js"
    );
    const repository = new PostgresProjectTeamRepository(fakePool(captured));

    await repository.listActivity(tenantId, "33333333-3333-4333-8333-333333333333", 20);

    const { sql } = captured[0]!;
    // Access to a project entitles the caller to its work, not to a
    // colleague's sign-in or account history.
    expect(sql).toContain("a.sensitivity = 'operational'");
    expect(sql).toContain("a.tenant_id = $1");
  });
});

describe("activity date presets", () => {
  it("resolves each preset on the server, not in the browser", () => {
    const now = new Date("2026-02-11T10:00:00.000Z"); // a Wednesday

    expect(resolvePresetRange("today", now)).toEqual({ from: "2026-02-11", to: "2026-02-11" });
    // Monday-based: a construction week is planned from Monday, and Sunday
    // reading as the start surprises everybody who uses it.
    expect(resolvePresetRange("week", now)).toEqual({ from: "2026-02-09", to: "2026-02-11" });
    expect(resolvePresetRange("month", now)).toEqual({ from: "2026-01-13", to: "2026-02-11" });
  });

  it("leaves custom alone so supplied dates survive", () => {
    expect(resolvePresetRange("custom", new Date("2026-02-11T10:00:00.000Z"))).toEqual({});
  });

  it("lets the preset override dates that came with it", () => {
    const query = parseActivityQuery({ preset: "today", from: "2020-01-01", to: "2020-01-02" });
    // Otherwise a stale date left in a URL would silently contradict the
    // range control the reader is looking at.
    expect(query.from).not.toBe("2020-01-01");
    expect(query.from).toBe(query.to);
  });

  it("honours explicit dates when the preset is custom", () => {
    const query = parseActivityQuery({ preset: "custom", from: "2026-01-01", to: "2026-01-31" });
    expect(query.from).toBe("2026-01-01");
    expect(query.to).toBe("2026-01-31");
  });
});

describe("activity summary", () => {
  it("counts over the same predicate as the list", async () => {
    const listCaptured: Captured[] = [];
    const summaryCaptured: Captured[] = [];
    const query = parseActivityQuery({ result: "failure" });

    await new PostgresActivityRepository(fakePool(listCaptured))
      .list({ tenantId, userId, scope: "self", query });
    await new PostgresActivityRepository(fakePool(summaryCaptured))
      .summarise({ tenantId, userId, scope: "self", query });

    /*
     * The figures must describe the rows beneath them. Sharing the predicate is
     * what makes that true; two independently built clauses would drift the
     * first time a filter was added to one and not the other.
     */
    const listWhere = listCaptured[0]!.sql.slice(listCaptured[0]!.sql.indexOf("where"));
    expect(summaryCaptured[0]!.sql).toContain("a.result =");
    expect(listWhere).toContain("a.result =");
    expect(summaryCaptured[0]!.sql).toContain("project_members");
  });

  it("computes every breakdown over the caller's own predicate", async () => {
    const captured: Captured[] = [];
    await new PostgresActivityRepository(fakePool(captured)).summarise({
      tenantId, userId, scope: "self", query: parseActivityQuery({}),
    });

    /*
     * The panels rank what the caller can already reach, never the company. A
     * member must not learn who the busiest people are, or which projects are
     * active, by reading a leaderboard computed over rows they cannot open.
     */
    const { sql } = captured[0]!;
    const scoped = sql.slice(sql.indexOf("with scoped"), sql.indexOf("days as"));
    expect(scoped).toContain("project_members");
    expect(scoped).toContain("m.role in ('owner', 'manager')");
    // Every tally reads from `scoped`, not from audit_events directly.
    const tallies = sql.slice(sql.indexOf("actors as"));
    expect(tallies).not.toContain("from audit_events");
  });

  it("searches the actor, the action and the project", async () => {
    const captured: Captured[] = [];
    await new PostgresActivityRepository(fakePool(captured)).list({
      tenantId, userId, scope: "all", query: parseActivityQuery({ search: "metro" }),
    });

    /*
     * All three fields a row shows, matched through the shared engine rather
     * than `ilike '%term%'` — which could not use an index and ranked nothing.
     * Asserted on the fields being searched rather than on the operator, so
     * this keeps meaning the same thing if the engine changes again.
     */
    const { sql } = captured[0]!;
    expect(sql).toContain("u.display_name");
    expect(sql).toContain("a.action");
    expect(sql).toContain("p.name");
    expect(sql).toContain("websearch_to_tsquery");
    expect(sql).not.toMatch(/ilike/iu);
  });

  it("binds exactly the parameters the summary references", async () => {
    const captured: Captured[] = [];
    await new PostgresActivityRepository(fakePool(captured)).summarise({
      tenantId,
      userId,
      scope: "self",
      query: parseActivityQuery({ result: "success", action: "task.create" }),
    });

    const { sql, values } = captured[0]!;
    expect(placeholderCount(sql)).toBe(values.length);
  });

  it("reports no busiest day when the range holds nothing", async () => {
    const repository = new PostgresActivityRepository(
      fakePool([], [{ total: "0", failures: "0", people: "0", busiest_day: null, busiest_count: null }]),
    );

    const summary = await repository.summarise({
      tenantId, userId, scope: "all", query: parseActivityQuery({}),
    });

    // Absent rather than a zero day, which would be a claim about a date.
    expect(summary.busiestDay).toBeUndefined();
    expect(summary.total).toBe(0);
  });
});

describe("activity paging", () => {
  const row = {
    id: "44444444-4444-4444-8444-444444444444",
    action: "project.update",
    entity_type: "project",
    entity_id: "55555555-5555-4555-8555-555555555555",
    result: "success" as const,
    sensitivity: "operational" as const,
    actor_user_id: userId,
    actor_name: "Mona Adel",
    project_id: "55555555-5555-4555-8555-555555555555",
    project_name: "Cairo Metro",
    metadata: {},
    created_at: new Date("2026-02-01T10:00:00.000Z"),
  };

  it("offers a cursor only when there is another page", async () => {
    const one = new PostgresActivityRepository(fakePool([], [row]));
    const short = await one.list({ tenantId, userId, scope: "all", query: parseActivityQuery({ limit: 1 }) });
    expect(short.nextCursor).toBeUndefined();

    // Two rows returned for a limit of one means a further page exists.
    const two = new PostgresActivityRepository(fakePool([], [row, { ...row, id: "66666666-6666-4666-8666-666666666666" }]));
    const paged = await two.list({ tenantId, userId, scope: "all", query: parseActivityQuery({ limit: 1 }) });
    expect(paged.entries).toHaveLength(1);
    expect(paged.nextCursor).toBeTypeOf("string");
  });

  it("rejects a malformed page reference instead of ignoring it", () => {
    expect(() => parseActivityQuery({ cursor: "x".repeat(300) })).toThrow();
  });

  it("pages by keyset so a busy trail does not repeat or skip rows", async () => {
    const captured: Captured[] = [];
    const repository = new PostgresActivityRepository(fakePool(captured, [row, row]));
    const first = await repository.list({ tenantId, userId, scope: "all", query: parseActivityQuery({ limit: 1 }) });

    const next: Captured[] = [];
    const second = new PostgresActivityRepository(fakePool(next));
    await second.list({
      tenantId,
      userId,
      scope: "all",
      query: parseActivityQuery({ limit: 1, cursor: first.nextCursor }),
    });

    // A comparison against the last row read, not an offset.
    expect(next[0]!.sql).toContain("(a.created_at, a.id) <");
    expect(next[0]!.sql).not.toMatch(/offset/iu);
  });
});
