/**
 * Domain rules for the project team and stakeholder registers.
 *
 * Membership controls who can reach a project, so its validation lives here
 * beside the project rules rather than in transport or persistence code.
 */
import { z } from "zod";
import { DomainError } from "./errors.js";

/**
 * What somebody is on one project. Exactly four, and each is a different job.
 *
 * They are ordered by authority, and that order is load-bearing: appointing
 * somebody is refused unless the appointer outranks the appointment, so the
 * list is the rule rather than a display convenience.
 */
export const projectMemberRoleSchema = z.enum([
  /** Accountable for the project existing. May delete it and appoint anyone. */
  "owner",
  /** Runs the project. Everything inside it except deletion and appointments. */
  "manager",
  /** Does the work: tasks and risks. Manages nobody. */
  "member",
  /** Reads the project and changes nothing. */
  "viewer",
]);

export type ProjectMemberRole = z.infer<typeof projectMemberRoleSchema>;

/**
 * Authority, highest first. Position is compared, never the name.
 *
 * Encoding rank as an ordered list rather than as scattered comparisons means
 * inserting a role between two others is one edit here, and every rule that
 * depends on rank follows automatically instead of quietly not being updated.
 */
const roleRank: readonly ProjectMemberRole[] = ["owner", "manager", "member", "viewer"];

/** Does the first role outrank the second? Equal rank is not outranking. */
export function outranks(role: ProjectMemberRole, other: ProjectMemberRole): boolean {
  return roleRank.indexOf(role) < roleRank.indexOf(other);
}

/** Roles that may administer a project's own team, when granted on that project. */
const projectAdminRoles = new Set<ProjectMemberRole>(["owner", "manager"]);

export function isProjectAdminRole(role: ProjectMemberRole): boolean {
  return projectAdminRoles.has(role);
}

/**
 * May somebody holding `actorRole` on a project give or take `targetRole`?
 *
 * A manager runs the project but must not be able to install another manager,
 * nor an owner, nor unmake the one above them. Left unchecked, a manager could
 * promote themselves to owner and then delete the project — the two acts the
 * owner's rules exist to keep out of their hands. Owners may appoint anybody,
 * which is what being accountable for the project means.
 */
export function canAssignProjectRole(
  actorRole: ProjectMemberRole,
  targetRole: ProjectMemberRole,
): boolean {
  if (actorRole === "owner") return true;
  if (!isProjectAdminRole(actorRole)) return false;
  return outranks(actorRole, targetRole);
}

/**
 * What a project role grants on its own project.
 *
 * Being made manager of a project has to mean something by itself, otherwise
 * the appointment is decorative: a site team would need head office to grant
 * them a company-wide permission before they could add their own people, which
 * is the opposite of delegating a project. These are scoped to the one project
 * the role is held on — the company-wide grant of the same key is what lets
 * somebody do it everywhere.
 *
 * Deletion is deliberately absent from every entry, including the owner's. It
 * is checked separately, against the role and the company permission together,
 * so it can never be reached by appointment alone.
 */
export const projectRoleGrants: Record<ProjectMemberRole, readonly string[]> = {
  owner: [
    "projects.edit",
    "projects.archive",
    "project_team.read",
    "project_team.manage",
    "tasks.read",
    "tasks.create",
    "tasks.edit",
    "tasks.delete",
    "risks.read",
    "risks.create",
    "risks.edit",
    "risks.delete",
  ],
  manager: [
    "projects.edit",
    "projects.archive",
    "project_team.read",
    "project_team.manage",
    "tasks.read",
    "tasks.create",
    "tasks.edit",
    "tasks.delete",
    "risks.read",
    "risks.create",
    "risks.edit",
    "risks.delete",
  ],
  /*
   * A member creates and edits the work but deletes none of it. Deleting a task
   * somebody else is depending on is a manager's call, and the reversible
   * alternative — closing or cancelling it — is always available to a member.
   */
  member: [
    "project_team.read",
    "tasks.read",
    "tasks.create",
    "tasks.edit",
    "risks.read",
    "risks.create",
    "risks.edit",
  ],
  viewer: ["project_team.read", "tasks.read", "risks.read"],
};

