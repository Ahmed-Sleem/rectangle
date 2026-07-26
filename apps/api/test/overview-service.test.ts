/** Tests authorization, tenant scoping, and block composition for Today. */
import { describe, expect, it } from "vitest";
import { OverviewService, type OverviewRepository } from "../src/application/overview-service.js";
import type { UserPrincipal } from "../src/domain/auth.js";
import { DomainError } from "../src/domain/errors.js";
import type {
  AttentionProject,
  BudgetTotal,
  OverviewActivityEntry,
  ProjectStatusCount,
  RiskExposure,
  TaskSummary,
  TeamSummary,
} from "../src/domain/overview.js";

const tenantId = "11111111-1111-4111-8111-111111111111";
const otherTenantId = "99999999-9999-4999-8999-999999999999";
const userId = "22222222-2222-4222-8222-222222222222";

const admin: UserPrincipal = { tenantId, userId, roles: ["tenant_admin"], permissions: [] };
const viewer: UserPrincipal = { tenantId, userId, roles: ["viewer"], permissions: [] };
const outsider: UserPrincipal = {
  tenantId,
  userId,
  roles: ["external_collaborator"],
  permissions: [],
};

class RecordingRepository implements OverviewRepository {
  readonly tenantIds: string[] = [];
  teamCalls = 0;
  lastTaskScope: "all" | "member" | null = null;
  lastHorizon = 0;
  lastAttentionLimit = 0;
  lastActivityLimit = 0;

  constructor(
    private readonly data: {
      statuses?: ProjectStatusCount[];
      budgets?: BudgetTotal[];
      attention?: AttentionProject[];
      activity?: OverviewActivityEntry[];
      team?: TeamSummary;
      tasks?: TaskSummary;
      risks?: RiskExposure;
    } = {},
  ) {}

  async countProjectsByStatus(id: string): Promise<ProjectStatusCount[]> {
    this.tenantIds.push(id);
    return this.data.statuses ?? [];
  }

  async sumBudgetsByCurrency(id: string): Promise<BudgetTotal[]> {
    this.tenantIds.push(id);
    return this.data.budgets ?? [];
  }

  async listProjectsNeedingAttention(
    id: string,
    horizonDays: number,
    limit: number,
  ): Promise<AttentionProject[]> {
    this.tenantIds.push(id);
    this.lastHorizon = horizonDays;
    this.lastAttentionLimit = limit;
    return this.data.attention ?? [];
  }

  async listRecentActivity(id: string, limit: number): Promise<OverviewActivityEntry[]> {
    this.tenantIds.push(id);
    this.lastActivityLimit = limit;
    return this.data.activity ?? [];
  }

  async summariseTasks(
    id: string,
    _userId: string,
    _horizonDays: number,
    scope: "all" | "member",
  ): Promise<TaskSummary> {
    this.tenantIds.push(id);
    this.lastTaskScope = scope;
    return this.data.tasks ?? { open: 0, overdue: 0, dueSoon: 0, assignedToMe: 0 };
  }

  async summariseRisks(id: string): Promise<RiskExposure> {
    this.tenantIds.push(id);
    return this.data.risks ?? { open: 0, criticalOrHigh: 0, occurred: 0 };
  }

  async countUsersByStatus(id: string): Promise<TeamSummary> {
    this.tenantIds.push(id);
    this.teamCalls += 1;
    return this.data.team ?? { activeUsers: 0, disabledUsers: 0 };
  }
}

describe("OverviewService", () => {
  it("refuses callers who cannot read projects", async () => {
    const service = new OverviewService(new RecordingRepository());
    await expect(service.getSummary(outsider, {})).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("reads only the caller's tenant", async () => {
    const repository = new RecordingRepository();
    const service = new OverviewService(repository);
    await service.getSummary(admin, {});
    expect(repository.tenantIds.every((id) => id === tenantId)).toBe(true);
    expect(repository.tenantIds).not.toContain(otherTenantId);
  });

  it("totals projects from the status rollup rather than a page of records", async () => {
    const repository = new RecordingRepository({
      statuses: [
        { status: "active", count: 7 },
        { status: "completed", count: 3 },
      ],
    });
    const summary = await new OverviewService(repository).getSummary(admin, {});
    expect(summary.totalProjects).toBe(10);
  });

  it("keeps budget currencies apart", async () => {
    const repository = new RecordingRepository({
      budgets: [
        { currency: "EGP", amount: "1500000.00", projectCount: 2 },
        { currency: "USD", amount: "90000.00", projectCount: 1 },
      ],
    });
    const summary = await new OverviewService(repository).getSummary(admin, {});
    expect(summary.budgets.map((entry) => entry.currency)).toEqual(["EGP", "USD"]);
  });

  it("omits the team block from users who may not read the user register", async () => {
    const repository = new RecordingRepository();
    const summary = await new OverviewService(repository).getSummary(viewer, {});
    expect(summary.team).toBeUndefined();
    expect(repository.teamCalls).toBe(0);
  });

  it("includes the team block for users who may read the user register", async () => {
    const repository = new RecordingRepository({ team: { activeUsers: 4, disabledUsers: 1 } });
    const summary = await new OverviewService(repository).getSummary(admin, {});
    expect(summary.team).toEqual({ activeUsers: 4, disabledUsers: 1 });
  });

  it("applies the default horizon and reports the one it used", async () => {
    const repository = new RecordingRepository();
    const summary = await new OverviewService(repository).getSummary(admin, {});
    expect(repository.lastHorizon).toBe(14);
    expect(summary.horizonDays).toBe(14);
  });

  it("honours a caller-supplied horizon", async () => {
    const repository = new RecordingRepository();
    const summary = await new OverviewService(repository).getSummary(admin, { horizonDays: "30" });
    expect(repository.lastHorizon).toBe(30);
    expect(summary.horizonDays).toBe(30);
  });

  it("rejects a horizon outside the supported range", async () => {
    const service = new OverviewService(new RecordingRepository());
    await expect(service.getSummary(admin, { horizonDays: 400 })).rejects.toBeInstanceOf(
      DomainError,
    );
    await expect(service.getSummary(admin, { horizonDays: 0 })).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
    });
  });

  it("bounds the activity and attention lists", async () => {
    const repository = new RecordingRepository();
    await new OverviewService(repository).getSummary(admin, {});
    expect(repository.lastActivityLimit).toBe(10);
    expect(repository.lastAttentionLimit).toBe(8);
    await expect(
      new OverviewService(repository).getSummary(admin, { activityLimit: 5000 }),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
  });

  it("counts the whole portfolio's work for a tenant-wide project reader", async () => {
    const repository = new RecordingRepository({
      tasks: { open: 12, overdue: 3, dueSoon: 4, assignedToMe: 2 },
    });
    const summary = await new OverviewService(repository).getSummary(admin, {});

    expect(repository.lastTaskScope).toBe("all");
    expect(summary.tasks).toEqual({ open: 12, overdue: 3, dueSoon: 4, assignedToMe: 2 });
  });

  it("counts only the caller's own projects when they are not a tenant-wide reader", async () => {
    const repository = new RecordingRepository();
    // A viewer may read the register but cannot manage any project, so their
    // work counts follow their memberships.
    await new OverviewService(repository).getSummary(viewer, {});

    expect(repository.lastTaskScope).toBe("member");
  });
});
