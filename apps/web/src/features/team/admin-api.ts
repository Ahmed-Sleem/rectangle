/** API helpers for tenant user and user type administration. */
import { apiRequest } from "@/shared/api/client";

/**
 * One atomic permission as the server describes it.
 *
 * `group` and `implies` come from the server rather than being re-derived here,
 * so the picker cannot disagree with the rules that will actually be applied.
 */
export interface PermissionOption {
  key: string;
  group: string;
  label: string;
  description: string;
  implies?: string[];
}
export interface UserTypeRecord { id: string; name: string; key: string; description?: string; permissions: string[]; systemType: boolean }
export interface AdminUserRecord {
  id: string;
  email: string;
  displayName: string;
  status: string;
  /** Company standing: exactly one, never a set. */
  standing: "owner" | "admin" | "member" | "guest";
  userTypes: Array<{ id: string; name: string; key: string }>;
  /** Projects this person is a member of. Counted from real membership rows. */
  projectCount: number;
}

/** A pair this company has declared one person may never hold at once. */
export interface SeparationRuleRecord {
  id: string;
  a: string;
  b: string;
  reason: string;
}

/** Somebody who already holds both halves of a pair being considered. */
export interface SeparationViolatorRecord {
  userId: string;
  displayName: string;
  email: string;
  typesGrantingA: Array<{ id: string; name: string }>;
  typesGrantingB: Array<{ id: string; name: string }>;
  totalTypes: number;
  /** Choosing this side would leave them with no user type at all. */
  losesEverythingIfA: boolean;
  losesEverythingIfB: boolean;
}

export const adminApi = {
  permissions: () => apiRequest<{ permissions: PermissionOption[] }>("/v1/admin/permissions"),
  userTypes: () => apiRequest<{ userTypes: UserTypeRecord[] }>("/v1/admin/user-types"),
  users: () => apiRequest<{ users: AdminUserRecord[] }>("/v1/admin/users"),
  createUserType: (payload: { name: string; key: string; description?: string; permissions: string[] }) =>
    apiRequest<{ userType: UserTypeRecord }>("/v1/admin/user-types", { method: "POST", body: JSON.stringify(payload) }),
  createUser: (payload: { displayName: string; email: string; password?: string; standing?: AdminUserRecord["standing"]; userTypeIds: string[] }) =>
    apiRequest<{ user: AdminUserRecord }>("/v1/admin/users", { method: "POST", body: JSON.stringify(payload) }),
  updateUser: (userId: string, payload: { displayName?: string; status?: "active" | "disabled"; password?: string; standing?: AdminUserRecord["standing"]; userTypeIds?: string[] }) =>
    apiRequest<{ user: AdminUserRecord }>(`/v1/admin/users/${userId}`, { method: "PATCH", body: JSON.stringify(payload) }),
  updateUserType: (userTypeId: string, payload: { name?: string; description?: string; permissions?: string[] }) =>
    apiRequest<{ userType: UserTypeRecord }>(`/v1/admin/user-types/${userTypeId}`, { method: "PATCH", body: JSON.stringify(payload) }),

  separationRules: () =>
    apiRequest<{ rules: SeparationRuleRecord[] }>("/v1/admin/separation-rules"),
  /* A POST that changes nothing: it asks what a proposed pair would cost. */
  previewSeparationRule: (payload: { a: string; b: string }) =>
    apiRequest<{ violators: SeparationViolatorRecord[] }>("/v1/admin/separation-rules/preview", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  createSeparationRule: (payload: { a: string; b: string; reason: string; losing: string }) =>
    apiRequest<{ rule: SeparationRuleRecord; strippedFrom: number }>("/v1/admin/separation-rules", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  deleteSeparationRule: (ruleId: string) =>
    apiRequest<void>(`/v1/admin/separation-rules/${ruleId}`, { method: "DELETE" }),
};
