/** API helpers for the real risk and issue register. */
import { apiRequest } from "@/shared/api/client";

export type RiskKind = "risk" | "issue";
export type RiskStatus = "open" | "assessing" | "mitigating" | "accepted" | "closed" | "occurred";
export type RiskSeverity = "low" | "medium" | "high" | "critical";
export type RiskCategory =
  | "safety" | "quality" | "schedule" | "cost" | "design"
  | "procurement" | "environmental" | "regulatory" | "other";

export interface RiskRecord {
  id: string;
  projectId: string;
  projectName: string;
  projectCode: string;
  kind: RiskKind;
  title: string;
  description?: string;
  category: RiskCategory;
  probability: number;
  impact: number;
  score: number;
  severity: RiskSeverity;
  residualProbability?: number;
  residualImpact?: number;
  residualScore?: number;
  status: RiskStatus;
  mitigation?: string;
  mitigationTaskId?: string;
  mitigationTaskTitle?: string;
  ownerUserId?: string;
  ownerName?: string;
  dueDate?: string;
  closedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface RiskMatrixCell {
  probability: number;
  impact: number;
  count: number;
}

export interface RiskSummary {
  total: number;
  criticalOrHigh: number;
  underReview: number;
  closed: number;
  occurred: number;
  matrix: RiskMatrixCell[];
}

export interface RiskFilters {
  projectId?: string;
  kind?: RiskKind;
  status?: RiskStatus;
  category?: RiskCategory;
  mine?: boolean;
  openOnly?: boolean;
  probability?: number;
  impact?: number;
}

export interface CreateRiskPayload {
  kind: RiskKind;
  title: string;
  description?: string;
  category: RiskCategory;
  probability: number;
  impact: number;
  status: RiskStatus;
  mitigation?: string;
  ownerUserId?: string;
  mitigationTaskId?: string;
  dueDate?: string;
}

/** `null` clears a value; omitting a key leaves it unchanged. */
export type UpdateRiskPayload = Partial<{
  kind: RiskKind;
  title: string;
  description: string | null;
  category: RiskCategory;
  probability: number;
  impact: number;
  status: RiskStatus;
  mitigation: string | null;
  ownerUserId: string | null;
  mitigationTaskId: string | null;
  dueDate: string | null;
}>;

function toQuery(filters: RiskFilters): string {
  const params = new URLSearchParams();
  if (filters.projectId) params.set("projectId", filters.projectId);
  if (filters.kind) params.set("kind", filters.kind);
  if (filters.status) params.set("status", filters.status);
  if (filters.category) params.set("category", filters.category);
  if (filters.mine) params.set("mine", "true");
  if (filters.openOnly) params.set("openOnly", "true");
  if (filters.probability) params.set("probability", String(filters.probability));
  if (filters.impact) params.set("impact", String(filters.impact));
  return params.toString();
}

export function listRisks(filters: RiskFilters = {}): Promise<{ risks: RiskRecord[] }> {
  const query = toQuery(filters);
  return apiRequest(query ? `/v1/risks?${query}` : "/v1/risks");
}

export function getRiskSummary(projectId?: string): Promise<{ summary: RiskSummary }> {
  return apiRequest(projectId ? `/v1/risks/summary?projectId=${projectId}` : "/v1/risks/summary");
}

export function createRisk(projectId: string, payload: CreateRiskPayload): Promise<{ risk: RiskRecord }> {
  return apiRequest(`/v1/projects/${projectId}/risks`, { method: "POST", body: JSON.stringify(payload) });
}

export function updateRisk(riskId: string, payload: UpdateRiskPayload): Promise<{ risk: RiskRecord }> {
  return apiRequest(`/v1/risks/${riskId}`, { method: "PATCH", body: JSON.stringify(payload) });
}

export function deleteRisk(riskId: string): Promise<void> {
  return apiRequest(`/v1/risks/${riskId}`, { method: "DELETE" });
}
