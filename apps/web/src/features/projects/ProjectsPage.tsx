/** Projects page lists and creates real tenant-owned project records. */
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { z } from "zod";
import { ApiClientError } from "@/shared/api/client";
import {
  AvatarGroup, Badge, Button, CardGrid, DataTable, EmptyState, ErrorState, Field,
  FormDialog, Input, PageToolbar, ProgressBar, Select, StatCard, StatRow, Textarea,
} from "@/shared/ui";
import { LayoutGrid, Rows3 } from "lucide-react";
import { useOptionalAuth } from "@/shared/auth";
import { createProject, listProjects, type CreateProjectPayload, type ProjectRecord, type ProjectStatus } from "./project-api";
import "./ProjectsPage.css";

const createProjectSchema = z.object({
  name: z.string().trim().min(2).max(120),
  code: z.string().trim().min(2).max(40).regex(/^[A-Z0-9][A-Z0-9._-]*$/u),
  status: z.enum(["planned", "active", "on_hold", "completed", "archived"]),
  locationName: z.string().trim().max(160).optional(),
  description: z.string().trim().max(2000).optional(),
  plannedStartDate: z.string().optional(),
  plannedFinishDate: z.string().optional(),
  budgetAmount: z.string().trim().regex(/^\d{1,12}(\.\d{1,2})?$/u).optional().or(z.literal("")),
  budgetCurrency: z.string().trim().regex(/^[A-Z]{3}$/u).optional().or(z.literal("")),
}).superRefine((value, context) => {
  if (value.plannedStartDate && value.plannedFinishDate && value.plannedFinishDate < value.plannedStartDate) {
    context.addIssue({ code: "custom", path: ["plannedFinishDate"], message: "Finish date cannot be before start date." });
  }
  if (value.budgetAmount && !value.budgetCurrency) {
    context.addIssue({ code: "custom", path: ["budgetCurrency"], message: "Currency is required when budget is provided." });
  }
});

type ProjectForm = z.infer<typeof createProjectSchema>;

function toPayload(values: ProjectForm): CreateProjectPayload {
  return {
    name: values.name,
    code: values.code.toUpperCase(),
    status: values.status,
    ...(values.description ? { description: values.description } : {}),
    ...(values.locationName ? { locationName: values.locationName } : {}),
    ...(values.plannedStartDate ? { plannedStartDate: values.plannedStartDate } : {}),
    ...(values.plannedFinishDate ? { plannedFinishDate: values.plannedFinishDate } : {}),
    ...(values.budgetAmount ? { budgetAmount: values.budgetAmount } : {}),
    ...(values.budgetCurrency ? { budgetCurrency: values.budgetCurrency.toUpperCase() } : {}),
  };
}

const STATUS_VALUES = ["planned", "active", "on_hold", "completed", "archived"] as const;

function statusTone(status: ProjectStatus): "success" | "warning" | "info" | "neutral" {
  if (status === "active") return "success";
  if (status === "on_hold") return "warning";
  if (status === "completed") return "info";
  return "neutral";
}

type SortKey = "name" | "code" | "status" | "updatedAt";
type ViewMode = "cards" | "table";

const VIEW_STORAGE_KEY = "rectangle.projects.view";

/** The chosen layout is a preference, so it survives navigation and reloads. */
function readStoredView(): ViewMode {
  if (typeof window === "undefined") return "cards";
  try {
    return window.localStorage.getItem(VIEW_STORAGE_KEY) === "table" ? "table" : "cards";
  } catch {
    return "cards";
  }
}

function storeView(value: ViewMode): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(VIEW_STORAGE_KEY, value);
  } catch {
    /* Private browsing should not break the toggle. */
  }
}

function compareProjects(a: ProjectRecord, b: ProjectRecord, key: SortKey): number {
  if (key === "updatedAt") return b.updatedAt.localeCompare(a.updatedAt);
  // Arabic and English project names must both sort naturally.
  return a[key].localeCompare(b[key], undefined, { numeric: true, sensitivity: "base" });
}

