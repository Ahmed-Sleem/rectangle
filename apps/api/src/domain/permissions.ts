/** Permission keys define what tenant administrators can grant to user types. */
import { z } from "zod";

export const permissionSchema = z.enum([
  "projects.read",
  "projects.manage",
  "users.read",
  "users.manage",
  "user_types.read",
  "user_types.manage",
  "settings.manage",
  "activity.read_team",
  "activity.read_all",
]);

export type Permission = z.infer<typeof permissionSchema>;

export const allPermissions: Permission[] = [
  "projects.read",
  "projects.manage",
  "users.read",
  "users.manage",
  "user_types.read",
  "user_types.manage",
  "settings.manage",
  "activity.read_team",
  "activity.read_all",
];

export const permissionDescriptions: Array<{ key: Permission; label: string; description: string }> = [
  { key: "projects.read", label: "View projects", description: "Open the project register and project detail pages." },
  { key: "projects.manage", label: "Manage projects", description: "Create and edit project records." },
  { key: "users.read", label: "View users", description: "View company users and user type assignments." },
  { key: "users.manage", label: "Manage users", description: "Create users and assign user types." },
  { key: "user_types.read", label: "View user types", description: "View company user types and permissions." },
  { key: "user_types.manage", label: "Manage user types", description: "Create and update user types and permissions." },
  { key: "settings.manage", label: "Manage settings", description: "Manage company-level configuration." },
  { key: "activity.read_team", label: "View team activity", description: "See what people in teams you manage did to the work." },
  { key: "activity.read_all", label: "View all activity", description: "See the company's full activity and security history." },
];
