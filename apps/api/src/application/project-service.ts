/**
 * ProjectService is the authoritative use-case layer for Projects. HTTP routes
 * and future AI tools must call this service instead of bypassing validation,
 * authorization, tenant ownership, or audit logging.
 */
import { canReachAllProjects, requirePermission, requireProjectRead, type UserPrincipal } from "../domain/auth.js";
import { DomainError } from "../domain/errors.js";
import {
  parseCreateProjectInput,
  parseProjectId,
  parseProjectListQuery,
  parseUpdateProjectInput,
  type CreateProjectInput,
  type ProjectListQuery,
  type ProjectRecord,
  type UpdateProjectInput,
} from "../domain/project.js";
import type { ProjectTeamService } from "./project-team-service.js";

export interface AuditEventInput {
  tenantId: string;
  /** Null when nobody could be identified, e.g. a sign-in against an unknown address. */
  actorUserId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  result: "success" | "failure";
  metadata?: Record<string, unknown>;
}

export interface AuditRepository {
  append(event: AuditEventInput): Promise<void>;
}

export interface ProjectsRepository {
  deleteForTenant(tenantId: string, id: string): Promise<boolean>;
  /** Also enrols the creator as project administrator, in one transaction. */
  create(tenantId: string, input: CreateProjectInput, creatorUserId: string): Promise<ProjectRecord>;
  findByTenantAndCode(tenantId: string, code: string): Promise<ProjectRecord | null>;
  findByIdForTenant(tenantId: string, id: string): Promise<ProjectRecord | null>;
  listForTenant(tenantId: string, query: ProjectListQuery): Promise<ProjectRecord[]>;
  updateForTenant(tenantId: string, id: string, input: UpdateProjectInput): Promise<ProjectRecord | null>;
}

export class ProjectService {
  constructor(
    private readonly projects: ProjectsRepository,
    private readonly audit: AuditRepository,
    /*
     * Editing and deleting are decided per project, not company-wide, so this
     * service has to ask who can reach the record in front of it. Only the
     * narrow slice it needs is depended on, so the two services stay testable
     * apart from each other.
     */
    private readonly projectTeam: Pick<
      ProjectTeamService,
      "requireProjectCapability" | "requireProjectDeletion"
    >,
  ) {}

  async createProject(actor: UserPrincipal, rawInput: unknown): Promise<ProjectRecord> {
    /*
     * Starting a project is a company-wide act: there is no project to be a
     * member of yet, so this is the one project action membership cannot gate.
     * The repository then enrols the creator as its administrator, or they
     * would be locked out of the thing they just made.
     */
    requirePermission(actor, "projects.create");
    const input = parseCreateProjectInput(rawInput);
    const existing = await this.projects.findByTenantAndCode(actor.tenantId, input.code);
    if (existing) {
      throw new DomainError("CONFLICT", "A project with this code already exists.", { code: input.code });
    }

    const project = await this.projects.create(actor.tenantId, input, actor.userId);
    await this.audit.append({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: "project.create",
      entityType: "project",
      entityId: project.id,
      result: "success",
      metadata: { code: project.code, status: project.status },
    });
    return project;
  }

  async listProjects(actor: UserPrincipal, rawQuery: unknown): Promise<ProjectRecord[]> {
    requireProjectRead(actor);
    const query = parseProjectListQuery(rawQuery);
    return this.projects.listForTenant(actor.tenantId, query);
  }

  async getProject(actor: UserPrincipal, rawProjectId: unknown): Promise<ProjectRecord> {
    requireProjectRead(actor);
    const projectId = parseProjectId(rawProjectId);
    const project = await this.projects.findByIdForTenant(actor.tenantId, projectId);
    if (!project) {
      throw new DomainError("NOT_FOUND", "Project was not found.");
    }
    return project;
  }

  async updateProject(actor: UserPrincipal, rawProjectId: unknown, rawInput: unknown): Promise<ProjectRecord> {
    const projectId = parseProjectId(rawProjectId);
    const input = parseUpdateProjectInput(rawInput);

    /*
     * Archiving is a smaller act than editing and is deliberately governed
     * separately, so a company can let a site team close out its own work
     * without also letting it rewrite the contract details. A change that only
     * moves the status to archived asks for the archive permission; anything
     * else, including archiving as part of a wider edit, asks to edit.
     */
    const onlyArchiving =
      Object.keys(input).length === 1 && input.status === "archived";
    await this.projectTeam.requireProjectCapability(
      actor,
      projectId,
      onlyArchiving ? "projects.archive" : "projects.edit",
    );

    if (input.code) {
      const existing = await this.projects.findByTenantAndCode(actor.tenantId, input.code);
      if (existing && existing.id !== projectId) {
        throw new DomainError("CONFLICT", "A project with this code already exists.", { code: input.code });
      }
    }

    const updated = await this.projects.updateForTenant(actor.tenantId, projectId, input);
    if (!updated) {
      throw new DomainError("NOT_FOUND", "Project was not found.");
    }

    await this.audit.append({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: "project.update",
      entityType: "project",
      entityId: updated.id,
      result: "success",
      metadata: {
        changedFields: Object.keys(input),
        reachedEveryProject: canReachAllProjects(actor),
      },
    });
    return updated;
  }

  /**
   * Permanently removes a project.
   *
   * Held to a stricter rule than every other project action: administering
   * that specific project, or the company. The head-office permission that
   * reaches every project is enough to edit one and deliberately not enough to
   * destroy one, because this takes the tasks, risks and history with it and
   * cannot be undone. Archiving is the reversible path and should be preferred;
   * this exists for records created in error. Related rows are removed by
   * cascading foreign keys, so the audit entry is written before the row goes.
   */
  async deleteProject(actor: UserPrincipal, rawProjectId: unknown): Promise<void> {
    const projectId = parseProjectId(rawProjectId);
    await this.projectTeam.requireProjectDeletion(actor, projectId);

    const existing = await this.projects.findByIdForTenant(actor.tenantId, projectId);
    if (!existing) {
      throw new DomainError("NOT_FOUND", "Project was not found.");
    }

    await this.audit.append({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: "project.delete",
      entityType: "project",
      entityId: projectId,
      result: "success",
      metadata: { code: existing.code, name: existing.name, status: existing.status },
    });

    const removed = await this.projects.deleteForTenant(actor.tenantId, projectId);
    if (!removed) {
      throw new DomainError("NOT_FOUND", "Project was not found.");
    }
  }
}
