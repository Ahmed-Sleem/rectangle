/**
 * Project settings: configuration that belongs to one project rather than to
 * the company. Sections mirror the shared configuration blocks so this page
 * behaves exactly like company Settings.
 */
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { Building2, CalendarRange, Wallet } from "lucide-react";
import { Link, useParams } from "react-router";
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

const identitySchema = z.object({
  name: z.string().trim().min(2).max(120),
  code: z.string().trim().min(2).max(40).regex(/^[A-Z0-9][A-Z0-9._-]*$/u, "projects.codeFormat"),
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
    context.addIssue({ code: "custom", path: ["plannedFinishDate"], message: "projects.finishBeforeStart" });
  }
});

const budgetSchema = z.object({
  budgetAmount: z.string().trim().regex(/^\d{1,12}(\.\d{1,2})?$/u, "projects.amountFormat").optional().or(z.literal("")),
  budgetCurrency: z.string().trim().regex(/^[A-Z]{3}$/u, "projects.currencyFormat").optional().or(z.literal("")),
}).superRefine((value, context) => {
  if (value.budgetAmount && !value.budgetCurrency) {
    context.addIssue({ code: "custom", path: ["budgetCurrency"], message: "projects.currencyRequired" });
  }
  if (value.budgetCurrency && !value.budgetAmount) {
    context.addIssue({ code: "custom", path: ["budgetAmount"], message: "projects.amountRequired" });
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
  const { t } = useTranslation();
  /** Schema messages are translation keys so validation speaks the user's language. */
  const translateError = (message?: string) =>
    message ? t(message, { defaultValue: message }) : undefined;
  const { projectId = "" } = useParams();
  const queryClient = useQueryClient();
  const [openSection, setOpenSection] = useState<SectionId | null>("identity");
  const [savedSection, setSavedSection] = useState<SectionId | null>(null);

  const enabled = Boolean(projectId);
  const project = useQuery({ queryKey: ["project", projectId], queryFn: () => getProject(projectId), enabled });
  const access = useQuery({ queryKey: ["project", projectId, "access"], queryFn: () => getProjectAccess(projectId), enabled });

  /*
   * Editing, not reaching. `canManage` answers whether this person may act on
   * the project at all; every form on this page writes project fields, which
   * the server governs with `projects.edit`. An oversight role that reaches
   * every project without holding it was shown all three Save buttons and
   * refused by the server on each.
   */
  const canManage = access.data?.access.capabilities.editProject ?? false;
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
    return <LoadingState title={t("projects.settingsLoadingTitle")} message={t("projects.settingsLoadingMessage")} />;
  }

  if (project.isError) {
    const notFound = project.error instanceof ApiClientError && project.error.status === 404;
    return (
      <ErrorState
        title={notFound ? t("projects.unavailableTitle") : t("projects.settingsFailedTitle")}
        message={notFound
          ? t("projects.unavailableMessage")
          : t("projects.settingsFailedMessage")}
        action={<Button variant="secondary" onClick={() => void project.refetch()}>{t("projects.tryAgain")}</Button>}
      />
    );
  }

  if (!record) return <EmptyState title={t("projects.unavailableTitle")} message={t("projects.unavailableMessage")} />;

  if (!canManage) {
    return (
      <EmptyState
        title={t("projects.settingsReadOnlyTitle")}
        message={t("projects.settingsReadOnlyMessage")}
      />
    );
  }

  const saveError = messageFor(save.error, t("projects.settingsSaveFailed"));

  function savedNotice(section: SectionId) {
    return savedSection === section && save.isSuccess ? (
      <p className="rect-settings-message rect-settings-message--success" role="status">
        {t("projects.saved")}
      </p>
    ) : null;
  }

  return (
    <SettingsStack className="rect-project-settings" aria-label={`${record.name} settings`}>
      <Link className="rect-projects-link" to={`/projects/${projectId}`}>← {record.name}</Link>

      <SettingsSection
        title={t("projects.identityTitle")}
        description={t("projects.identityDescription")}
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
            <Field label={t("projects.fieldName")} error={translateError(identityForm.formState.errors.name?.message)} required>
              <Input {...identityForm.register("name")} />
            </Field>
            <Field label={t("projects.fieldCode")} error={translateError(identityForm.formState.errors.code?.message)} required>
              <Input {...identityForm.register("code")} />
            </Field>
          </div>
          <Field label={t("projects.fieldStatus")} error={translateError(identityForm.formState.errors.status?.message)} required>
            <Select {...identityForm.register("status")}>

            </Select>
          </Field>
          <Field label={t("projects.fieldDescription")} error={translateError(identityForm.formState.errors.description?.message)}>
            <Textarea rows={3} {...identityForm.register("description")} />
          </Field>
          {saveError && savedSection === null ? (
            <p className="rect-settings-message rect-settings-message--error" role="alert">{saveError}</p>
          ) : null}
          {savedNotice("identity")}
          <div className="rect-settings-actions">
            <Button variant="primary" type="submit" disabled={save.isPending}>
              {save.isPending ? t("common.saving") : t("projects.saveIdentity")}
            </Button>
          </div>
        </form>
      </SettingsSection>

      <SettingsSection
        title={t("projects.deliveryTitle")}
        description={t("projects.deliveryDescription")}
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
            <Field label={t("projects.fieldSector")} error={translateError(deliveryForm.formState.errors.sector?.message)}>
              <Select {...deliveryForm.register("sector")}>
                <option value="">{t("projects.notSet")}</option>
                {SECTORS.map((value) => <option key={value} value={value}>{t(`enums.projectSector.${value}`)}</option>)}
              </Select>
            </Field>
            <Field label={t("projects.fieldDeliveryMethod")} error={translateError(deliveryForm.formState.errors.deliveryMethod?.message)}>
              <Select {...deliveryForm.register("deliveryMethod")}>
                <option value="">{t("projects.notSet")}</option>
                {DELIVERY_METHODS.map((value) => <option key={value} value={value}>{t(`enums.deliveryMethod.${value}`)}</option>)}
              </Select>
            </Field>
          </div>
          <Field label={t("projects.fieldLocation")} error={translateError(deliveryForm.formState.errors.locationName?.message)}>
            <Input {...deliveryForm.register("locationName")} />
          </Field>
          <div className="rect-settings-grid">
            <Field label={t("projects.plannedStart")} error={translateError(deliveryForm.formState.errors.plannedStartDate?.message)}>
              <Input type="date" {...deliveryForm.register("plannedStartDate")} />
            </Field>
            <Field label={t("projects.plannedFinish")} error={translateError(deliveryForm.formState.errors.plannedFinishDate?.message)}>
              <Input type="date" {...deliveryForm.register("plannedFinishDate")} />
            </Field>
          </div>
          {savedNotice("delivery")}
          <div className="rect-settings-actions">
            <Button variant="primary" type="submit" disabled={save.isPending}>
              {save.isPending ? t("common.saving") : t("projects.saveDelivery")}
            </Button>
          </div>
        </form>
      </SettingsSection>

      <SettingsSection
        title={t("projects.budgetTitle")}
        description={t("projects.budgetDescription")}
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
            label={t("projects.approvedBudget")}
            description={t("projects.approvedBudgetHint")}
            stacked
          >
            <div className="rect-settings-grid">
              <Field label={t("projects.fieldAmount")} error={translateError(budgetForm.formState.errors.budgetAmount?.message)}>
                <Input inputMode="decimal" {...budgetForm.register("budgetAmount")} />
              </Field>
              <Field label={t("projects.fieldCurrency")} error={translateError(budgetForm.formState.errors.budgetCurrency?.message)}>
                <Input maxLength={3} placeholder="EGP" {...budgetForm.register("budgetCurrency")} />
              </Field>
            </div>
          </SettingRow>
          {savedNotice("budget")}
          <div className="rect-settings-actions">
            <Button variant="primary" type="submit" disabled={save.isPending}>
              {save.isPending ? t("common.saving") : t("projects.saveBudget")}
            </Button>
          </div>
        </form>
      </SettingsSection>
    </SettingsStack>
  );
}
