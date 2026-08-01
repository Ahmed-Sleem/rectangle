/**
 * What the signed-in person may do.
 *
 * Mirrors the server's rule that the company owner holds every permission
 * implicitly, so the interface offers the same set the API will
 * accept. This is presentation only — the server checks again on every
 * request, and is the authority. Getting this wrong shows or hides a control;
 * it can never grant access.
 */
export interface AuthorityUser {
  roles: string[];
  permissions: string[];
}

/**
 * The standing that carries every permission without being granted each one.
 *
 * Mirrors `rolePermissions` in the API's auth domain. Nothing else grants a
 * permission by standing: everybody else holds exactly what was granted to
 * them. Company-wide project roles used to live here too, and holding one
 * silently granted it on every project.
 */
const FULL_ACCESS_STANDINGS = new Set(["owner"]);

export function hasPermission(
  user: AuthorityUser | null | undefined,
  permission: string,
): boolean {
  if (!user) return false;
  if (user.roles.some((role) => FULL_ACCESS_STANDINGS.has(role))) return true;
  return user.permissions.includes(permission);
}

/** True when the feature is open to everyone, or the person holds its permission. */
export function canOpenFeature(
  user: AuthorityUser | null | undefined,
  requiredPermission: string | undefined,
): boolean {
  if (!requiredPermission) return true;
  return hasPermission(user, requiredPermission);
}