/** Does holding this role on a project grant this permission on that project? */
export function roleGrantsOnProject(role: ProjectMemberRole, permission: string): boolean {
  return projectRoleGrants[role].includes(permission);
}

export const addProjectMemberInputSchema = z.object({
  userId: z.uuid(),
  role: projectMemberRoleSchema,
});

export const updateProjectMemberInputSchema = z.object({
  role: projectMemberRoleSchema,
});

export type AddProjectMemberInput = z.infer<typeof addProjectMemberInputSchema>;
export type UpdateProjectMemberInput = z.infer<typeof updateProjectMemberInputSchema>;

export interface ProjectMemberRecord {
  projectId: string;
  tenantId: string;
  userId: string;
  role: ProjectMemberRole;
  displayName: string;
  email: string;
  createdAt: string;
  updatedAt: string;
}

export const stakeholderCategorySchema = z.enum([
  "client",
  "consultant",
  "contractor",
  "subcontractor",
  "supplier",
  "authority",
  "community",
  "internal",
  "other",
]);

export const stakeholderLevelSchema = z.enum(["low", "medium", "high"]);

const stakeholderObjectSchema = z.object({
  name: z.string().trim().min(2).max(160),
  organization: z.string().trim().min(2).max(160).optional(),
  category: stakeholderCategorySchema,
  influence: stakeholderLevelSchema.default("medium"),
  interest: stakeholderLevelSchema.default("medium"),
  email: z.email().max(254).optional(),
  phone: z.string().trim().min(3).max(40).optional(),
  notes: z.string().trim().max(2000).optional(),
});

export const createStakeholderInputSchema = stakeholderObjectSchema;
export const updateStakeholderInputSchema = stakeholderObjectSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  { message: "Provide at least one field to update." },
);

export type CreateStakeholderInput = z.infer<typeof createStakeholderInputSchema>;
export type UpdateStakeholderInput = z.infer<typeof updateStakeholderInputSchema>;
export type StakeholderCategory = z.infer<typeof stakeholderCategorySchema>;
export type StakeholderLevel = z.infer<typeof stakeholderLevelSchema>;

export interface StakeholderRecord {
  id: string;
  projectId: string;
  tenantId: string;
  name: string;
  organization?: string;
  category: StakeholderCategory;
  influence: StakeholderLevel;
  interest: StakeholderLevel;
  email?: string;
  phone?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectActivityRecord {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  result: "success" | "failure";
  actorUserId?: string;
  actorName?: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export const projectActivityQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

export type ProjectActivityQuery = z.infer<typeof projectActivityQuerySchema>;

function parse<T>(schema: z.ZodType<T>, input: unknown, message: string): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new DomainError("VALIDATION_FAILED", message, z.treeifyError(result.error));
  }
  return result.data;
}

export function parseAddProjectMemberInput(input: unknown): AddProjectMemberInput {
  return parse(addProjectMemberInputSchema, input, "Project member details are not valid.");
}

export function parseUpdateProjectMemberInput(input: unknown): UpdateProjectMemberInput {
  return parse(updateProjectMemberInputSchema, input, "Project member role is not valid.");
}

export function parseUserId(input: unknown): string {
  return parse(z.uuid(), input, "A valid user reference is required.");
}

export function parseStakeholderId(input: unknown): string {
  return parse(z.uuid(), input, "A valid stakeholder reference is required.");
}

export function parseCreateStakeholderInput(input: unknown): CreateStakeholderInput {
  return parse(createStakeholderInputSchema, input, "Stakeholder details are not valid.");
}

export function parseUpdateStakeholderInput(input: unknown): UpdateStakeholderInput {
  return parse(updateStakeholderInputSchema, input, "Stakeholder details are not valid.");
}

export function parseProjectActivityQuery(input: unknown): ProjectActivityQuery {
  return parse(projectActivityQuerySchema, input, "Activity query is not valid.");
}
