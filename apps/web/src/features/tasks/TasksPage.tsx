/**
 * Tasks / work packages.
 *
 * Board and list are two drawings of the same query, never two datasets: the
 * columns are grouped from the rows the list already holds, so the two views
 * can never disagree about what exists.
 */
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { TFunction } from "i18next";
import { Columns3, Rows3 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { Link, useSearchParams } from "react-router";
import { z } from "zod";
import { ApiClientError } from "@/shared/api/client";
import { useOptionalAuth } from "@/shared/auth";
import { getCurrentLanguage } from "@/shared/i18n";
import {
  Badge, Button, buttonClassName, ConfirmDialog, DataTable, EmptyState, ErrorState,
  Field, FormDialog, Input, LoadingState, PageToolbar, Select, StatCard, StatRow, Textarea,
} from "@/shared/ui";
import {
  canOnAnyProject,
  getProjectCapabilities,
  listProjectMembers,
  listProjects,
} from "@/features/projects/project-api";
import {
  createTask, deleteTask, listTasks, updateTask,
  type TaskPriority, type TaskRecord, type TaskStatus,
} from "./task-api";
import { TaskDetail } from "./TaskDetail";
import "./TasksPage.css";

const STATUSES: readonly TaskStatus[] = ["todo", "in_progress", "blocked", "in_review", "done", "cancelled"];
const PRIORITIES: readonly TaskPriority[] = ["low", "medium", "high", "urgent"];

/** Columns shown on the board. Cancelled work is filtered, not displayed. */
const BOARD_COLUMNS: readonly TaskStatus[] = ["todo", "in_progress", "blocked", "in_review", "done"];

const taskSchema = z.object({
  projectId: z.string().min(1),
  title: z.string().trim().min(2).max(200),
  description: z.string().trim().max(4000).optional(),
  status: z.enum(STATUSES),
  priority: z.enum(PRIORITIES),
  assigneeUserId: z.string().optional(),
  startDate: z.string().optional(),
  dueDate: z.string().optional(),
}).superRefine((value, context) => {
  if (value.startDate && value.dueDate && value.dueDate < value.startDate) {
    context.addIssue({ code: "custom", path: ["dueDate"], message: "Due date cannot be before the start date." });
  }
});

type TaskForm = z.infer<typeof taskSchema>;
type ViewMode = "board" | "list";

const VIEW_STORAGE_KEY = "rectangle.tasks.view";

function readStoredView(): ViewMode {
  if (typeof window === "undefined") return "board";
  try {
    return window.localStorage.getItem(VIEW_STORAGE_KEY) === "list" ? "list" : "board";
  } catch {
    return "board";
  }
}

function storeView(value: ViewMode): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(VIEW_STORAGE_KEY, value);
  } catch {
    /* Private browsing must not break the toggle. */
  }
}

function priorityTone(priority: TaskPriority): "danger" | "warning" | "info" | "neutral" {
  if (priority === "urgent") return "danger";
  if (priority === "high") return "warning";
  if (priority === "medium") return "info";
  return "neutral";
}

function statusTone(status: TaskStatus): "success" | "warning" | "danger" | "info" | "neutral" {
  if (status === "done") return "success";
  if (status === "blocked") return "danger";
  if (status === "in_review") return "warning";
  if (status === "in_progress") return "info";
  return "neutral";
}

