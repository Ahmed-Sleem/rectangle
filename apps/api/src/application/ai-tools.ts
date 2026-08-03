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
 * whatever a follow-up tool genuinely needs. Ids are kept where another tool
 * takes one; nothing else has one.
 *
 * NOTHING IS PUSHED. Every fact the model has, it asked for. The conversation
 * begins with the person's message and the system prompt and not one row of
 * company data — no project list, no activity digest, not even who they are.
 * If it needs to know where they are standing it calls `current_screen`; if it
 * needs their name it calls `whoami`. That is more round trips on the first
 * turn and it is the right trade: a prompt preloaded with context spends tokens
 * on every question that did not need it, and it teaches the model to answer
 * from a stale snapshot instead of looking.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import type { UserPrincipal } from "../domain/auth.js";
import type { AiToolExecutor } from "./ai-service.js";
import type { ActivityService } from "./activity-service.js";
import type { AdminService } from "./admin-service.js";
import type { DirectoryService } from "./directory-service.js";
import type { OverviewService } from "./overview-service.js";
import type { ProjectService } from "./project-service.js";
import type { ProjectTeamService } from "./project-team-service.js";
import type { RiskService } from "./risk-service.js";
import type { SearchService } from "./search-service.js";
import type { TaskService } from "./task-service.js";

/** How many rows a search hands back. Enough to answer, few enough to read. */
const SEARCH_LIMIT = 8;

/** How many rows a list hands back. Larger than a search: it is the whole set. */
const LIST_LIMIT = 30;

/** How much history "recently" means. A site manager's morning, not an audit. */
const ACTIVITY_LIMIT = 15;

/**
 * Where the person is standing, as the browser reported it.
 *
 * Carried on the principal for the duration of one request rather than stored,
 * because it is true for exactly as long as the request takes. It is also
 * advisory in the strictest sense: it names a route and some ids the person is
 * already looking at, and every tool that then reads one of those ids
 * re-authorises it from scratch. A client that lied about being on a project
 * would gain nothing, because naming a project is not the same as being allowed
 * to open it.
 */
export interface ScreenContext {
  /** The route, as the app knows it: "/projects/:projectId", "/tasks". */
  route?: string | undefined;
  /** A human name for the page, already translated for the person. */
  pageName?: string | undefined;
  projectId?: string | undefined;
  taskId?: string | undefined;
  riskId?: string | undefined;
}

/**
 * The screen context for the request currently being served.
 *
 * `AsyncLocalStorage` rather than a parameter threaded through the harness,
 * because the alternative is passing a value the ReAct loop has no interest in
 * through five call sites purely so one executor can read it. This is the
 * problem the API exists for: a value scoped to one asynchronous call tree.
 *
 * Empty outside a request, which is the honest answer — a sweeper or a test
 * calling an executor directly is not looking at any screen.
 */
export const screenContextStore = new AsyncLocalStorage<ScreenContext>();

export interface AiToolDependencies {
  searchService: Pick<SearchService, "search">;
  overviewService: Pick<OverviewService, "getSummary">;
  activityService: Pick<ActivityService, "list">;
  taskService: Pick<TaskService, "createTask" | "listTasks" | "getTask" | "updateTask" | "deleteTask">;
  riskService: Pick<RiskService, "createRisk" | "listRisks" | "getRisk" | "updateRisk" | "deleteRisk">;
  projectService: Pick<ProjectService, "createProject" | "getProject" | "updateProject">;
  projectTeamService: Pick<ProjectTeamService, "listMembers" | "addMember" | "removeMember">;
  directoryService: Pick<DirectoryService, "listColleagues">;
  adminService: Pick<AdminService, "createUser">;
}

/** Drops keys the caller did not set, so a partial update stays partial. */
function present<T extends Record<string, unknown>>(source: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(source).filter(([, value]) => value !== undefined),
  ) as Partial<T>;
}

