/**
 * Activity domain.
 *
 * The audit trail records everything the product does, which makes it the most
 * revealing table in the database: who was hired and at what address, who
 * failed to sign in, who was disabled, what the mail server is. Deciding who
 * may read which part of it is a domain rule, not a presentation choice, so it
 * lives here and is enforced in SQL rather than filtered after the fact.
 */
import { z } from "zod";
import { DomainError } from "./errors.js";

/**
 * How revealing an entry is. This is the axis that decides visibility, and it
 * is deliberately independent of *who* may reach the record the entry concerns.
 *
 * A team manager may legitimately need to see that a colleague moved a task.
 * They have no business seeing when that colleague last changed their password.
 * One dimension cannot express both, which is why there are two.
 */
export const activitySensitivitySchema = z.enum([
  /** Work: projects, tasks, risks, documents. Visible with the record. */
  "operational",
  /** About a person's own account. Visible to them, or to a full administrator. */
  "personal",
  /** Sign-in and session events. Visible to the subject, or a full administrator. */
  "security",
  /** Company administration: users, roles, settings, keys. Administrators only. */
  "administrative",
]);

export type ActivitySensitivity = z.infer<typeof activitySensitivitySchema>;

/**
 * Classification by action name.
 *
 * A map rather than a prefix test at the call site, because a misclassified
 * action becomes a disclosure and the list should be reviewable in one place.
 * Anything unrecognised is `administrative` — the most restrictive class — so a
 * new action added without a decision here is hidden rather than leaked.
 */
const SENSITIVITY_BY_PREFIX: ReadonlyArray<[string, ActivitySensitivity]> = [
  ["project.", "operational"],
  ["task.", "operational"],
  ["risk.", "operational"],
  ["document.", "operational"],
  ["auth.", "security"],
  ["profile.", "personal"],
  ["passkey.", "personal"],
];

const SENSITIVITY_BY_ACTION: Readonly<Record<string, ActivitySensitivity>> = {
  "user.email_changed": "personal",
  "user.email_change_requested": "personal",
  "user.email_change_reverted": "personal",
  "user.invitation_accepted": "personal",
};

export function classifyActivity(action: string): ActivitySensitivity {
  const exact = SENSITIVITY_BY_ACTION[action];
  if (exact) return exact;

  for (const [prefix, sensitivity] of SENSITIVITY_BY_PREFIX) {
    if (action.startsWith(prefix)) return sensitivity;
  }

  return "administrative";
}

/**
 * Which slice of the trail is being asked for.
 *
 * `project` is not offered as a scope here because the project workspace has
 * its own feed with its own access check. This is the cross-cutting view.
 */
export const activityScopeSchema = z.enum(["self", "team", "all"]);
export type ActivityScope = z.infer<typeof activityScopeSchema>;

/**
 * Metadata keys that must never reach a caller below `activity.read_all`.
 *
 * `user.create` records the new hire's email address, which is how a company
 * directory leaks one row at a time. The entry itself is still shown — that
 * somebody was added is not a secret — but the address is removed.
 */
const RESTRICTED_METADATA_KEYS = new Set(["email", "recipientEmail", "host", "username", "tenantSlug"]);

export function redactMetadata(
  metadata: Record<string, unknown>,
  canReadAll: boolean,
): Record<string, unknown> {
  if (canReadAll) return metadata;

  const safe: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (!RESTRICTED_METADATA_KEYS.has(key)) safe[key] = value;
  }
  return safe;
}

const MAX_LIMIT = 100;

export const activityQuerySchema = z.object({
  scope: activityScopeSchema.default("self"),
  limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(30),
  /**
   * Keyset paging, not an offset. The trail grows constantly at the head, so an
   * offset would silently repeat or skip rows between one page and the next.
   */
  cursor: z.string().max(200).optional(),
  action: z.string().trim().min(1).max(120).optional(),
  entityType: z.string().trim().min(1).max(80).optional(),
  actorUserId: z.uuid().optional(),
  projectId: z.uuid().optional(),
  result: z.enum(["success", "failure"]).optional(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
});

export type ActivityQuery = z.infer<typeof activityQuerySchema>;

export function parseActivityQuery(raw: unknown): ActivityQuery {
  const parsed = activityQuerySchema.safeParse(raw ?? {});
  if (!parsed.success) {
    throw new DomainError("VALIDATION_FAILED", "Activity query is invalid.", {
      issues: parsed.error.issues.map((issue) => issue.path.join(".")),
    });
  }

  if (parsed.data.from && parsed.data.to && parsed.data.from > parsed.data.to) {
    throw new DomainError("VALIDATION_FAILED", "The start date cannot be after the end date.");
  }

  return parsed.data;
}

export interface ActivityEntry {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  result: "success" | "failure";
  sensitivity: ActivitySensitivity;
  actorUserId?: string;
  actorName?: string;
  projectId?: string;
  projectName?: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface ActivityPage {
  entries: ActivityEntry[];
  /** Absent when there is nothing further to fetch. */
  nextCursor?: string;
  /** Which scopes this caller may ask for, so the page offers only real choices. */
  availableScopes: ActivityScope[];
}

/** Opaque to the client, and ordered exactly as the query orders rows. */
export function encodeCursor(createdAt: string, id: string): string {
  return Buffer.from(`${createdAt}|${id}`, "utf8").toString("base64url");
}

export function decodeCursor(cursor: string): { createdAt: string; id: string } {
  const raw = Buffer.from(cursor, "base64url").toString("utf8");
  const separator = raw.lastIndexOf("|");
  const createdAt = separator === -1 ? "" : raw.slice(0, separator);
  const id = separator === -1 ? "" : raw.slice(separator + 1);

  if (!createdAt || !id || Number.isNaN(Date.parse(createdAt))) {
    throw new DomainError("VALIDATION_FAILED", "That page reference is not valid.");
  }

  return { createdAt, id };
}

/** Days an entry is kept. Beyond this it is purged rather than held forever. */
export const ACTIVITY_RETENTION_DAYS = 400;
