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
  /*
   * What the assistant did, and what a person told it it could do unasked.
   *
   * Unclassified these fell through to `administrative`, which is the most
   * restrictive class and means administrators only — so somebody could not see
   * the actions their own assistant had taken on their behalf. That is the
   * wrong answer twice over. It is their activity, performed as them; and the
   * whole approval design rests on every action being visible to the person who
   * approved it, or who agreed in advance not to be asked. An audit trail that
   * hides an agent's work from its principal is not an audit trail.
   *
   * `personal` rather than `operational`: these describe a person's own
   * relationship with the assistant — their conversations, their standing
   * approvals — and are visible to them or to a full administrator. The work
   * itself is separate. Creating a task through the assistant still writes
   * `task.create`, classified `operational` and visible with the record, and it
   * carries the assistant attribution alongside.
   */
  ["ai.", "personal"],
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

/**
 * Quick ranges, resolved on the server.
 *
 * "This week" has to mean the same thing to the list and to the summary above
 * it, and a browser in another timezone computing its own boundaries would make
 * the two disagree by a day. The client sends the name; the server decides what
 * it means.
 */
export const activityPresetSchema = z.enum(["today", "week", "month", "custom"]);
export type ActivityPreset = z.infer<typeof activityPresetSchema>;

export const activityQuerySchema = z.object({
  preset: activityPresetSchema.default("month"),
  scope: activityScopeSchema.default("self"),
  limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(30),
  /**
   * Keyset paging, not an offset. The trail grows constantly at the head, so an
   * offset would silently repeat or skip rows between one page and the next.
   */
  cursor: z.string().max(200).optional(),
  /** Matches the actor's name, the action, or the project. Same shape as the
   *  search on every other register, so it behaves the way people expect. */
  search: z.string().trim().min(1).max(120).optional(),
  action: z.string().trim().min(1).max(120).optional(),
  entityType: z.string().trim().min(1).max(80).optional(),
  actorUserId: z.uuid().optional(),
  projectId: z.uuid().optional(),
  result: z.enum(["success", "failure"]).optional(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
});

export type ActivityQuery = z.infer<typeof activityQuerySchema>;

/**
 * The inclusive day range a preset covers, in the server's own calendar.
 * `custom` defers to whatever `from`/`to` the caller supplied.
 */
export function resolvePresetRange(
  preset: ActivityPreset,
  now = new Date(),
): { from?: string; to?: string } {
  const day = (date: Date): string => date.toISOString().slice(0, 10);
  const today = day(now);

  switch (preset) {
    case "today":
      return { from: today, to: today };
    case "week": {
      const start = new Date(now);
      // Monday-based: a construction week is planned from Monday, and Sunday
      // reading as the start of a new week surprises everybody who uses it.
      const weekday = (start.getUTCDay() + 6) % 7;
      start.setUTCDate(start.getUTCDate() - weekday);
      return { from: day(start), to: today };
    }
    case "month": {
      const start = new Date(now);
      start.setUTCDate(start.getUTCDate() - 29);
      return { from: day(start), to: today };
    }
    case "custom":
      return {};
  }
}

export function parseActivityQuery(raw: unknown): ActivityQuery {
  const parsed = activityQuerySchema.safeParse(raw ?? {});
  if (!parsed.success) {
    throw new DomainError("VALIDATION_FAILED", "Activity query is invalid.", {
      issues: parsed.error.issues.map((issue) => issue.path.join(".")),
    });
  }

  /*
   * The preset wins over any dates that came with it, except for `custom`
   * which is the only one that means "use what I sent". Resolving here rather
   * than at each call site is what keeps the list and the summary describing
   * the same window.
   */
  const range = resolvePresetRange(parsed.data.preset);
  const query: ActivityQuery = { ...parsed.data, ...range };

  if (query.from && query.to && query.from > query.to) {
    throw new DomainError("VALIDATION_FAILED", "The start date cannot be after the end date.");
  }

  return query;
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

/** One row of a side-panel breakdown, with its own filter value. */
export interface ActivityTally {
  /** The value to filter by — a user id, an action name, or a project id. */
  key: string;
  label: string;
  count: number;
}

/** The figures above the list, describing the same range the list covers. */
export interface ActivitySummary {
  total: number;
  failures: number;
  /** Distinct people who did something. Excludes entries with no actor. */
  people: number;
  /** Absent when the range holds nothing, rather than reported as a zero day. */
  busiestDay?: string;
  busiestDayCount?: number;
  /**
   * Side-panel breakdowns. Every one is computed over the caller's own
   * predicate, so a member sees a ranking of what they can already see rather
   * than a leaderboard of the company.
   */
  topActors: ActivityTally[];
  topActions: ActivityTally[];
  topProjects: ActivityTally[];
  /** Entries worth noticing: refusals, permission changes, deletions. */
  attention: ActivityTally[];
}

export interface ActivityPage {
  entries: ActivityEntry[];
  /** Absent when there is nothing further to fetch. */
  nextCursor?: string;
  /** Which scopes this caller may ask for, so the page offers only real choices. */
  availableScopes: ActivityScope[];
  summary: ActivitySummary;
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
