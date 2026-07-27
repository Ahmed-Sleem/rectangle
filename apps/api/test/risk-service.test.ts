/** Tests risk authorization, scoring, transitions, and ownership rules. */
import { beforeEach, describe, expect, it } from "vitest";
import { RiskService, type RiskRepository } from "../src/application/risk-service.js";
import type { AuditEventInput, AuditRepository } from "../src/application/project-service.js";
import type { ProjectAccess } from "../src/application/project-team-service.js";
import type { UserPrincipal } from "../src/domain/auth.js";
import { DomainError } from "../src/domain/errors.js";
import {
  severityOf,
  type CreateRiskInput,
  type RiskListQuery,
  type RiskRecord,
  type RiskSummary,
  type UpdateRiskInput,
} from "../src/domain/risk.js";

const tenantId = "11111111-1111-4111-8111-111111111111";
const projectId = "33333333-3333-4333-8333-333333333333";
const adminUserId = "22222222-2222-4222-8222-222222222222";
const memberUserId = "44444444-4444-4444-8444-444444444444";
const outsiderUserId = "55555555-5555-4555-8555-555555555555";
const riskId = "66666666-6666-4666-8666-666666666666";
const taskOnProject = "77777777-7777-4777-8777-777777777777";
const taskElsewhere = "88888888-8888-4888-8888-888888888888";

const admin: UserPrincipal = { tenantId, userId: adminUserId, roles: ["admin"], permissions: [] };
const member: UserPrincipal = { tenantId, userId: memberUserId, roles: ["member"], permissions: [] };

class MemoryAudit implements AuditRepository {
  readonly events: AuditEventInput[] = [];
  async append(event: AuditEventInput): Promise<void> {
    this.events.push(event);
  }
}

