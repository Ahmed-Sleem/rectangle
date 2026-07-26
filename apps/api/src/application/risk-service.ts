/**
 * Use-case layer for the risk and issue register.
 *
 * Authorization is delegated to the project, exactly as tasks do: reaching a
 * risk means being able to reach the project it belongs to. A second copy of
 * that rule would drift from the first.
 */
import { canManageProjects, type UserPrincipal } from "../domain/auth.js";
import { DomainError } from "../domain/errors.js";
import { parseProjectId } from "../domain/project.js";
import {
  assertRiskTransition,
  isSettledRiskStatus,
  parseCreateRiskInput,
  parseRiskId,
  parseRiskListQuery,
  parseUpdateRiskInput,
  type CreateRiskInput,
  type RiskListQuery,
  type RiskRecord,
  type RiskSummary,
  type UpdateRiskInput,
} from "../domain/risk.js";
import type { AuditRepository } from "./project-service.js";
import type { ProjectTeamService } from "./project-team-service.js";

export interface RiskRepository {
  create(
    tenantId: string,
    projectId: string,
    createdByUserId: string,
    input: CreateRiskInput,
  ): Promise<RiskRecord>;
  findById(tenantId: string, riskId: string): Promise<RiskRecord | null>;
  list(tenantId: string, query: RiskListQuery, callerUserId: string): Promise<RiskRecord[]>;
  listForMemberProjects(
    tenantId: string,
    query: RiskListQuery,
    callerUserId: string,
  ): Promise<RiskRecord[]>;
  update(
    tenantId: string,
    riskId: string,
    input: UpdateRiskInput,
    closure: { closedAt: string | null } | null,
  ): Promise<RiskRecord | null>;
  remove(tenantId: string, riskId: string): Promise<boolean>;
  summarise(
    tenantId: string,
    projectId: string | undefined,
    callerUserId: string,
    scope: "all" | "member",
  ): Promise<RiskSummary>;
  isProjectMember(tenantId: string, projectId: string, userId: string): Promise<boolean>;
  taskBelongsToProject(tenantId: string, projectId: string, taskId: string): Promise<boolean>;
}

export class RiskService {
  constructor(
    private readonly risks: RiskRepository,
    private readonly projectTeam: Pick<ProjectTeamService, "resolveAccess">,
    private readonly audit: AuditRepository,
  ) {}

  /**
   * Resolves an entry and the caller's rights over it.
   *
   * Somebody who cannot reach the project is told the entry does not exist,
   * so the endpoint cannot be used to discover which ids are real.
   */
  private async loadRisk(
    actor: UserPrincipal,
    rawRiskId: unknown,
  ): Promise<{ risk: RiskRecord; canManage: boolean }> {
    const riskId = parseRiskId(rawRiskId);
    const risk = await this.risks.findById(actor.tenantId, riskId);
    if (!risk) throw new DomainError("NOT_FOUND", "Risk was not found.");

    const access = await this.projectTeam.resolveAccess(actor, risk.projectId).catch(() => null);
    if (!access?.canRead) throw new DomainError("NOT_FOUND", "Risk was not found.");

    return { risk, canManage: access.canManage };
  }

  /**
   * An owner has to be on the project.
   *
   * Naming an outsider produces an entry its owner cannot open, and quietly
   * exposes the project's risk register to somebody never added to it.
   */
  private async assertOwnerIsMember(
    tenantId: string,
    projectId: string,
    ownerUserId: string,
  ): Promise<void> {
    if (!(await this.risks.isProjectMember(tenantId, projectId, ownerUserId))) {
      throw new DomainError(
        "VALIDATION_FAILED",
        "That person is not a member of this project. Add them to the project team first.",
        { ownerUserId },
      );
    }
  }

  /**
   * Mitigation must be tracked on the same project.
   *
   * A risk treated by work on a different project is either a mistake or a
   * way to see across a boundary, and neither should be storable.
   */
  private async assertTaskIsOnProject(
    tenantId: string,
    projectId: string,
    taskId: string,
  ): Promise<void> {
    if (!(await this.risks.taskBelongsToProject(tenantId, projectId, taskId))) {
      throw new DomainError(
        "VALIDATION_FAILED",
        "That task belongs to a different project.",
        { taskId },
      );
    }
  }

  async createRisk(
    actor: UserPrincipal,
    rawProjectId: unknown,
    rawInput: unknown,
  ): Promise<RiskRecord> {
    const projectId = parseProjectId(rawProjectId);
    const access = await this.projectTeam.resolveAccess(actor, projectId);
    if (!access.canManage) {
      throw new DomainError("FORBIDDEN", "You do not have permission to add risks to this project.");
    }

    const input = parseCreateRiskInput(rawInput);
    if (input.ownerUserId) {
      await this.assertOwnerIsMember(actor.tenantId, projectId, input.ownerUserId);
    }
    if (input.mitigationTaskId) {
      await this.assertTaskIsOnProject(actor.tenantId, projectId, input.mitigationTaskId);
    }

    const risk = await this.risks.create(actor.tenantId, projectId, actor.userId, input);
    await this.audit.append({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: "risk.create",
      entityType: "risk",
      entityId: risk.id,
      result: "success",
      metadata: { projectId, kind: risk.kind, score: risk.score, status: risk.status },
    });
    return risk;
  }

