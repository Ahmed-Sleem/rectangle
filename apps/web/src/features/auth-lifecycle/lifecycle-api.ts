/** Invitation, password reset, and email change flows. */
import { apiRequest } from "@/shared/api/client";

export interface InvitationSummary {
  email: string;
  displayName: string;
  companyName: string;
}

export function requestPasswordReset(payload: {
  tenantSlug: string;
  email: string;
}): Promise<{ requested: true }> {
  return apiRequest("/v1/auth/password-reset", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function confirmPasswordReset(payload: {
  token: string;
  newPassword: string;
}): Promise<{ reset: true }> {
  return apiRequest("/v1/auth/password-reset/confirm", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function describeInvitation(token: string): Promise<{ invitation: InvitationSummary }> {
  return apiRequest(`/v1/auth/invitation?token=${encodeURIComponent(token)}`);
}

export function acceptInvitation(payload: {
  token: string;
  password: string;
  displayName?: string;
}): Promise<{ accepted: true }> {
  return apiRequest("/v1/auth/invitation/accept", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function confirmEmailChange(token: string): Promise<{ changed: true }> {
  return apiRequest("/v1/auth/email-change/confirm", {
    method: "POST",
    body: JSON.stringify({ token }),
  });
}

export function revertEmailChange(token: string): Promise<{ reverted: true }> {
  return apiRequest("/v1/auth/email-change/revert", {
    method: "POST",
    body: JSON.stringify({ token }),
  });
}

/** Starting a change needs a session: only the owner may move their address. */
export function requestEmailChange(payload: {
  newEmail: string;
  currentPassword: string;
}): Promise<{ requested: true }> {
  return apiRequest("/v1/profile/email", { method: "POST", body: JSON.stringify(payload) });
}
