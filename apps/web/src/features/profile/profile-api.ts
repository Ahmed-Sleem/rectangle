/** Self-service profile: the signed-in person's own record. */
import { apiRequest } from "@/shared/api/client";

export interface ProfileRecord {
  userId: string;
  tenantId: string;
  displayName: string;
  email: string;
  status: string;
  roles: string[];
  permissions: string[];
  /**
   * The same permissions with the catalogue's wording, sent by the server.
   *
   * The catalogue itself needs `user_types.read`, which this page must not
   * require — so the labels come attached to the profile rather than being
   * fetched separately.
   */
  permissionLabels: Array<{ key: string; label: string }>;
  passkeyCount: number;
  createdAt: string;
}

export function getProfile(): Promise<{ profile: ProfileRecord }> {
  return apiRequest("/v1/profile");
}

export function updateProfile(payload: { displayName: string }): Promise<{ profile: ProfileRecord }> {
  return apiRequest("/v1/profile", { method: "PATCH", body: JSON.stringify(payload) });
}

export function changePassword(payload: {
  currentPassword: string;
  newPassword: string;
}): Promise<{ revokedSessions: number }> {
  return apiRequest("/v1/profile/password", { method: "POST", body: JSON.stringify(payload) });
}
