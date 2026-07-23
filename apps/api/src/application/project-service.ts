/**
 * ProjectService is the authoritative use-case layer for Projects. HTTP routes
 * and future AI tools must call this service instead of bypassing validation,
 * authorization, tenant ownership, or audit logging.
 */
import { canManageProjects, requireProjectManagement, requireProjectRead, type UserPrincipal } from "../domain/auth.js";
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

export interface AuditEventInput {
  tenantId: string;
  actorUserId: string;
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
  create(tenantId: string, input: CreateProjectInput): Promise<ProjectRecord>;
  findByTenantAndCode(tenantId: string, code: string): Promise<ProjectRecord | null>;
  findByIdForTenant(tenantId: string, id: string): Promise<ProjectRecord | null>;
  listForTenant(tenantId: string, query: ProjectListQuery): Promise<ProjectRecord[]>;
  updateForTenant(tenantId: string, id: string, input: UpdateProjectInput): Promise<ProjectRecord | null>;
}

export class ProjectService {
  constructor(
    private readonly projects: ProjectsRepository,
    private readonly audit: AuditRepository,
  ) {}

  async createProject(actor: UserPrincipal, rawInput: unknown): Promise<ProjectRecord> {
    requireProjectManagement(actor);
    const input = parseCreateProjectInput(rawInput);
    const existing = await this.projects.findByTenantAndCode(actor.tenantId, input.code);
    if (existing) {
      throw new DomainError("CONFLICT", "A project with this code already exists.", { code: input.code });
    }

    const project = await this.projects.create(actor.tenantId, input);
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
    requireProjectManagement(actor);
    const projectId = parseProjectId(rawProjectId);
    const input = parseUpdateProjectInput(rawInput);

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
        canManageProjects: canManageProjects(actor),
      },
    });
    return updated;
  }
}