/** A date the model can read, or nothing. Never a raw timestamp. */
function day(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length === 0) return undefined;
  return value.slice(0, 10);
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

  const taskShape = (task: Record<string, unknown>) => ({
    id: task.id,
    title: task.title,
    status: task.status,
    priority: task.priority,
    ...(day(task.dueDate) ? { dueDate: day(task.dueDate) } : {}),
    ...(task.assigneeUserId ? { assigneeUserId: task.assigneeUserId } : {}),
  });

  const riskShape = (risk: Record<string, unknown>) => ({
    id: risk.id,
    title: risk.title,
    kind: risk.kind,
    status: risk.status,
    ...(risk.probability ? { probability: risk.probability } : {}),
    ...(risk.impact ? { impact: risk.impact } : {}),
  });

  return {
    /* ── Knowing where it is and who it is helping ─────────────────────── */

    /*
     * Identity, asked for rather than pushed.
     *
     * The permission list is the useful part: it lets the assistant say "you
     * cannot do that" before proposing something that would be refused, which
     * is a much better experience than a confident proposal that dies at the
     * approval step.
     */
    whoami: async (actor: UserPrincipal) => ({
      userId: actor.userId,
      standing: actor.roles.includes("owner") ? "company owner" : "member",
      permissions: [...actor.permissions],
    }),

    /*
     * What is on their screen.
     *
     * This replaced a toggle in the composer that attached the current project
     * to every message. The toggle was the wrong shape twice over: it spent
     * tokens on context most questions did not need, and it could only ever
     * carry a project — so on Tasks, Risks or Team the assistant knew nothing.
     * Asking is strictly better. The model finds out when "this" is ambiguous
     * and not otherwise, and it can learn about any page rather than one.
     */
    current_screen: async () => {
      const screen = screenContextStore.getStore() ?? {};
      if (!screen.route && !screen.pageName) {
        return { note: "Rectangle could not tell which page they are on." };
      }
      return present({
        page: screen.pageName ?? screen.route,
        projectId: screen.projectId,
        taskId: screen.taskId,
        riskId: screen.riskId,
      });
    },

    /*
     * Their own history. Deliberately the `self` scope, which every signed-in
     * person may read about themselves, so this tool needs no permission beyond
     * using the assistant at all. `recent_activity` covers the team and needs
     * the permission that governs seeing other people's work.
     */
    my_activity: async (actor) => {
      const page = await dependencies.activityService.list(actor, {
        scope: "self",
        limit: ACTIVITY_LIMIT,
      });
      return {
        entries: page.entries.map((entry) => ({
          what: entry.action,
          when: entry.createdAt,
          ...(entry.projectName ? { project: entry.projectName } : {}),
        })),
      };
    },

    /* ── Reading the work ──────────────────────────────────────────────── */

    search_projects: searchOf("project"),
    search_tasks: searchOf("task"),
    search_risks: searchOf("risk"),

    get_project: async (actor, args) => {
      const project = (await dependencies.projectService.getProject(
        actor,
        args.projectId,
      )) as unknown as Record<string, unknown>;
      return present({
        id: project.id,
        name: project.name,
        code: project.code,
        status: project.status,
        description: project.description,
        startDate: day(project.startDate),
        endDate: day(project.endDate),
        budgetAmount: project.budgetAmount,
        budgetCurrency: project.budgetCurrency,
      });
    },

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

    list_tasks: async (actor, args) => {
      const tasks = await dependencies.taskService.listTasks(actor, {
        projectId: args.projectId,
        ...(args.status ? { status: args.status } : {}),
        limit: LIST_LIMIT,
      });
      if (tasks.length === 0) return { found: 0, note: "That project has no matching tasks." };
      return {
        found: tasks.length,
        tasks: tasks.map((task) => taskShape(task as unknown as Record<string, unknown>)),
      };
    },

    get_task: async (actor, args) => {
      const task = (await dependencies.taskService.getTask(
        actor,
        args.taskId,
      )) as unknown as Record<string, unknown>;
      return present({
        ...taskShape(task),
        description: task.description,
        projectId: task.projectId,
        startDate: day(task.startDate),
      });
    },

    list_risks: async (actor, args) => {
      const risks = await dependencies.riskService.listRisks(actor, {
        projectId: args.projectId,
        limit: LIST_LIMIT,
      });
      if (risks.length === 0) return { found: 0, note: "That project has no risks recorded." };
      return {
        found: risks.length,
        risks: risks.map((risk) => riskShape(risk as unknown as Record<string, unknown>)),
      };
    },

    get_risk: async (actor, args) => {
      const risk = (await dependencies.riskService.getRisk(
        actor,
        args.riskId,
      )) as unknown as Record<string, unknown>;
      return present({
        ...riskShape(risk),
        description: risk.description,
        mitigation: risk.mitigation,
        category: risk.category,
        projectId: risk.projectId,
        ownerUserId: risk.ownerUserId,
        dueDate: day(risk.dueDate),
      });
    },

    /* ── Reading people ────────────────────────────────────────────────── */

    /*
     * Ids are kept here, unlike most read tools, because assigning work needs
     * one. The email is not: the model has no tool that takes an email, and a
     * directory of addresses is precisely the thing not to hand a model that
     * might repeat it.
     */
    list_colleagues: async (actor) => {
      const { people } = await dependencies.directoryService.listColleagues(actor);
      return {
        found: people.length,
        people: people.map((person) => ({ id: person.id, name: person.displayName })),
      };
    },

    project_team: async (actor, args) => {
      const members = await dependencies.projectTeamService.listMembers(actor, args.projectId);
      return {
        found: members.length,
        members: members.map((member) => {
          const row = member as unknown as Record<string, unknown>;
          return present({ id: row.userId, name: row.name, role: row.role });
        }),
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

    /* ──────────────────────────────────────────────────────────────────────
     * The ones that change something.
     *
     * Ordinary calls into the same services the interface uses. What makes
     * them safe is not anything written here — it is that the harness never
     * reaches this code until a person has approved the proposal, and that the
     * arguments it runs with are re-read from the row written when the
     * proposal was made rather than taken from the request that approved it.
     * ────────────────────────────────────────────────────────────────────── */

    create_task: async (actor, args) =>
      dependencies.taskService.createTask(
        actor,
        args.projectId,
        present({
          title: args.title,
          description: args.description,
          priority: args.priority,
          dueDate: args.dueDate,
          assigneeUserId: args.assigneeUserId,
        }),
      ),

    update_task: async (actor, args) => {
      const { taskId, ...changes } = args;
      return dependencies.taskService.updateTask(actor, taskId, present(changes));
    },

    delete_task: async (actor, args) => {
      await dependencies.taskService.deleteTask(actor, args.taskId);
      return { deleted: true };
    },

    create_risk: async (actor, args) =>
      dependencies.riskService.createRisk(
        actor,
        args.projectId,
        present({
          title: args.title,
          description: args.description,
          kind: args.kind,
          category: args.category,
          probability: args.probability,
          impact: args.impact,
        }),
      ),

    update_risk: async (actor, args) => {
      const { riskId, ...changes } = args;
      return dependencies.riskService.updateRisk(actor, riskId, present(changes));
    },

    delete_risk: async (actor, args) => {
      await dependencies.riskService.deleteRisk(actor, args.riskId);
      return { deleted: true };
    },

    create_project: async (actor, args) =>
      dependencies.projectService.createProject(
        actor,
        present({ name: args.name, code: args.code, description: args.description }),
      ),

    update_project: async (actor, args) => {
      const { projectId, ...changes } = args;
      return dependencies.projectService.updateProject(actor, projectId, present(changes));
    },

    add_project_member: async (actor, args) =>
      dependencies.projectTeamService.addMember(actor, args.projectId, {
        userId: args.userId,
        role: args.role,
      }),

    remove_project_member: async (actor, args) => {
      await dependencies.projectTeamService.removeMember(actor, args.projectId, args.userId);
      return { removed: true };
    },

    create_user: async (actor, args) => {
      const { user } = await dependencies.adminService.createUser(
        actor,
        present({
          name: args.name,
          email: args.email,
          permissions: args.permissions ?? [],
        }),
      );
      const row = user as unknown as Record<string, unknown>;
      return { id: row.id, name: row.name, invited: true };
    },
  };
}