export default function ProjectsPage() {
  const [createOpen, setCreateOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<ProjectStatus | "">("");
  const [sortKey, setSortKey] = useState<SortKey>("updatedAt");
  const [view, setView] = useState<ViewMode>(() => readStoredView());
  const { t } = useTranslation();
  const auth = useOptionalAuth();

  // Only offer creation to people whose request would actually succeed.
  const canManage =
    auth?.user?.roles.some((role) =>
      ["tenant_owner", "tenant_admin", "project_admin", "project_manager"].includes(role),
    ) || auth?.user?.permissions.includes("projects.manage") || false;

  const queryClient = useQueryClient();
  const filters = { ...(search.trim() ? { search: search.trim() } : {}), ...(status ? { status } : {}) };
  const projects = useQuery({
    queryKey: ["projects", filters],
    queryFn: () => listProjects(filters),
    placeholderData: (previous) => previous,
  });
  const form = useForm<ProjectForm>({
    resolver: zodResolver(createProjectSchema),
    defaultValues: {
      name: "",
      code: "",
      status: "planned",
      locationName: "",
      description: "",
      plannedStartDate: "",
      plannedFinishDate: "",
      budgetAmount: "",
      budgetCurrency: "",
    },
  });

  const create = useMutation({
    mutationFn: (values: ProjectForm) => createProject(toPayload(values)),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["projects"] });
      form.reset();
      setCreateOpen(false);
    },
  });

  const rows = useMemo(
    () => [...(projects.data?.projects ?? [])].sort((a, b) => compareProjects(a, b, sortKey)),
    [projects.data?.projects, sortKey],
  );
  const isFiltered = Boolean(search.trim() || status);

  // Headline figures come from the records already loaded; nothing is invented.
  const all = projects.data?.projects ?? [];
  const countBy = (value: ProjectStatus) => all.filter((project) => project.status === value).length;
  const archivedCount = countBy("archived");
  const errorMessage = create.error instanceof ApiClientError ? create.error.message : create.error ? t("projects.createFailed") : null;

  return (
    <section className="rect-projects-page" aria-label={t("projects.workspaceLabel")}>
      <PageToolbar<ViewMode>
        search={{
          value: search,
          onChange: setSearch,
          label: t("projects.searchLabel"),
          placeholder: t("projects.searchPlaceholder"),
        }}
        filters={[
          {
            id: "status",
            type: "select",
            label: t("projects.filterStatus"),
            anyLabel: t("projects.allStatuses"),
            value: status,
            options: STATUS_VALUES.map((value) => ({
              value,
              label: t(`enums.projectStatus.${value}`),
            })),
            onChange: (value) => setStatus(value as ProjectStatus | ""),
          },
          {
            id: "sort",
            type: "select",
            label: t("projects.sortLabel"),
            // Sorting always has a value, so "recently updated" is the
            // default rather than an absence, and never shows as a filter.
            anyLabel: t("projects.sortRecent"),
            value: sortKey === "updatedAt" ? "" : sortKey,
            options: [
              { value: "name", label: t("projects.sortName") },
              { value: "code", label: t("projects.sortCode") },
              { value: "status", label: t("projects.sortStatus") },
            ],
            onChange: (value) => setSortKey((value || "updatedAt") as SortKey),
          },
        ]}
        onClearFilters={() => { setSearch(""); setStatus(""); setSortKey("updatedAt"); }}
        actions={
          canManage ? (
            <Button variant="primary" onClick={() => setCreateOpen(true)}>{t("projects.create")}</Button>
          ) : null
        }
        view={{
          value: view,
          label: t("projects.cardView"),
          onChange: (next) => { setView(next); storeView(next); },
          options: [
            { value: "cards", label: t("projects.cardView"), icon: <LayoutGrid size={16} strokeWidth={2} aria-hidden /> },
            { value: "table", label: t("projects.tableView"), icon: <Rows3 size={16} strokeWidth={2} aria-hidden /> },
          ],
        }}
      />

      {all.length > 0 ? (
        <StatRow label={t("projects.register")}>
          <StatCard
            label={t("projects.kpiTotal")}
            value={all.length}
            {...(archivedCount > 0 ? { hint: t("projects.kpiArchivedSuffix", { count: archivedCount }) } : {})}
          />
          <StatCard label={t("projects.kpiActive")} value={countBy("active")} emphasis />
          <StatCard label={t("projects.kpiOnHold")} value={countBy("on_hold")} />
          <StatCard label={t("projects.kpiCompleted")} value={countBy("completed")} />
        </StatRow>
      ) : null}

      {projects.isError ? (
        <ErrorState
          title={t("projects.listErrorTitle")}
          message={t("projects.listErrorMessage")}
          action={<Button variant="secondary" onClick={() => void projects.refetch()}>{t("projects.tryAgain")}</Button>}
        />
      ) : projects.isLoading ? (
        <EmptyState title={t("projects.loadingTitle")} message={t("projects.loadingMessage")} />
      ) : rows.length === 0 && isFiltered ? (
        <EmptyState
          title={t("projects.noMatchTitle")}
          message={t("projects.noMatchMessage")}
          action={<Button variant="secondary" onClick={() => { setSearch(""); setStatus(""); }}>{t("projects.clearFilters")}</Button>}
        />
      ) : rows.length === 0 ? (
        <EmptyState
          title={t("projects.emptyTitle")}
          message={canManage
            ? t("projects.emptyManage")
            : t("projects.emptyRead")}
          {...(canManage
            ? { action: <Button variant="primary" onClick={() => setCreateOpen(true)}>{t("projects.create")}</Button> }
            : {})}
        />
      ) : view === "cards" ? (
        <CardGrid label={t("projects.register")}>
          {rows.map((project) => (
            <Link
              key={project.id}
              className="rect-project-card"
              to={`/projects/${project.id}`}
              role="listitem"
              // Without this the accessible name becomes the whole card's text.
              aria-label={project.name}
            >
              <span className="rect-project-card__head">
                <Badge tone={statusTone(project.status)}>{t(`enums.projectStatus.${project.status}`)}</Badge>
                <span className="rect-project-card__code">{project.code}</span>
              </span>
              <span className="rect-project-card__name">{project.name}</span>
              {project.description ? (
                <span className="rect-project-card__description">{project.description}</span>
              ) : null}
              {project.totalTasks ? (
                <ProgressBar
                  done={project.doneTasks ?? 0}
                  total={project.totalTasks}
                  label={t("projects.progressLabel", { name: project.name })}
                />
              ) : null}
              <span className="rect-project-card__meta">
                <span>{project.locationName ?? t("projects.notSet")}</span>
                <span>
                  {project.plannedStartDate && project.plannedFinishDate
                    ? `${project.plannedStartDate} → ${project.plannedFinishDate}`
                    : t("projects.notSet")}
                </span>
              </span>
              {/* Who is on this, from real membership rows rather than a count. */}
              <AvatarGroup
                names={project.memberNames ?? []}
                {...(project.memberCount !== undefined ? { total: project.memberCount } : {})}
                label={t("projects.teamLabel", { name: project.name })}
                emptyLabel={t("projects.noMembersYet")}
              />
            </Link>
          ))}
        </CardGrid>
      ) : (
        <DataTable
          caption={t("projects.register")}
          columns={[
            { id: "name", header: t("projects.columnProject"), accessor: (project) => <Link className="rect-projects-link" to={`/projects/${project.id}`}>{project.name}</Link> },
            { id: "code", header: t("projects.columnCode"), accessor: (project) => project.code },
            { id: "status", header: t("projects.columnStatus"), accessor: (project) => <Badge tone={statusTone(project.status)}>{t(`enums.projectStatus.${project.status}`)}</Badge> },
            {
              id: "progress",
              header: t("projects.columnProgress"),
              accessor: (project) =>
                project.totalTasks ? (
                  <ProgressBar
                    done={project.doneTasks ?? 0}
                    total={project.totalTasks}
                    label={t("projects.progressLabel", { name: project.name })}
                    showCounts={false}
                  />
                ) : (
                  t("common.notAvailable")
                ),
            },
            { id: "location", header: t("projects.columnLocation"), accessor: (project) => project.locationName ?? t("common.notAvailable") },
            { id: "dates", header: t("projects.columnDates"), accessor: (project) => project.plannedStartDate && project.plannedFinishDate ? `${project.plannedStartDate} → ${project.plannedFinishDate}` : t("common.notAvailable") },
          ]}
          rows={rows}
          getRowKey={(project) => project.id}
        />
      )}

      <FormDialog
        open={createOpen}
        title={t("projects.create")}
        description={t("projects.createDescription")}
        size="lg"
        onClose={() => setCreateOpen(false)}
        onSubmit={form.handleSubmit((values) => create.mutate(values))}
        submitLabel={t("projects.create")}
        pending={create.isPending}
        error={errorMessage}
      >
        <Field label={t("projects.fieldName")} error={form.formState.errors.name?.message} required><Input aria-label={t("projects.fieldName")} data-autofocus="true" {...form.register("name")} /></Field>
        <Field label={t("projects.fieldCode")} hint={t("projects.fieldCodeHint")} error={form.formState.errors.code?.message} required><Input aria-label={t("projects.fieldCode")} {...form.register("code")} /></Field>
        <Field label={t("projects.fieldStatus")} error={form.formState.errors.status?.message} required>
          <Select {...form.register("status")}>
            {STATUS_VALUES.map((value) => (
              <option key={value} value={value}>{t(`enums.projectStatus.${value}`)}</option>
            ))}
          </Select>
        </Field>
        <Field label={t("projects.fieldLocation")} error={form.formState.errors.locationName?.message}><Input {...form.register("locationName")} /></Field>
        <div className="rect-projects-form__split">
          <Field label={t("projects.fieldStart")} error={form.formState.errors.plannedStartDate?.message}><Input type="date" {...form.register("plannedStartDate")} /></Field>
          <Field label={t("projects.fieldFinish")} error={form.formState.errors.plannedFinishDate?.message}><Input type="date" {...form.register("plannedFinishDate")} /></Field>
        </div>
        <div className="rect-projects-form__split">
          <Field label={t("projects.fieldBudget")} error={form.formState.errors.budgetAmount?.message}><Input inputMode="decimal" {...form.register("budgetAmount")} /></Field>
          <Field label={t("projects.fieldCurrency")} error={form.formState.errors.budgetCurrency?.message}><Input maxLength={3} placeholder="EGP" {...form.register("budgetCurrency")} /></Field>
        </div>
        <Field label={t("projects.fieldDescription")} error={form.formState.errors.description?.message}><Textarea rows={3} {...form.register("description")} /></Field>
      </FormDialog>
    </section>
  );
}
