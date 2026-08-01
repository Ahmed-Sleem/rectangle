/**
 * Global search.
 *
 * One query across the registers a person can actually reach. Each block is
 * gated on its own permission rather than the search as a whole, so a narrower
 * user gets fewer kinds of result instead of an error — and never sees a record
 * they could not open by navigating to it.
 *
 * Read-only: searching is not an action taken on a record, so nothing is
 * audited. Logging every keystroke-driven lookup would bury the mutations the
 * audit trail exists to preserve.
 */
import {
  canReachAllProjects,
  canReadProjectRegistry,
  canReadUsers,
  type UserPrincipal,
} from "../domain/auth.js";
import { DomainError } from "../domain/errors.js";
import { z } from "zod";

export const searchQuerySchema = z.object({
  q: z.string().trim().min(2).max(120),
  /** Kept small: this feeds a palette, not a report. */
  limit: z.coerce.number().int().min(1).max(10).default(5),
});

export type SearchQuery = z.infer<typeof searchQuerySchema>;

export type SearchResultKind = "project" | "task" | "risk" | "person";

export interface SearchResult {
  kind: SearchResultKind;
  id: string;
  title: string;
  /** Secondary line: a code, a project name, an email. */
  subtitle?: string;
  /** Where opening this result should go. */
  href: string;
}

export interface SearchRepository {
  searchProjects(
    tenantId: string,
    userId: string,
    term: string,
    limit: number,
    scope: "all" | "member",
  ): Promise<SearchResult[]>;
  searchTasks(
    tenantId: string,
    userId: string,
    term: string,
    limit: number,
    scope: "all" | "member",
  ): Promise<SearchResult[]>;
  searchRisks(
    tenantId: string,
    userId: string,
    term: string,
    limit: number,
    scope: "all" | "member",
  ): Promise<SearchResult[]>;
  searchPeople(tenantId: string, term: string, limit: number): Promise<SearchResult[]>;
}

export class SearchService {
  constructor(private readonly repository: SearchRepository) {}

  async search(actor: UserPrincipal, rawQuery: unknown): Promise<SearchResult[]> {
    const parsed = searchQuerySchema.safeParse(rawQuery ?? {});
    if (!parsed.success) {
      throw new DomainError("VALIDATION_FAILED", "Search term is invalid.", z.treeifyError(parsed.error));
    }
    const { q, limit } = parsed.data;

    /*
     * One scope for every register, because they are all the same question:
     * can this person reach the project this record belongs to. Projects were
     * previously exempt from it, which meant the palette listed jobs the
     * register itself would have hidden.
     */
    const projectScope = canReachAllProjects(actor) ? "all" : "member";

    const [projects, tasks, risks, people] = await Promise.all([
      canReadProjectRegistry(actor)
        ? this.repository.searchProjects(actor.tenantId, actor.userId, q, limit, projectScope)
        : [],
      canReadProjectRegistry(actor)
        ? this.repository.searchTasks(actor.tenantId, actor.userId, q, limit, projectScope)
        : [],
      canReadProjectRegistry(actor)
        ? this.repository.searchRisks(actor.tenantId, actor.userId, q, limit, projectScope)
        : [],
      canReadUsers(actor) ? this.repository.searchPeople(actor.tenantId, q, limit) : [],
    ]);

    return [...projects, ...tasks, ...risks, ...people];
  }
}
