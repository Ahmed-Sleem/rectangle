/**
 * Project settings: configuration that belongs to one project rather than to
 * the company. Sections mirror the shared configuration blocks so this page
 * behaves exactly like company Settings.
 */
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { Building2, CalendarRange, Wallet } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { z } from "zod";
import { ApiClientError } from "@/shared/api/client";
import {
  Button,
  EmptyState,
  ErrorState,
  Field,
  Input,
  LoadingState,
  Select,
  SettingRow,
  SettingsSection,
  SettingsStack,
  Textarea,
} from "@/shared/ui";
import { getProject, getProjectAccess, updateProject } from "./project-api";
import "./ProjectsPage.css";

const SECTORS = [
  "residential", "commercial", "infrastructure", "industrial", "healthcare",
  "education", "hospitality", "mixed_use", "other",
] as const;

const DELIVERY_METHODS = [
  "design_bid_build", "design_build", "construction_management", "epc", "other",
] as const;

function humanize(value: string): string {
  return value.replace(/_/g, " ").replace(/^./, (character) => character.toUpperCase());
}

const identitySchema = z.object({
  name: z.string().trim().min(2).max(120),
  code: z.string().trim().min(2).max(40).regex(/^[A-Z0-9][A-Z0-9._-]*$/u, "Use uppercase letters, numbers, dot, dash, or underscore."),
  status: z.enum(["planned", "active", "on_hold", "completed", "archived"]),
  description: z.string().trim().max(2000).optional(),
});

const deliverySchema = z.object({
  sector: z.enum(SECTORS).optional().or(z.literal("")),
  deliveryMethod: z.enum(DELIVERY_METHODS).optional().or(z.literal("")),
  locationName: z.string().trim().max(160).optional(),
  plannedStartDate: z.string().optional(),
  plannedFinishDate: z.string().optional(),
}).superRefine((value, context) => {
  if (value.plannedStartDate && value.plannedFinishDate && value.plannedFinishDate < value.plannedStartDate) {
    context.addIssue({ code: "custom", path: ["plannedFinishDate"], message: "Finish date cannot be before start date." });
  }
});

const budgetSchema = z.object({
  budgetAmount: z.string().trim().regex(/^\d{1,12}(\.\d{1,2})?$/u, "Enter an amount such as 1500000.00.").optional().or(z.literal("")),
  budgetCurrency: z.string().trim().regex(/^[A-Z]{3}$/u, "Use a three-letter currency code such as EGP.").optional().or(z.literal("")),
}).superRefine((value, context) => {
  if (value.budgetAmount && !value.budgetCurrency) {
    context.addIssue({ code: "custom", path: ["budgetCurrency"], message: "Currency is required when a budget is set." });
  }
  if (value.budgetCurrency && !value.budgetAmount) {
    context.addIssue({ code: "custom", path: ["budgetAmount"], message: "Amount is required when a currency is set." });
  }
});

type IdentityForm = z.infer<typeof identitySchema>;
type DeliveryForm = z.infer<typeof deliverySchema>;
type BudgetForm = z.infer<typeof budgetSchema>;

type SectionId = "identity" | "delivery" | "budget";

function messageFor(error: unknown, fallback: string): string | null {
  if (!error) return null;
  return error instanceof ApiClientError ? error.message : fallback;
}

