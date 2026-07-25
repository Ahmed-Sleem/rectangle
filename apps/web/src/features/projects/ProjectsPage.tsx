/** Projects page lists and creates real tenant-owned project records. */
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { z } from "zod";
import { ApiClientError } from "@/shared/api/client";
import { Badge, Button, DataTable, EmptyState, Field, FilterBar, FilterBarSpacer, FilterSelect, FormDialog, Input, SearchField, Select, Textarea } from "@/shared/ui";
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
  const errorMessage = create.error instanceof ApiClientError ? create.error.message : create.error ? t("projects.createFailed") : null;

  return (
    <section className="rect-projects-page" aria-label={t("projects.workspaceLabel")}>
      <FilterBar>
        <SearchField
          label={t("projects.searchLabel")}
          placeholder={t("projects.searchPlaceholder")}
          value={search}
          onChange={setSearch}
          submitLabel={t("common.search")}
        />
        <FilterSelect
          label={t("projects.filterStatus")}
          width="sm"
          value={status}
          onChange={(event) => setStatus(event.target.value as ProjectStatus | "")}
        >
          <option value="">{t("projects.allStatuses")}</option>
          {STATUS_VALUES.map((value) => (
            <option key={value} value={value}>{t(`enums.projectStatus.${value}`)}</option>
          ))}
        </FilterSelect>
        <FilterSelect
          label={t("projects.sortLabel")}
          width="md"
          value={sortKey}
          onChange={(event) => setSortKey(event.target.value as SortKey)}
        >
          <option value="updatedAt">{t("projects.sortRecent")}</option>
          <option value="name">{t("projects.sortName")}</option>
          <option value="code">{t("projects.sortCode")}</option>
          <option value="status">{t("projects.sortStatus")}</option>
        </FilterSelect>
        <FilterBarSpacer />
        {canManage ? (
          <Button variant="primary" onClick={() => setCreateOpen(true)}>{t("projects.create")}</Button>
        ) : null}
      </FilterBar>

      {projects.isLoading ? (
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
      ) : (
        <DataTable
          caption={t("projects.register")}
          columns={[
            { id: "name", header: t("projects.columnProject"), accessor: (project) => <Link className="rect-projects-link" to={`/projects/${project.id}`}>{project.name}</Link> },
            { id: "code", header: t("projects.columnCode"), accessor: (project) => project.code },
            { id: "status", header: t("projects.columnStatus"), accessor: (project) => <Badge tone={statusTone(project.status)}>{t(`enums.projectStatus.${project.status}`)}</Badge> },
            { id: "location", header: t("projects.columnLocation"), accessor: (project) => project.locationName ?? "—" },
            { id: "dates", header: t("projects.columnDates"), accessor: (project) => project.plannedStartDate && project.plannedFinishDate ? `${project.plannedStartDate} → ${project.plannedFinishDate}` : "—" },
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
