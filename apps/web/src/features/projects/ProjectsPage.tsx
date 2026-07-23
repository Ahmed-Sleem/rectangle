/** Projects page lists and creates real tenant-owned project records. */
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link } from "react-router-dom";
import { z } from "zod";
import { ApiClientError } from "@/shared/api/client";
import { Button, DataTable, EmptyState, Field, Input, Modal, Select, Textarea, Toolbar } from "@/shared/ui";
import { createProject, listProjects, type CreateProjectPayload, type ProjectRecord } from "./project-api";
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

function statusLabel(status: ProjectRecord["status"]): string {
  return status.replace("_", " ");
}

export default function ProjectsPage() {
  const [createOpen, setCreateOpen] = useState(false);
  const queryClient = useQueryClient();
  const projects = useQuery({ queryKey: ["projects"], queryFn: listProjects });
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

  const rows = projects.data?.projects ?? [];
  const errorMessage = create.error instanceof ApiClientError ? create.error.message : create.error ? "Project could not be created." : null;

  return (
    <section className="rect-projects-page" aria-label="Projects workspace">
      <Toolbar className="rect-projects-toolbar">
        <Button variant="primary" onClick={() => setCreateOpen(true)}>Create project</Button>
      </Toolbar>

      {projects.isLoading ? (
        <EmptyState title="Loading projects" message="Preparing your project register…" />
      ) : rows.length === 0 ? (
        <EmptyState title="No projects yet" message="Create your first project to track team, schedule, budget, risks, and progress." action={<Button variant="primary" onClick={() => setCreateOpen(true)}>Create project</Button>} />
      ) : (
        <DataTable
          caption="Project register"
          columns={[
            { id: "name", header: "Project", accessor: (project) => <Link className="rect-projects-link" to={`/projects/${project.id}`}>{project.name}</Link> },
            { id: "code", header: "Code", accessor: (project) => project.code },
            { id: "status", header: "Status", accessor: (project) => statusLabel(project.status) },
            { id: "location", header: "Location", accessor: (project) => project.locationName ?? "—" },
            { id: "dates", header: "Dates", accessor: (project) => project.plannedStartDate && project.plannedFinishDate ? `${project.plannedStartDate} → ${project.plannedFinishDate}` : "—" },
          ]}
          rows={rows}
          getRowKey={(project) => project.id}
        />
      )}

      <Modal open={createOpen} title="Create project" onClose={() => setCreateOpen(false)}>
        <form className="rect-projects-form" onSubmit={form.handleSubmit((values) => create.mutate(values))}>
          <Field label="Project name" error={form.formState.errors.name?.message} required><Input aria-label="Project name" {...form.register("name")} /></Field>
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
          {errorMessage ? <p className="rect-projects-form__error" role="alert">{errorMessage}</p> : null}
          <Toolbar className="rect-projects-form__actions"><Button variant="ghost" onClick={() => setCreateOpen(false)}>Cancel</Button><Button variant="primary" type="submit" disabled={create.isPending}>{create.isPending ? "Creating…" : "Create"}</Button></Toolbar>
        </form>
      </Modal>
    </section>
  );
}