function baseRisk(overrides: Partial<RiskRecord> = {}): RiskRecord {
  const probability = overrides.probability ?? 3;
  const impact = overrides.impact ?? 3;
  return {
    id: riskId,
    tenantId,
    projectId,
    projectName: "New Cairo Tower",
    projectCode: "NCT-01",
    kind: "risk",
    title: "Rebar delivery may slip",
    category: "schedule",
    probability,
    impact,
    score: probability * impact,
    severity: severityOf(probability * impact),
    status: "open",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

class MemoryRiskRepository implements RiskRepository {
  risks = new Map<string, RiskRecord>();
  members = new Set<string>([memberUserId, adminUserId]);
  projectTasks = new Set<string>([taskOnProject]);
  lastUpdate: { input: UpdateRiskInput; closure: { closedAt: string | null } | null } | null = null;
  listedForMemberProjects = false;

  seed(risk: RiskRecord): void {
    this.risks.set(risk.id, risk);
  }

  async create(
    createTenantId: string,
    createProjectId: string,
    _createdBy: string,
    input: CreateRiskInput,
  ): Promise<RiskRecord> {
    const risk = baseRisk({
      id: `risk-${this.risks.size + 1}`,
      tenantId: createTenantId,
      projectId: createProjectId,
      title: input.title,
      kind: input.kind,
      category: input.category,
      probability: input.probability,
      impact: input.impact,
      status: input.status,
      ...(input.ownerUserId ? { ownerUserId: input.ownerUserId } : {}),
      ...(input.mitigationTaskId ? { mitigationTaskId: input.mitigationTaskId } : {}),
    });
    this.risks.set(risk.id, risk);
    return risk;
  }

  async findById(findTenantId: string, findRiskId: string): Promise<RiskRecord | null> {
    const risk = this.risks.get(findRiskId);
    return risk && risk.tenantId === findTenantId ? risk : null;
  }

  async list(): Promise<RiskRecord[]> {
    return [...this.risks.values()];
  }

  async listForMemberProjects(
    _tenantId: string,
    _query: RiskListQuery,
    _callerUserId: string,
  ): Promise<RiskRecord[]> {
    this.listedForMemberProjects = true;
    return [];
  }

  async update(
    _tenantId: string,
    updateRiskId: string,
    input: UpdateRiskInput,
    closure: { closedAt: string | null } | null,
  ): Promise<RiskRecord | null> {
    const risk = this.risks.get(updateRiskId);
    if (!risk) return null;
    this.lastUpdate = { input, closure };

    const probability = input.probability ?? risk.probability;
    const impact = input.impact ?? risk.impact;
    const updated: RiskRecord = {
      ...risk,
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.title !== undefined ? { title: input.title } : {}),
      probability,
      impact,
      // Mirrors the generated column so severity stays derived, never stored.
      score: probability * impact,
      severity: severityOf(probability * impact),
      ...(closure?.closedAt ? { closedAt: closure.closedAt } : {}),
    };
    this.risks.set(updateRiskId, updated);
    return updated;
  }

  async remove(_tenantId: string, removeRiskId: string): Promise<boolean> {
    return this.risks.delete(removeRiskId);
  }

  async summarise(): Promise<RiskSummary> {
    return { total: 0, criticalOrHigh: 0, underReview: 0, closed: 0, occurred: 0, matrix: [], bySeverity: [], byCategory: [] };
  }

  async isProjectMember(_tenantId: string, _projectId: string, userId: string): Promise<boolean> {
    return this.members.has(userId);
  }

  async taskBelongsToProject(_t: string, _p: string, taskId: string): Promise<boolean> {
    return this.projectTasks.has(taskId);
  }
}

function accessStub(access: Partial<ProjectAccess> & { throws?: boolean } = {}) {
  return {
    async resolveAccess(): Promise<ProjectAccess> {
      if (access.throws) throw new DomainError("NOT_FOUND", "Project was not found.");
      return { canRead: access.canRead ?? true, canManage: access.canManage ?? true };
    },
  };
}

describe("severity banding", () => {
  it("derives severity from score rather than storing it", () => {
    // Stored beside the numbers that produce it, the two would drift.
    expect(severityOf(1 * 1)).toBe("low");
    expect(severityOf(2 * 3)).toBe("medium");
    expect(severityOf(3 * 4)).toBe("high");
    expect(severityOf(5 * 5)).toBe("critical");
  });

  it("puts each band boundary on the expected side", () => {
    expect(severityOf(4)).toBe("low");
    expect(severityOf(5)).toBe("medium");
    expect(severityOf(9)).toBe("medium");
    expect(severityOf(10)).toBe("high");
    expect(severityOf(14)).toBe("high");
    expect(severityOf(15)).toBe("critical");
  });
});

describe("RiskService", () => {
  let repository: MemoryRiskRepository;
  let audit: MemoryAudit;

  beforeEach(() => {
    repository = new MemoryRiskRepository();
    audit = new MemoryAudit();
  });

  it("refuses to add a risk to a project the caller cannot manage", async () => {
    const service = new RiskService(repository, accessStub({ canManage: false }), audit);
    await expect(
      service.createRisk(member, projectId, { title: "Scaffold collapse" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("refuses an owner who is not on the project", async () => {
    const service = new RiskService(repository, accessStub(), audit);
    await expect(
      service.createRisk(admin, projectId, { title: "Scaffold", ownerUserId: outsiderUserId }),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
  });

  it("refuses mitigation tracked on a different project", async () => {
    const service = new RiskService(repository, accessStub(), audit);
    await expect(
      service.createRisk(admin, projectId, { title: "Scaffold", mitigationTaskId: taskElsewhere }),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
  });

  it("accepts mitigation tracked on the same project", async () => {
    const service = new RiskService(repository, accessStub(), audit);
    const risk = await service.createRisk(admin, projectId, {
      title: "Scaffold",
      mitigationTaskId: taskOnProject,
    });
    expect(risk.mitigationTaskId).toBe(taskOnProject);
  });

  it("hides an entry on a project the caller cannot reach", async () => {
    repository.seed(baseRisk());
    const service = new RiskService(repository, accessStub({ throws: true }), audit);
    // NOT_FOUND rather than FORBIDDEN, so ids cannot be enumerated.
    await expect(service.getRisk(member, riskId)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("rejects a status move the workflow does not allow", async () => {
    repository.seed(baseRisk({ status: "closed" }));
    const service = new RiskService(repository, accessStub(), audit);
    // Closed work reopens for review; it does not jump straight to mitigating.
    await expect(service.updateRisk(admin, riskId, { status: "mitigating" })).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
    });
  });

  it("lets a live risk become an issue, because reality does not wait", async () => {
    repository.seed(baseRisk({ status: "assessing" }));
    const service = new RiskService(repository, accessStub(), audit);
    const updated = await service.updateRisk(admin, riskId, { status: "occurred" });
    expect(updated.status).toBe("occurred");
  });

  it("stamps closure when an entry settles and clears it when reopened", async () => {
    repository.seed(baseRisk({ status: "mitigating" }));
    const service = new RiskService(repository, accessStub(), audit);

    await service.updateRisk(admin, riskId, { status: "closed" });
    expect(repository.lastUpdate?.closure?.closedAt).toBeTruthy();

    await service.updateRisk(admin, riskId, { status: "open" });
    expect(repository.lastUpdate?.closure).toEqual({ closedAt: null });
  });

  it("records a rescored risk so the change can be explained later", async () => {
    repository.seed(baseRisk({ probability: 2, impact: 2 }));
    const service = new RiskService(repository, accessStub(), audit);

    await service.updateRisk(admin, riskId, { probability: 5, impact: 5 });

    const event = audit.events.find((entry) => entry.action === "risk.update");
    expect(event?.metadata).toMatchObject({ scoreFrom: 4, scoreTo: 25 });
  });

  it("lets an owner progress their own entry without managing the project", async () => {
    repository.seed(baseRisk({ ownerUserId: memberUserId }));
    const service = new RiskService(repository, accessStub({ canManage: false }), audit);
    const updated = await service.updateRisk(member, riskId, { status: "assessing" });
    expect(updated.status).toBe("assessing");
  });

  it("does not let an owner rescore their own entry", async () => {
    repository.seed(baseRisk({ ownerUserId: memberUserId }));
    const service = new RiskService(repository, accessStub({ canManage: false }), audit);
    // Reassessing exposure is an administrative judgement, not progress.
    await expect(service.updateRisk(member, riskId, { probability: 1 })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("writes the audit entry before deleting, since the row is about to vanish", async () => {
    repository.seed(baseRisk());
    const service = new RiskService(repository, accessStub(), audit);
    await service.deleteRisk(admin, riskId);
    expect(audit.events.some((event) => event.action === "risk.delete")).toBe(true);
    expect(repository.risks.has(riskId)).toBe(false);
  });

  it("restricts a portfolio-wide register to the caller's own projects", async () => {
    const service = new RiskService(repository, accessStub(), audit);
    await service.listRisks(member, {});
    expect(repository.listedForMemberProjects).toBe(true);
  });

  it("shows a tenant-wide manager every project's register", async () => {
    const service = new RiskService(repository, accessStub(), audit);
    await service.listRisks(admin, {});
    // Otherwise an administrator opens a project and finds its register empty.
    expect(repository.listedForMemberProjects).toBe(false);
  });

  it("refuses a residual exposure with no mitigation behind it", async () => {
    const service = new RiskService(repository, accessStub(), audit);
    await expect(
      service.createRisk(admin, projectId, {
        title: "Scaffold",
        residualProbability: 1,
        residualImpact: 1,
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
  });

  it("refuses a residual exposure worse than the original", async () => {
    const service = new RiskService(repository, accessStub(), audit);
    await expect(
      service.createRisk(admin, projectId, {
        title: "Scaffold",
        probability: 2,
        impact: 2,
        mitigation: "Order earlier",
        residualProbability: 5,
        residualImpact: 5,
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
  });
});
