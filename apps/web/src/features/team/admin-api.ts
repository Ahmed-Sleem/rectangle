/** API helpers for tenant user and user type administration. */
import { apiRequest } from "@/shared/api/client";

export interface PermissionOption { key: string; label: string; description: string }
export interface UserTypeRecord { id: string; name: string; key: string; description?: string; permissions: string[]; systemType: boolean }
export interface AdminUserRecord { id: string; email: string; displayName: string; status: string; userTypes: Array<{ id: string; name: string; key: string }> }

export const adminApi = {
  permissions: () => apiRequest<{ permissions: PermissionOption[] }>("/v1/admin/permissions"),
  userTypes: () => apiRequest<{ userTypes: UserTypeRecord[] }>("/v1/admin/user-types"),
  users: () => apiRequest<{ users: AdminUserRecord[] }>("/v1/admin/users"),
  createUserType: (payload: { name: string; key: string; description?: string; permissions: string[] }) =>
    apiRequest<{ userType: UserTypeRecord }>("/v1/admin/user-types", { method: "POST", body: JSON.stringify(payload) }),
  createUser: (payload: { displayName: string; email: string; password: string; userTypeIds: string[] }) =>
    apiRequest<{ user: AdminUserRecord }>("/v1/admin/users", { method: "POST", body: JSON.stringify(payload) }),
};