/** Whole days between today and a date, in the viewer's own timezone. */
function daysUntil(date: string): number {
  const target = new Date(`${date}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

function describeDue(task: TaskRecord, t: TFunction): string {
  if (!task.dueDate) return t("tasks.noDueDate");
  const days = daysUntil(task.dueDate);
  if (days === 0) return t("tasks.dueToday");
  if (days < 0) return t("tasks.overdueBy", { count: Math.abs(days) });
  return t("tasks.dueIn", { count: days });
}

/** Overdue only counts while the work is still open; finished late is not due. */
function isOverdue(task: TaskRecord): boolean {
  if (!task.dueDate || task.status === "done" || task.status === "cancelled") return false;
  return daysUntil(task.dueDate) < 0;
}

export default function TasksPage() {
  const { t } = useTranslation();
  const language = getCurrentLanguage();
  const auth = useOptionalAuth();
  const queryClient = useQueryClient();

  // Arriving from a project workspace pre-selects that project, so the link
  // lands on that project's board rather than the whole portfolio.
  const [searchParams, setSearchParams] = useSearchParams();

  const [view, setView] = useState<ViewMode>(() => readStoredView());
  const [search, setSearch] = useState("");
  const [projectFilter, setProjectFilter] = useState(() => searchParams.get("projectId") ?? "");
  const [priorityFilter, setPriorityFilter] = useState<TaskPriority | "">("");
  const [mineOnly, setMineOnly] = useState(false);
  const [openOnly, setOpenOnly] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<TaskRecord | null>(null);
  const [pendingDelete, setPendingDelete] = useState<TaskRecord | null>(null);
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);

  /*
   * One flag per action, because they are separate grants now. Presentation
   * only — the server decides — but offering a button whose request would be
   * refused is a worse lie than not offering it.
   */

  const filters = {
    ...(projectFilter ? { projectId: projectFilter } : {}),
    ...(priorityFilter ? { priority: priorityFilter } : {}),
    ...(search.trim() ? { search: search.trim() } : {}),
    ...(mineOnly ? { mine: true } : {}),
    ...(openOnly ? { openOnly: true } : {}),
  };

  const tasksQuery = useQuery({
    queryKey: ["tasks", filters],
    queryFn: () => listTasks(filters),
    placeholderData: (previous) => previous,
  });
  const projectsQuery = useQuery({ queryKey: ["projects", {}], queryFn: () => listProjects() });
  const projects = useMemo(() => projectsQuery.data?.projects ?? [], [projectsQuery.data]);
  const projectIds = useMemo(() => projects.map((project) => project.id), [projects]);

  /*
   * Asked of the server, per project, rather than derived from the
   * company-wide permission here.
   *
   * The permission alone was wrong in both directions. It offered a Create
   * button to somebody holding `tasks.create` on a project they are not on,
   * where the server refuses — and it withheld the button from a project
   * manager whose project role grants the action but who holds nothing
   * company-wide, which made the appointment decorative. Reach and capability
   * are one question and the server is the only place that answers it.
   */
  const capabilitiesQuery = useQuery({
    queryKey: ["projects", "capabilities", projectIds],
    queryFn: () => getProjectCapabilities(projectIds),
    enabled: projectIds.length > 0,
  });
  const capabilities = capabilitiesQuery.data?.capabilities ?? {};

  /** Whether a Create button belongs on the toolbar at all. */
  const canCreateSomewhere = canOnAnyProject(capabilities, "createTask");
  /** The projects a new task may actually be filed against. */
  const creatableProjects = useMemo(
    () => projects.filter((project) => capabilities[project.id]?.createTask),
    [projects, capabilities],
  );

  const form = useForm<TaskForm>({
    resolver: zodResolver(taskSchema),
    defaultValues: {
      projectId: "", title: "", description: "", status: "todo",
      priority: "medium", assigneeUserId: "", startDate: "", dueDate: "",
    },
  });

  // The edit form is filled from the record being edited, so reopening never
  // shows the previous task's values.
  useEffect(() => {
    if (editing) {
      form.reset({
        projectId: editing.projectId,
        title: editing.title,
        description: editing.description ?? "",
        status: editing.status,
        priority: editing.priority,
        assigneeUserId: editing.assigneeUserId ?? "",
        startDate: editing.startDate ?? "",
        dueDate: editing.dueDate ?? "",
      });
    }
  }, [editing, form]);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["tasks"] });

  const create = useMutation({
    mutationFn: (values: TaskForm) =>
      createTask(values.projectId, {
        title: values.title,
        status: values.status,
        priority: values.priority,
        ...(values.description ? { description: values.description } : {}),
        ...(values.assigneeUserId ? { assigneeUserId: values.assigneeUserId } : {}),
        ...(values.startDate ? { startDate: values.startDate } : {}),
        ...(values.dueDate ? { dueDate: values.dueDate } : {}),
      }),
    onSuccess: async () => { await invalidate(); form.reset(); setCreateOpen(false); },
  });

  const save = useMutation({
    mutationFn: ({ taskId, values }: { taskId: string; values: TaskForm }) =>
      updateTask(taskId, {
        title: values.title,
        status: values.status,
        priority: values.priority,
        // Empty means cleared, which the API expresses as null.
        description: values.description || null,
        assigneeUserId: values.assigneeUserId || null,
        startDate: values.startDate || null,
        dueDate: values.dueDate || null,
      }),
    onSuccess: async () => { await invalidate(); setEditing(null); },
  });

  const move = useMutation({
    mutationFn: ({ taskId, status }: { taskId: string; status: TaskStatus }) =>
      updateTask(taskId, { status }),
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: (taskId: string) => deleteTask(taskId),
    onSuccess: async () => { await invalidate(); setPendingDelete(null); },
  });

  const messageFor = (error: unknown, fallback: string) =>
    error instanceof ApiClientError ? error.message : error ? fallback : null;

  function clearFilters() {
    setSearch(""); setProjectFilter(""); setPriorityFilter("");
    setMineOnly(false); setOpenOnly(false);
    setSearchParams({}, { replace: true });
  }

  const rows = useMemo(() => tasksQuery.data?.tasks ?? [], [tasksQuery.data]);
  /** The open task, so its own project decides what may be done to it. */
  const openTask = useMemo(
    () => rows.find((task) => task.id === openTaskId) ?? null,
    [rows, openTaskId],
  );
  const isFiltered = Boolean(search.trim() || projectFilter || priorityFilter || mineOnly || openOnly);

  const overdueCount = rows.filter(isOverdue).length;
  const openCount = rows.filter((task) => task.status !== "done" && task.status !== "cancelled").length;
  const dueSoonCount = rows.filter((task) => {
    if (!task.dueDate || task.status === "done" || task.status === "cancelled") return false;
    const days = daysUntil(task.dueDate);
    return days >= 0 && days <= 7;
  }).length;
  const mineCount = rows.filter((task) => task.assigneeUserId === auth?.user?.userId).length;

  // Grouped from the same rows the list renders, so the views cannot diverge.
  const byStatus = useMemo(() => {
    const groups = new Map<TaskStatus, TaskRecord[]>();
    for (const status of BOARD_COLUMNS) groups.set(status, []);
    for (const task of rows) groups.get(task.status)?.push(task);
    return groups;
  }, [rows]);

  const selectedProjectId = form.watch("projectId");
  const dateFormatter = new Intl.DateTimeFormat(language, { dateStyle: "medium" });

  if (tasksQuery.isError) {
    return (
      <ErrorState
        title={t("tasks.errorTitle")}
        message={t("tasks.errorMessage")}
        action={<Button variant="secondary" onClick={() => void tasksQuery.refetch()}>{t("tasks.tryAgain")}</Button>}
      />
    );
  }

  if (tasksQuery.isLoading) {
    return <LoadingState title={t("tasks.loadingTitle")} message={t("tasks.loadingMessage")} />;
  }

  function renderCard(task: TaskRecord) {
    return (
      <article key={task.id} className="rect-task" role="listitem">
        <button type="button" className="rect-task__open" onClick={() => setOpenTaskId(task.id)}>
          <span className="rect-task__head">
            <Badge tone={priorityTone(task.priority)}>{t(`enums.taskPriority.${task.priority}`)}</Badge>
            {isOverdue(task) ? <Badge tone="danger">{describeDue(task, t)}</Badge> : null}
          </span>
          <span className="rect-task__title">{task.title}</span>
          <span className="rect-task__meta">
            <span>{task.projectCode}</span>
            <span>{task.assigneeName ?? t("tasks.unassigned")}</span>
          </span>
          <span className="rect-task__meta">
            <span>{isOverdue(task) ? "" : describeDue(task, t)}</span>
            {task.commentCount > 0 ? <span>{t("tasks.commentCount", { count: task.commentCount })}</span> : null}
          </span>
        </button>
      </article>
    );
  }

  return (
    <section className="rect-tasks-page" aria-label={t("tasks.pageLabel")}>
      <PageToolbar<ViewMode>
        refresh={{
          onRefresh: () => {
            void queryClient.invalidateQueries({ queryKey: ["tasks"] });
          },
          pending: tasksQuery.isFetching,
        }}
        search={{
          value: search,
          onChange: setSearch,
          label: t("tasks.searchLabel"),
          placeholder: t("tasks.searchPlaceholder"),
        }}
        filters={[
          {
            id: "project",
            type: "select",
            label: t("tasks.filterProject"),
            anyLabel: t("tasks.allProjects"),
            value: projectFilter,
            options: projects.map((project) => ({ value: project.id, label: project.name })),
            onChange: (value) => {
              setProjectFilter(value);
              // Keeps the address honest so the view can be shared or reloaded.
              setSearchParams(value ? { projectId: value } : {}, { replace: true });
            },
          },
          {
            id: "priority",
            type: "select",
            label: t("tasks.filterPriority"),
            anyLabel: t("tasks.allPriorities"),
            value: priorityFilter,
            options: PRIORITIES.map((value) => ({
              value,
              label: t(`enums.taskPriority.${value}`),
            })),
            onChange: (value) => setPriorityFilter(value as TaskPriority | ""),
          },
          { id: "mine", type: "toggle", label: t("tasks.onlyMine"), value: mineOnly, onChange: setMineOnly },
          { id: "open", type: "toggle", label: t("tasks.openOnly"), value: openOnly, onChange: setOpenOnly },
        ]}
        onClearFilters={clearFilters}
        actions={
          canCreateSomewhere ? (
            <Button variant="primary" onClick={() => { form.reset(); setCreateOpen(true); }}>
              {t("tasks.create")}
            </Button>
          ) : null
        }
        view={{
          value: view,
          label: t("tasks.boardView"),
          onChange: (next) => { setView(next); storeView(next); },
          options: [
            { value: "board", label: t("tasks.boardView"), icon: <Columns3 size={16} strokeWidth={2} aria-hidden /> },
            { value: "list", label: t("tasks.tableView"), icon: <Rows3 size={16} strokeWidth={2} aria-hidden /> },
          ],
        }}
      />

      {rows.length > 0 ? (
        <StatRow label={t("tasks.pageLabel")}>
          <StatCard label={t("tasks.kpiOpen")} value={openCount} />
          <StatCard label={t("tasks.kpiOverdue")} value={overdueCount} emphasis={overdueCount > 0} />
          <StatCard label={t("tasks.kpiDueSoon")} value={dueSoonCount} />
          <StatCard label={t("tasks.kpiMine")} value={mineCount} />
        </StatRow>
      ) : null}

      {projects.length === 0 ? (
        <EmptyState
          title={t("tasks.noProjectsTitle")}
          message={t("tasks.noProjectsMessage")}
          action={<Link className={buttonClassName("primary")} to="/projects">{t("tasks.goToProjects")}</Link>}
        />
      ) : rows.length === 0 && isFiltered ? (
        <EmptyState
          title={t("tasks.noMatchTitle")}
          message={t("tasks.noMatchMessage")}
          action={
            <Button variant="secondary" onClick={clearFilters}>
              {t("tasks.clearFilters")}
            </Button>
          }
        />
      ) : rows.length === 0 ? (
        <EmptyState
          title={t("tasks.emptyTitle")}
          message={canCreateSomewhere ? t("tasks.emptyManage") : t("tasks.emptyRead")}
          {...(canCreateSomewhere
            ? { action: <Button variant="primary" onClick={() => setCreateOpen(true)}>{t("tasks.create")}</Button> }
            : {})}
        />
      ) : view === "board" ? (
        <div className="rect-board" aria-label={t("tasks.boardLabel")}>
          {BOARD_COLUMNS.map((status) => {
            const column = byStatus.get(status) ?? [];
            return (
              <section key={status} className="rect-board__column" aria-label={t(`enums.taskStatus.${status}`)}>
                <header className="rect-board__head">
                  <span className="rect-board__title">{t(`enums.taskStatus.${status}`)}</span>
                  <span className="rect-board__count">{column.length}</span>
                </header>
                <div className="rect-board__body" role="list">
                  {column.length === 0 ? (
                    <p className="rect-board__empty">{t("tasks.emptyColumn")}</p>
                  ) : (
                    column.map(renderCard)
                  )}
                </div>
              </section>
            );
          })}
        </div>
      ) : (
        <DataTable
          caption={t("tasks.listLabel")}
          rows={rows}
          getRowKey={(task) => task.id}
          columns={[
            {
              id: "title",
              header: t("tasks.fieldTitle"),
              accessor: (task) => (
                <button type="button" className="rect-tasks__link" onClick={() => setOpenTaskId(task.id)}>
                  {task.title}
                </button>
              ),
            },
            { id: "project", header: t("tasks.fieldProject"), accessor: (task) => task.projectCode },
            {
              id: "status",
              header: t("tasks.fieldStatus"),
              accessor: (task) => <Badge tone={statusTone(task.status)}>{t(`enums.taskStatus.${task.status}`)}</Badge>,
            },
            {
              id: "priority",
              header: t("tasks.fieldPriority"),
              accessor: (task) => <Badge tone={priorityTone(task.priority)}>{t(`enums.taskPriority.${task.priority}`)}</Badge>,
            },
            { id: "assignee", header: t("tasks.fieldAssignee"), accessor: (task) => task.assigneeName ?? t("tasks.unassigned") },
            {
              id: "due",
              header: t("tasks.fieldDue"),
              accessor: (task) =>
                task.dueDate ? (
                  <span className={isOverdue(task) ? "rect-tasks__overdue" : undefined}>
                    {dateFormatter.format(new Date(`${task.dueDate}T00:00:00`))}
                  </span>
                ) : (
                  t("common.notAvailable")
                ),
            },
          ]}
        />
      )}

      <TaskDetail
        taskId={openTaskId}
        tasks={rows}
        /*
         * Per task, from the project it belongs to. One flag for the whole
         * list would be wrong the moment somebody manages one project and only
         * reads another, which is the ordinary case for a site engineer.
         */
        canEdit={openTask ? (capabilities[openTask.projectId]?.editTask ?? false) : false}
        canDelete={openTask ? (capabilities[openTask.projectId]?.deleteTask ?? false) : false}
        onClose={() => setOpenTaskId(null)}
        onEdit={(task) => { setOpenTaskId(null); setEditing(task); }}
        onDelete={(task) => { setOpenTaskId(null); setPendingDelete(task); }}
        onMove={(task, status) => move.mutate({ taskId: task.id, status })}
        moving={move.isPending}
      />

      <FormDialog
        open={createOpen || editing !== null}
        title={editing ? t("tasks.edit") : t("tasks.create")}
        description={editing ? t("tasks.editDescription") : t("tasks.createDescription")}
        size="lg"
        onClose={() => { setCreateOpen(false); setEditing(null); }}
        onSubmit={form.handleSubmit((values) =>
          editing ? save.mutate({ taskId: editing.id, values }) : create.mutate(values),
        )}
        submitLabel={editing ? t("tasks.saveChanges") : t("tasks.create")}
        pending={create.isPending || save.isPending}
        error={messageFor(editing ? save.error : create.error, t(editing ? "tasks.updateFailed" : "tasks.createFailed"))}
      >
        <Field label={t("tasks.fieldProject")} error={form.formState.errors.projectId?.message} required>
          {/*
            * Only projects this person may actually file work against. Listing
            * the rest invites choosing one and meeting a refusal on submit,
            * with the form already filled in. When editing, the project is
            * fixed and the field is read-only, so the full list is right —
            * otherwise a task on a project you can edit but not create in
            * would show an empty selector.
            */}
          <Select disabled={editing !== null} {...form.register("projectId")}>
            <option value="">{t("tasks.allProjects")}</option>
            {(editing ? projects : creatableProjects).map((project) => (
              <option key={project.id} value={project.id}>{project.name}</option>
            ))}
          </Select>
        </Field>
        <Field label={t("tasks.fieldTitle")} error={form.formState.errors.title?.message} required>
          <Input data-autofocus="true" {...form.register("title")} />
        </Field>
        <div className="rect-tasks-form__split">
          <Field label={t("tasks.fieldStatus")} error={form.formState.errors.status?.message} required>
            <Select {...form.register("status")}>
              {STATUSES.map((value) => (
                <option key={value} value={value}>{t(`enums.taskStatus.${value}`)}</option>
              ))}
            </Select>
          </Field>
          <Field label={t("tasks.fieldPriority")} error={form.formState.errors.priority?.message} required>
            <Select {...form.register("priority")}>
              {PRIORITIES.map((value) => (
                <option key={value} value={value}>{t(`enums.taskPriority.${value}`)}</option>
              ))}
            </Select>
          </Field>
        </div>
        <AssigneeField
          projectId={selectedProjectId}
          value={form.watch("assigneeUserId") ?? ""}
          onChange={(value) => form.setValue("assigneeUserId", value)}
        />
        <div className="rect-tasks-form__split">
          <Field label={t("tasks.fieldStart")} error={form.formState.errors.startDate?.message}>
            <Input type="date" {...form.register("startDate")} />
          </Field>
          <Field label={t("tasks.fieldDue")} error={form.formState.errors.dueDate?.message}>
            <Input type="date" {...form.register("dueDate")} />
          </Field>
        </div>
        <Field label={t("tasks.fieldDescription")} error={form.formState.errors.description?.message}>
          <Textarea rows={3} {...form.register("description")} />
        </Field>
      </FormDialog>

      <ConfirmDialog
        open={pendingDelete !== null}
        title={t("tasks.deleteTitle")}
        description={t("tasks.deleteMessage", { title: pendingDelete?.title ?? "" })}
        confirmLabel={t("tasks.delete")}
        cancelLabel={t("common.cancel")}
        tone="danger"
        pending={remove.isPending}
        onClose={() => setPendingDelete(null)}
        onConfirm={() => { if (pendingDelete) remove.mutate(pendingDelete.id); }}
      />
    </section>
  );
}

/**
 * Assignee choices come from the selected project's team, because the backend
 * refuses anyone else. Offering the whole company here would produce a form
 * that looks valid and fails on submit.
 */
function AssigneeField({
  projectId,
  value,
  onChange,
}: {
  projectId: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const { t } = useTranslation();
  const members = useQuery({
    queryKey: ["project", projectId, "members"],
    queryFn: () => listProjectMembers(projectId),
    enabled: Boolean(projectId),
  });

  return (
    <Field label={t("tasks.fieldAssignee")} hint={t("tasks.assigneeHint")}>
      <Select
        value={value}
        disabled={!projectId || members.isLoading}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">{t("tasks.unassigned")}</option>
        {(members.data?.members ?? []).map((member) => (
          <option key={member.userId} value={member.userId}>{member.displayName}</option>
        ))}
      </Select>
    </Field>
  );
}
