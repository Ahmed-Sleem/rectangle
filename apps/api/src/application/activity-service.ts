/**
 * Activity reads, scoped to what the caller can already reach.
 *
 * This service exists because the audit trail was previously readable in full
 * by anyone holding `projects.read` — which is everyone. It is read-only: the
 * trail is written by the services that perform the actions, and nothing here
 * may amend it, because an audit log an application can edit is not one.
 */
import {
  parseActivityQuery,
  redactMetadata,
  type ActivityPage,
  type ActivityScope,
  type ActivitySummary,
} from "../domain/activity.js";
import { DomainError } from "../domain/errors.js";
import type { UserPrincipal } from "../domain/auth.js";
import { hasPermission } from "../domain/auth.js";

export interface ActivityRepository {
  list(options: {
    tenantId: string;
    userId: string;
    scope: ActivityScope;
    query: ReturnType<typeof parseActivityQuery>;
  }): Promise<Omit<ActivityPage, "availableScopes" | "summary">>;
  summarise(options: {
    tenantId: string;
    userId: string;
    scope: ActivityScope;
    query: ReturnType<typeof parseActivityQuery>;
  }): Promise<ActivitySummary>;
  listActions(tenantId: string): Promise<string[]>;
}

/**
 * Which slices this person may ask for.
 *
 * Returned to the client so the page can offer only the scopes that exist for
 * them, rather than showing a control that produces a refusal. `self` is always
 * present: everyone may audit themselves.
 */
export function availableScopes(actor: UserPrincipal): ActivityScope[] {
  const scopes: ActivityScope[] = ["self"];
  if (hasPermission(actor, "activity.read_team")) scopes.push("team");
  if (hasPermission(actor, "activity.read_all")) scopes.push("all");
  return scopes;
}

export class ActivityService {
  constructor(private readonly repository: ActivityRepository) {}

  async list(actor: UserPrincipal, rawQuery: unknown): Promise<ActivityPage> {
    const query = parseActivityQuery(rawQuery);
    const allowed = availableScopes(actor);

    if (!allowed.includes(query.scope)) {
      throw new DomainError("FORBIDDEN", "You do not have permission to view that activity.");
    }

    /*
     * Filtering by another person is meaningless when you can only see your
     * own actions, and offering it would produce an empty list rather than a
     * refusal — which reads as broken. Refused here so the contract is the
     * same whether the caller is the page or something else.
     */
    if (query.actorUserId && query.actorUserId !== actor.userId && query.scope === "self") {
      throw new DomainError("FORBIDDEN", "You can only filter your own activity.");
    }

    const read = { tenantId: actor.tenantId, userId: actor.userId, scope: query.scope, query };

    // Together, so the figures describe the rows rather than trailing them.
    const [page, summary] = await Promise.all([
      this.repository.list(read),
      this.repository.summarise(read),
    ]);

    const canReadAll = hasPermission(actor, "activity.read_all");

    return {
      ...page,
      /*
       * Redaction happens on the way out rather than in SQL because the same
       * row is legitimately fully visible to an administrator. Filtering it in
       * the query would mean fetching it twice for two audiences.
       */
      entries: page.entries.map((entry) => ({
        ...entry,
        metadata: redactMetadata(entry.metadata, canReadAll),
      })),
      availableScopes: allowed,
      summary,
    };
  }

  /** Action names present in this tenant, for the filter control. */
  async listActions(actor: UserPrincipal): Promise<{ actions: string[] }> {
    // Anyone who may read any activity may see which kinds exist; the names are
    // a fixed vocabulary, not tenant data.
    return { actions: await this.repository.listActions(actor.tenantId) };
  }
}
