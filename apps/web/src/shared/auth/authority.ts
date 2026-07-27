/**
 * What the signed-in person may do.
 *
 * Mirrors the server's rule that tenant owners and admins hold every
 * permission implicitly, so the interface offers the same set the API will
 * accept. This is presentation only — the server checks again on every
 * request, and is the authority. Getting this wrong shows or hides a control;
 * it can never grant access.
 */
export interface AuthorityUser {
  roles: string[];
  permissions: string[];
}

/** Roles that carry every permission without being granted each one. */
const FULL_ACCESS_ROLES = new Set(["tenant_owner", "tenant_admin"]);

/**
 * Permissions implied by a role rather than assigned through a user type.
 * Kept in step with `rolePermissions` in the API's auth domain.
 */
const ROLE_PERMISSIONS: Readonly<Record<string, readonly string[]>> = {
  project_admin: ["projects.read", "projects.manage"],
  project_manager: ["projects.read", "projects.manage"],
  controls_manager: ["projects.read"],
  viewer: ["projects.read"],
};

export function hasPermission(
  user: AuthorityUser | null | undefined,
  permission: string,
): boolean {
  if (!user) return false;
  if (user.roles.some((role) => FULL_ACCESS_ROLES.has(role))) return true;
  if (user.permissions.includes(permission)) return true;
  return user.roles.some((role) => ROLE_PERMISSIONS[role]?.includes(permission) ?? false);
}

/** True when the feature is open to everyone, or the person holds its permission. */
export function canOpenFeature(
  user: AuthorityUser | null | undefined,
  requiredPermission: string | undefined,
): boolean {
  if (!requiredPermission) return true;
  return hasPermission(user, requiredPermission);
}
