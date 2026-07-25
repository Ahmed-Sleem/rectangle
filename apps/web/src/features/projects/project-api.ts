/** API helpers for real project records stored by the Rectangle backend. */
import { apiRequest } from "@/shared/api/client";

export interface ProjectRecord {
  id: string;
  tenantId: string;
  name: string;
  code: string;
  description?: string;
  status: "planned" | "active" | "on_hold" | "completed" | "archived";
  plannedStartDate?: string;
  plannedFinishDate?: string;
  budgetAmount?: string;
  budgetCurrency?: string;
  sector?: string;
  deliveryMethod?: string;
  locationName?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateProjectPayload {
  name: string;
  code: string;
  description?: string;
  status: ProjectRecord["status"];
  plannedStartDate?: string;
  plannedFinishDate?: string;
  budgetAmount?: string;
  budgetCurrency?: string;
  sector?: string;
  deliveryMethod?: string;
  locationName?: string;
}

export type ProjectStatus = ProjectRecord["status"];

export interface ProjectListFilters {
  search?: string;
  status?: ProjectStatus;
}

export function listProjects(filters: ProjectListFilters = {}): Promise<{ projects: ProjectRecord[] }> {
  const params = new URLSearchParams();
  if (filters.search) params.set("search", filters.search);
  if (filters.status) params.set("status", filters.status);
  const query = params.toString();
  return apiRequest(query ? `/v1/projects?${query}` : "/v1/projects");
}

export function getProject(projectId: string): Promise<{ project: ProjectRecord }> {
  return apiRequest(`/v1/projects/${projectId}`);
}

export function createProject(payload: CreateProjectPayload): Promise<{ project: ProjectRecord }> {
  return apiRequest("/v1/projects", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export type UpdateProjectPayload = Partial<CreateProjectPayload>;

export function updateProject(
  projectId: string,
  payload: UpdateProjectPayload,
): Promise<{ project: ProjectRecord }> {
  return apiRequest(`/v1/projects/${projectId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export type ProjectMemberRole =
  | "project_admin"
  | "project_manager"
  | "controls_manager"
  | "viewer"
  | "external_collaborator";

export interface ProjectAccess {
  canRead: boolean;
  canManage: boolean;
  membershipRole?: ProjectMemberRole;
}

export interface ProjectMember {
  projectId: string;
  userId: string;
  role: ProjectMemberRole;
  displayName: string;
  email: string;
  createdAt: string;
  updatedAt: string;
}

export type StakeholderCategory =
  | "client"
  | "consultant"
  | "contractor"
  | "subcontractor"
  | "supplier"
  | "authority"
  | "community"
  | "internal"
  | "other";

export type StakeholderLevel = "low" | "medium" | "high";

export interface ProjectStakeholder {
  id: string;
  projectId: string;
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

export interface StakeholderPayload {
  name: string;
  organization?: string;
  category: StakeholderCategory;
  influence?: StakeholderLevel;
  interest?: StakeholderLevel;
  email?: string;
  phone?: string;
  notes?: string;
}

export interface ProjectActivityEntry {
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

export function getProjectAccess(projectId: string): Promise<{ access: ProjectAccess }> {
  return apiRequest(`/v1/projects/${projectId}/access`);
}

export function listProjectMembers(projectId: string): Promise<{ members: ProjectMember[] }> {
  return apiRequest(`/v1/projects/${projectId}/members`);
}

export function addProjectMember(
  projectId: string,
  payload: { userId: string; role: ProjectMemberRole },
): Promise<{ member: ProjectMember }> {
  return apiRequest(`/v1/projects/${projectId}/members`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateProjectMember(
  projectId: string,
  userId: string,
  payload: { role: ProjectMemberRole },
): Promise<{ member: ProjectMember }> {
  return apiRequest(`/v1/projects/${projectId}/members/${userId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function removeProjectMember(projectId: string, userId: string): Promise<void> {
  return apiRequest(`/v1/projects/${projectId}/members/${userId}`, { method: "DELETE" });
}

export function listStakeholders(projectId: string): Promise<{ stakeholders: ProjectStakeholder[] }> {
  return apiRequest(`/v1/projects/${projectId}/stakeholders`);
}

export function createStakeholder(
  projectId: string,
  payload: StakeholderPayload,
): Promise<{ stakeholder: ProjectStakeholder }> {
  return apiRequest(`/v1/projects/${projectId}/stakeholders`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function deleteStakeholder(projectId: string, stakeholderId: string): Promise<void> {
  return apiRequest(`/v1/projects/${projectId}/stakeholders/${stakeholderId}`, { method: "DELETE" });
}

export function listProjectActivity(
  projectId: string,
): Promise<{ activity: ProjectActivityEntry[] }> {
  return apiRequest(`/v1/projects/${projectId}/activity`);
}
