/**
 * What each tool actually does.
 *
 * Every one is a thin call into a service the interface already uses. That is
 * the whole security argument for the assistant: it is a caller like the
 * browser is, holding the same principal and passing through the same
 * authority checks, so it cannot reach a record the person could not open
 * themselves. There is no query path here that exists only for the model.
 *
 * The other job of this file is deciding what comes *back*. A database row is
 * the wrong shape to hand a language model: internal ids, tenant ids and
 * timestamps cost tokens on every turn, invite the model to quote them at
 * people, and disclose more of the system's shape than an answer needs.
 * Published guidance measures roughly a threefold reduction in tokens from
 * stripping them, and the correctness argument is stronger than the cost one —
 * a model that never sees a tenant id cannot mention one.
 *
 * So each executor returns the smallest thing that can answer a question, plus
 * whatever a follow-up tool genuinely needs. `search_projects` keeps the
 * project id because `create_task` requires one; nothing else does, so nothing
 * else has one.
 */
import type { AiToolExecutor } from "./ai-service.js";
import type { ActivityService } from "./activity-service.js";
import type { OverviewService } from "./overview-service.js";
import type { RiskService } from "./risk-service.js";
import type { SearchService } from "./search-service.js";
import type { TaskService } from "./task-service.js";

/** How many rows a search hands back. Enough to answer, few enough to read. */
const SEARCH_LIMIT = 8;

/** How much history "recently" means. A site manager's morning, not an audit. */
const ACTIVITY_LIMIT = 15;

export interface AiToolDependencies {
  searchService: Pick<SearchService, "search">;
  overviewService: Pick<OverviewService, "getSummary">;
  activityService: Pick<ActivityService, "list">;
  taskService: Pick<TaskService, "createTask">;
  riskService: Pick<RiskService, "createRisk">;
}

export function createAiToolExecutors(
  dependencies: AiToolDependencies,
): Record<string, AiToolExecutor> {
  /**
   * Search is one service answering four kinds, so each tool asks for all of
   * them and keeps its own. Filtering here rather than adding a kind parameter
   * to the service keeps the search rules in one place — the palette and the
   * assistant find things the same way, including the Arabic folding and the
   * typo tolerance.
   */
  const searchOf =
    (kind: "project" | "task" | "risk"): AiToolExecutor =>
    async (actor, args) => {
      const results = await dependencies.searchService.search(actor, {
        q: String(args.query ?? ""),
        limit: SEARCH_LIMIT,
      });

      const matching = results.filter((result) => result.kind === kind);
      if (matching.length === 0) {
        // A sentence, not an empty array: models narrate an empty list as
        // "there are none", which is a different claim from "none matched".
        return { found: 0, note: "Nothing matched that search." };
      }

      return {
        found: matching.length,
        results: matching.map((result) => ({
          // Kept because a follow-up tool needs it. The others are dropped.
          id: result.id,
          title: result.title,
          ...(result.subtitle ? { detail: result.subtitle } : {}),
        })),
      };
    };

  return {
    search_projects: searchOf("project"),
    search_tasks: searchOf("task"),
    search_risks: searchOf("risk"),

    project_overview: async (actor) => {
      const summary = await dependencies.overviewService.getSummary(actor, {});
      return {
        totalProjects: summary.totalProjects,
        byStatus: summary.statusCounts.map((row) => ({ status: row.status, count: row.count })),
        budgets: summary.budgets.map((row) => ({ currency: row.currency, amount: row.amount })),
        /*
         * Names only. The attention list carries scores and internal reasons
         * that mean nothing to a reader and would be quoted verbatim if the
         * model saw them.
         */
        needingAttention: summary.attention.map((project) => project.name),
      };
    },

    recent_activity: async (actor) => {
      /*
       * `team` scope, which `activity.read_team` is exactly the permission
       * for — and the tool requires that permission, so this cannot be a
       * scope the caller may not ask for. The service checks again anyway.
       */
      const page = await dependencies.activityService.list(actor, {
        scope: "team",
        limit: ACTIVITY_LIMIT,
      });

      return {
        entries: page.entries.map((entry) => ({
          who: entry.actorName ?? "Someone",
          what: entry.action,
          when: entry.createdAt,
          ...(entry.projectName ? { project: entry.projectName } : {}),
        })),
      };
    },

    /*
     * The two that change something. They are ordinary calls into the same
     * services the interface uses — the thing that makes them safe is not
     * anything here, it is that the harness never reaches this code until a
     * person has approved the proposal.
     */
    create_task: async (actor, args) =>
      dependencies.taskService.createTask(actor, args.projectId, {
        title: args.title,
        ...(args.description ? { description: args.description } : {}),
      }),

    create_risk: async (actor, args) =>
      dependencies.riskService.createRisk(actor, args.projectId, {
        title: args.title,
        ...(args.description ? { description: args.description } : {}),
      }),
  };
}
