/** Projects page lists and creates real tenant-owned project records. */
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { Link } from "react-router-dom";
import { z } from "zod";
import { ApiClientError } from "@/shared/api/client";
import { Badge, Button, DataTable, EmptyState, Field, FormDialog, Input, Select, Textarea, Toolbar } from "@/shared/ui";
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

const STATUS_OPTIONS: ReadonlyArray<{ value: ProjectStatus; label: string }> = [
  { value: "planned", label: "Planned" },
  { value: "active", label: "Active" },
  { value: "on_hold", label: "On hold" },
  { value: "completed", label: "Completed" },
  { value: "archived", label: "Archived" },
];

function statusLabel(status: ProjectStatus): string {
  return STATUS_OPTIONS.find((option) => option.value === status)?.label ?? status;
}

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
  const errorMessage = create.error instanceof ApiClientError ? create.error.message : create.error ? "Project could not be created." : null;

  return (
    <section className="rect-projects-page" aria-label="Projects workspace">
      <Toolbar className="rect-projects-toolbar">
        <Input
          className="rect-projects-search"
          type="search"
          aria-label="Search projects"
          placeholder="Search by name, code, or location"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <Select
          aria-label="Filter by status"
          value={status}
          onChange={(event) => setStatus(event.target.value as ProjectStatus | "")}
        >
          <option value="">All statuses</option>
          {STATUS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </Select>
        <Select
          aria-label="Sort projects"
          value={sortKey}
          onChange={(event) => setSortKey(event.target.value as SortKey)}
        >
          <option value="updatedAt">Recently updated</option>
          <option value="name">Name</option>
          <option value="code">Code</option>
          <option value="status">Status</option>
        </Select>
        {canManage ? (
          <Button variant="primary" onClick={() => setCreateOpen(true)}>Create project</Button>
        ) : null}
      </Toolbar>

      {projects.isLoading ? (
        <EmptyState title="Loading projects" message="Preparing your project register…" />
      ) : rows.length === 0 && isFiltered ? (
        <EmptyState
          title="No matching projects"
          message="No projects match your search and filters. Try a different search term or status."
          action={<Button variant="secondary" onClick={() => { setSearch(""); setStatus(""); }}>Clear filters</Button>}
        />
      ) : rows.length === 0 ? (
        <EmptyState
          title="No projects yet"
          message={canManage
            ? "Create your first project to track team, schedule, budget, risks, and progress."
            : "Projects you are added to will appear here."}
          {...(canManage
            ? { action: <Button variant="primary" onClick={() => setCreateOpen(true)}>Create project</Button> }
            : {})}
        />
      ) : (
        <DataTable
          caption="Project register"
          columns={[
            { id: "name", header: "Project", accessor: (project) => <Link className="rect-projects-link" to={`/projects/${project.id}`}>{project.name}</Link> },
            { id: "code", header: "Code", accessor: (project) => project.code },
            { id: "status", header: "Status", accessor: (project) => <Badge tone={statusTone(project.status)}>{statusLabel(project.status)}</Badge> },
            { id: "location", header: "Location", accessor: (project) => project.locationName ?? "—" },
            { id: "dates", header: "Dates", accessor: (project) => project.plannedStartDate && project.plannedFinishDate ? `${project.plannedStartDate} → ${project.plannedFinishDate}` : "—" },
          ]}
          rows={rows}
          getRowKey={(project) => project.id}
        />
      )}

      <FormDialog
        open={createOpen}
        title="Create project"
        description="Register a project so its team, schedule, budget, and risks live in one workspace."
        size="lg"
        onClose={() => setCreateOpen(false)}
        onSubmit={form.handleSubmit((values) => create.mutate(values))}
        submitLabel="Create project"
        pending={create.isPending}
        error={errorMessage}
      >
        <Field label="Project name" error={form.formState.errors.name?.message} required><Input aria-label="Project name" data-autofocus="true" {...form.register("name")} /></Field>
        <Field label="Project code" hint="Uppercase letters, numbers, dot, dash, underscore." error={form.formState.errors.code?.message} required><Input aria-label="Project code" {...form.register("code")} /></Field>
        <Field label="Status" error={form.formState.errors.status?.message} required>
          <Select {...form.register("status")}>
            <option value="planned">Planned</option>
            <option value="active">Active</option>
            <option value="on_hold">On hold</option>
            <option value="completed">Completed</option>
            <option value="archived">Archived</option>
          </Select>
        </Field>
        <Field label="Location" error={form.formState.errors.locationName?.message}><Input {...form.register("locationName")} /></Field>
        <div className="rect-projects-form__split">
          <Field label="Start date" error={form.formState.errors.plannedStartDate?.message}><Input type="date" {...form.register("plannedStartDate")} /></Field>
          <Field label="Finish date" error={form.formState.errors.plannedFinishDate?.message}><Input type="date" {...form.register("plannedFinishDate")} /></Field>
        </div>
        <div className="rect-projects-form__split">
          <Field label="Budget" error={form.formState.errors.budgetAmount?.message}><Input inputMode="decimal" {...form.register("budgetAmount")} /></Field>
          <Field label="Currency" error={form.formState.errors.budgetCurrency?.message}><Input maxLength={3} placeholder="EGP" {...form.register("budgetCurrency")} /></Field>
        </div>
        <Field label="Description" error={form.formState.errors.description?.message}><Textarea rows={3} {...form.register("description")} /></Field>
      </FormDialog>
    </section>
  );
}
