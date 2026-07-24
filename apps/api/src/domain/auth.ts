/**
 * Auth domain primitives keep authorization decisions explicit and reusable by
 * HTTP handlers, services, and future AI tools.
 */
import { z } from "zod";
import { DomainError } from "./errors.js";
import { allPermissions, permissionSchema, type Permission } from "./permissions.js";

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
  permissions: z.array(permissionSchema).default([]),
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

export function rolePermissions(roles: TenantRole[]): Permission[] {
  if (roles.includes("tenant_owner") || roles.includes("tenant_admin")) return allPermissions;
  const permissions = new Set<Permission>();
  for (const role of roles) {
    if (role === "project_admin" || role === "project_manager") {
      permissions.add("projects.read"); permissions.add("projects.manage");
    }
    if (role === "controls_manager" || role === "viewer") permissions.add("projects.read");
  }
  return [...permissions];
}

function hasPermission(principal: UserPrincipal, permission: Permission): boolean {
  return principal.permissions.includes(permission) || rolePermissions(principal.roles).includes(permission);
}

export function requirePermission(principal: UserPrincipal, permission: Permission): void {
  if (!hasPermission(principal, permission)) {
    throw new DomainError("FORBIDDEN", "You do not have permission to perform this action.");
  }
}

export function canManageProjects(principal: UserPrincipal): boolean {
  return principal.roles.some((role) => projectWriteRoles.has(role)) || hasPermission(principal, "projects.manage");
}

export function canReadProjectRegistry(principal: UserPrincipal): boolean {
  return principal.roles.some((role) => projectReadRoles.has(role)) || hasPermission(principal, "projects.read");
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
