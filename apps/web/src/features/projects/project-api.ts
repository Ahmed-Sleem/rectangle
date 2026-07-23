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

export function listProjects(): Promise<{ projects: ProjectRecord[] }> {
  return apiRequest("/v1/projects");
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