export default function ProjectSettingsPage() {
  const { projectId = "" } = useParams();
  const queryClient = useQueryClient();
  const [openSection, setOpenSection] = useState<SectionId | null>("identity");
  const [savedSection, setSavedSection] = useState<SectionId | null>(null);

  const enabled = Boolean(projectId);
  const project = useQuery({ queryKey: ["project", projectId], queryFn: () => getProject(projectId), enabled });
  const access = useQuery({ queryKey: ["project", projectId, "access"], queryFn: () => getProjectAccess(projectId), enabled });

  const canManage = access.data?.access.canManage ?? false;
  const record = project.data?.project;

  const identityForm = useForm<IdentityForm>({ resolver: zodResolver(identitySchema) });
  const deliveryForm = useForm<DeliveryForm>({ resolver: zodResolver(deliverySchema) });
  const budgetForm = useForm<BudgetForm>({ resolver: zodResolver(budgetSchema) });

  useEffect(() => {
    if (!record) return;
    identityForm.reset({
      name: record.name,
      code: record.code,
      status: record.status,
      description: record.description ?? "",
    });
    deliveryForm.reset({
      sector: (record.sector ?? "") as DeliveryForm["sector"],
      deliveryMethod: (record.deliveryMethod ?? "") as DeliveryForm["deliveryMethod"],
      locationName: record.locationName ?? "",
      plannedStartDate: record.plannedStartDate ?? "",
      plannedFinishDate: record.plannedFinishDate ?? "",
    });
    budgetForm.reset({
      budgetAmount: record.budgetAmount ?? "",
      budgetCurrency: record.budgetCurrency ?? "",
    });
  }, [budgetForm, deliveryForm, identityForm, record]);

  const save = useMutation({
    mutationFn: (input: { section: SectionId; payload: Record<string, string> }) =>
      updateProject(projectId, input.payload),
    onSuccess: async (_result, input) => {
      await queryClient.invalidateQueries({ queryKey: ["project", projectId] });
      await queryClient.invalidateQueries({ queryKey: ["projects"] });
      setSavedSection(input.section);
    },
  });

  function submit(section: SectionId, payload: Record<string, string>) {
    setSavedSection(null);
    save.mutate({ section, payload });
  }

  if (project.isLoading) {
    return <LoadingState title="Loading project settings" message="Preparing this project's configuration…" />;
  }

  if (project.isError) {
    const notFound = project.error instanceof ApiClientError && project.error.status === 404;
    return (
      <ErrorState
        title={notFound ? "Project not available" : "Settings could not be opened"}
        message={notFound
          ? "This project either does not exist or you do not have access to it."
          : "Something went wrong while loading these settings. Please try again."}
        action={<Button variant="secondary" onClick={() => void project.refetch()}>Try again</Button>}
      />
    );
  }

  if (!record) return <EmptyState title="Project not available" message="This project could not be opened." />;

  if (!canManage) {
    return (
      <EmptyState
        title="Settings are managed by the project team"
        message="Ask a project manager or admin to change this project's configuration."
      />
    );
  }

  const saveError = messageFor(save.error, "These settings could not be saved.");

  function savedNotice(section: SectionId) {
    return savedSection === section && save.isSuccess ? (
      <p className="rect-settings-message rect-settings-message--success" role="status">
        Saved.
      </p>
    ) : null;
  }

  return (
    <SettingsStack className="rect-project-settings" aria-label={`${record.name} settings`}>
      <Link className="rect-projects-link" to={`/projects/${projectId}`}>← {record.name}</Link>

      <SettingsSection
        title="Project identity"
        description="The name, code, and status shown wherever this project appears."
        icon={<Building2 size={18} strokeWidth={2} />}
        open={openSection === "identity"}
        onToggle={() => setOpenSection((current) => (current === "identity" ? null : "identity"))}
      >
        <form
          className="rect-settings-form"
          onSubmit={identityForm.handleSubmit((values) => submit("identity", {
            name: values.name,
            code: values.code.toUpperCase(),
            status: values.status,
            ...(values.description ? { description: values.description } : {}),
          }))}
        >
          <div className="rect-settings-grid">
            <Field label="Project name" error={identityForm.formState.errors.name?.message} required>
              <Input {...identityForm.register("name")} />
            </Field>
            <Field label="Project code" error={identityForm.formState.errors.code?.message} required>
              <Input {...identityForm.register("code")} />
            </Field>
          </div>
          <Field label="Status" error={identityForm.formState.errors.status?.message} required>
            <Select {...identityForm.register("status")}>
              <option value="planned">Planned</option>
              <option value="active">Active</option>
              <option value="on_hold">On hold</option>
              <option value="completed">Completed</option>
              <option value="archived">Archived</option>
            </Select>
          </Field>
          <Field label="Description" error={identityForm.formState.errors.description?.message}>
            <Textarea rows={3} {...identityForm.register("description")} />
          </Field>
          {saveError && savedSection === null ? (
            <p className="rect-settings-message rect-settings-message--error" role="alert">{saveError}</p>
          ) : null}
          {savedNotice("identity")}
          <div className="rect-settings-actions">
            <Button variant="primary" type="submit" disabled={save.isPending}>
              {save.isPending ? "Saving…" : "Save identity"}
            </Button>
          </div>
        </form>
      </SettingsSection>

      <SettingsSection
        title="Delivery and location"
        description="How this project is delivered, where it is, and when it is planned to run."
        icon={<CalendarRange size={18} strokeWidth={2} />}
        open={openSection === "delivery"}
        onToggle={() => setOpenSection((current) => (current === "delivery" ? null : "delivery"))}
      >
        <form
          className="rect-settings-form"
          onSubmit={deliveryForm.handleSubmit((values) => submit("delivery", {
            ...(values.sector ? { sector: values.sector } : {}),
            ...(values.deliveryMethod ? { deliveryMethod: values.deliveryMethod } : {}),
            ...(values.locationName ? { locationName: values.locationName } : {}),
            ...(values.plannedStartDate ? { plannedStartDate: values.plannedStartDate } : {}),
            ...(values.plannedFinishDate ? { plannedFinishDate: values.plannedFinishDate } : {}),
          }))}
        >
          <div className="rect-settings-grid">
            <Field label="Sector" error={deliveryForm.formState.errors.sector?.message}>
              <Select {...deliveryForm.register("sector")}>
                <option value="">Not set</option>
                {SECTORS.map((value) => <option key={value} value={value}>{humanize(value)}</option>)}
              </Select>
            </Field>
            <Field label="Delivery method" error={deliveryForm.formState.errors.deliveryMethod?.message}>
              <Select {...deliveryForm.register("deliveryMethod")}>
                <option value="">Not set</option>
                {DELIVERY_METHODS.map((value) => <option key={value} value={value}>{humanize(value)}</option>)}
              </Select>
            </Field>
          </div>
          <Field label="Location" error={deliveryForm.formState.errors.locationName?.message}>
            <Input {...deliveryForm.register("locationName")} />
          </Field>
          <div className="rect-settings-grid">
            <Field label="Planned start" error={deliveryForm.formState.errors.plannedStartDate?.message}>
              <Input type="date" {...deliveryForm.register("plannedStartDate")} />
            </Field>
            <Field label="Planned finish" error={deliveryForm.formState.errors.plannedFinishDate?.message}>
              <Input type="date" {...deliveryForm.register("plannedFinishDate")} />
            </Field>
          </div>
          {savedNotice("delivery")}
          <div className="rect-settings-actions">
            <Button variant="primary" type="submit" disabled={save.isPending}>
              {save.isPending ? "Saving…" : "Save delivery details"}
            </Button>
          </div>
        </form>
      </SettingsSection>

      <SettingsSection
        title="Budget"
        description="The approved budget used across cost reporting for this project."
        icon={<Wallet size={18} strokeWidth={2} />}
        open={openSection === "budget"}
        onToggle={() => setOpenSection((current) => (current === "budget" ? null : "budget"))}
      >
        <form
          className="rect-settings-form"
          onSubmit={budgetForm.handleSubmit((values) => submit("budget", {
            ...(values.budgetAmount ? { budgetAmount: values.budgetAmount } : {}),
            ...(values.budgetCurrency ? { budgetCurrency: values.budgetCurrency.toUpperCase() } : {}),
          }))}
        >
          <SettingRow
            label="Approved budget"
            description="Leave both fields empty until a budget is approved."
            stacked
          >
            <div className="rect-settings-grid">
              <Field label="Amount" error={budgetForm.formState.errors.budgetAmount?.message}>
                <Input inputMode="decimal" {...budgetForm.register("budgetAmount")} />
              </Field>
              <Field label="Currency" error={budgetForm.formState.errors.budgetCurrency?.message}>
                <Input maxLength={3} placeholder="EGP" {...budgetForm.register("budgetCurrency")} />
              </Field>
            </div>
          </SettingRow>
          {savedNotice("budget")}
          <div className="rect-settings-actions">
            <Button variant="primary" type="submit" disabled={save.isPending}>
              {save.isPending ? "Saving…" : "Save budget"}
            </Button>
          </div>
        </form>
      </SettingsSection>
    </SettingsStack>
  );
}
