/**
 * Auth domain primitives keep authorization decisions explicit and reusable by
 * HTTP handlers, services, and future AI tools.
 */
import { z } from "zod";
import { DomainError } from "./errors.js";

export const tenantRoleSchema = z.enum([
  "tenant_owner",
  "tenant_admin",
  "project_admin",
  "project_manager",
  "controls_manager",
  "viewer",
  "external_collaborator",
]);

export type TenantRole = z.infer<typeof tenantRoleSchema>;

export const userPrincipalSchema = z.object({
  tenantId: z.uuid(),
  userId: z.uuid(),
  roles: z.array(tenantRoleSchema).min(1).max(20),
  sessionId: z.uuid().optional(),
});

export type UserPrincipal = z.infer<typeof userPrincipalSchema>;

const projectWriteRoles = new Set<TenantRole>([
  "tenant_owner",
  "tenant_admin",
  "project_admin",
  "project_manager",
]);

const projectReadRoles = new Set<TenantRole>([
  "tenant_owner",
  "tenant_admin",
  "project_admin",
  "project_manager",
  "controls_manager",
  "viewer",
]);

export function canManageProjects(principal: UserPrincipal): boolean {
  return principal.roles.some((role) => projectWriteRoles.has(role));
}

export function canReadProjectRegistry(principal: UserPrincipal): boolean {
  return principal.roles.some((role) => projectReadRoles.has(role));
}

export function requireProjectManagement(principal: UserPrincipal): void {
  if (!canManageProjects(principal)) {
    throw new DomainError("FORBIDDEN", "You do not have permission to manage projects.");
  }
}

export function requireProjectRead(principal: UserPrincipal): void {
  if (!canReadProjectRegistry(principal)) {
    throw new DomainError("FORBIDDEN", "You do not have permission to view projects.");
  }
}