  /**
   * Lists the register the caller may see.
   *
   * Same scope rule as tasks and search: a tenant-wide project manager reaches
   * every project, everyone else only their own, narrowed in SQL rather than
   * by discarding rows afterwards.
   */
  async listRisks(actor: UserPrincipal, rawQuery: unknown): Promise<RiskRecord[]> {
    const query = parseRiskListQuery(rawQuery);

    if (query.projectId) {
      const access = await this.projectTeam.resolveAccess(actor, query.projectId);
      if (!access.canRead) throw new DomainError("NOT_FOUND", "Project was not found.");
      return this.risks.list(actor.tenantId, query, actor.userId);
    }

    return canManageProjects(actor)
      ? this.risks.list(actor.tenantId, query, actor.userId)
      : this.risks.listForMemberProjects(actor.tenantId, query, actor.userId);
  }

  /** Headline counts and the 5×5 grid, scoped like the list. */
  async summarise(actor: UserPrincipal, rawProjectId?: unknown): Promise<RiskSummary> {
    const projectId = rawProjectId ? parseProjectId(rawProjectId) : undefined;

    if (projectId) {
      const access = await this.projectTeam.resolveAccess(actor, projectId);
      if (!access.canRead) throw new DomainError("NOT_FOUND", "Project was not found.");
    }

    return this.risks.summarise(
      actor.tenantId,
      projectId,
      actor.userId,
      canManageProjects(actor) ? "all" : "member",
    );
  }

  async getRisk(actor: UserPrincipal, rawRiskId: unknown): Promise<RiskRecord> {
    const { risk } = await this.loadRisk(actor, rawRiskId);
    return risk;
  }

  async updateRisk(
    actor: UserPrincipal,
    rawRiskId: unknown,
    rawInput: unknown,
  ): Promise<RiskRecord> {
    const { risk, canManage } = await this.loadRisk(actor, rawRiskId);
    const input = parseUpdateRiskInput(rawInput);

    // The owner may move their own entry along without administering the
    // project; reassessing or reassigning it is a different matter.
    const onlyStatusChange = Object.keys(input).length === 1 && input.status !== undefined;
    const isOwnRisk = risk.ownerUserId === actor.userId;
    if (!canManage && !(onlyStatusChange && isOwnRisk)) {
      throw new DomainError("FORBIDDEN", "You do not have permission to change this risk.");
    }

    if (input.status && input.status !== risk.status) {
      assertRiskTransition(risk.status, input.status);
    }
    if (input.ownerUserId) {
      await this.assertOwnerIsMember(actor.tenantId, risk.projectId, input.ownerUserId);
    }
    if (input.mitigationTaskId) {
      await this.assertTaskIsOnProject(actor.tenantId, risk.projectId, input.mitigationTaskId);
    }

    // Stored when the entry settles, so "when was this resolved" is a fact
    // rather than something reconstructed from the audit trail.
    let closure: { closedAt: string | null } | null = null;
    if (input.status && input.status !== risk.status) {
      closure = isSettledRiskStatus(input.status)
        ? { closedAt: new Date().toISOString() }
        : { closedAt: null };
    }

    const updated = await this.risks.update(actor.tenantId, risk.id, input, closure);
    if (!updated) throw new DomainError("NOT_FOUND", "Risk was not found.");

    await this.audit.append({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: "risk.update",
      entityType: "risk",
      entityId: updated.id,
      result: "success",
      metadata: {
        projectId: updated.projectId,
        changedFields: Object.keys(input),
        ...(input.status && input.status !== risk.status
          ? { statusFrom: risk.status, statusTo: input.status }
          : {}),
        ...(updated.score !== risk.score ? { scoreFrom: risk.score, scoreTo: updated.score } : {}),
      },
    });
    return updated;
  }

  async deleteRisk(actor: UserPrincipal, rawRiskId: unknown): Promise<void> {
    const { risk, canManage } = await this.loadRisk(actor, rawRiskId);
    if (!canManage) {
      throw new DomainError("FORBIDDEN", "You do not have permission to delete this risk.");
    }

    // Written first: once the row is gone this entry is the only record that
    // the risk was ever raised.
    await this.audit.append({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: "risk.delete",
      entityType: "risk",
      entityId: risk.id,
      result: "success",
      metadata: { projectId: risk.projectId, title: risk.title, score: risk.score },
    });

    const removed = await this.risks.remove(actor.tenantId, risk.id);
    if (!removed) throw new DomainError("NOT_FOUND", "Risk was not found.");
  }
}
