/**
 * Connecting a model, whether for the company or for one person.
 *
 * There is one wizard because there is one job. A company owner and an
 * individual are answering the same three questions — where do requests go,
 * which model, which key — and the only differences are who pays, whether the
 * budget question appears, and whether leaving a field blank means "keep what
 * is saved" or "follow the company". Those are three small conditionals; two
 * wizards would have been two hundred lines that drift apart the first time
 * somebody adds a field to one of them.
 *
 * The personal scope exists because a company-wide provider is not enough in
 * practice. People want a cheaper model for quick questions and a stronger one
 * for reasoning through a delay, or they have their own account and would
 * rather it were billed there. Letting somebody override only the key, which is
 * what this used to allow, made the personal setting an accounting detail
 * rather than a real choice.
 */
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { Field, Input, WizardDialog, type WizardStep } from "@/shared/ui";
import type { AiSettingsView } from "./ai-api";

/** How many reasoning steps an owner may allow. Mirrors the server's bounds. */
export const CYCLE_BOUNDS = { min: 1, max: 30 } as const;

/*
 * https is required rather than preferred: the request carries an API key, and
 * over plain http that key is readable by anything on the path. The server
 * refuses it too — this copy exists so the person is told before they submit
 * rather than after.
 */
const httpsUrl = z
  .url()
  .max(512)
  .refine((value) => value.startsWith("https://"), { message: "httpsRequired" });

/*
 * One field set, two rule sets.
 *
 * Both scopes carry the same four fields; what differs is whether a blank is
 * allowed and what it means. Keeping the shape identical is what lets one form
 * instance serve both — a union of two differently-shaped types would have to
 * be narrowed at every field, and the narrowing would be the bug.
 */
const companySchema = z.object({
  baseUrl: httpsUrl,
  model: z.string().trim().min(1).max(200),
  apiKey: z.string().trim().max(512),
  maxCycles: z.number().int().min(CYCLE_BOUNDS.min).max(CYCLE_BOUNDS.max),
});

/*
 * Every personal field is optional, and blank means "follow the company". The
 * URL check only applies to a value that was actually typed, which is why it is
 * a union with the empty string rather than `.optional()` on a required rule —
 * an empty box is a choice here, not an omission.
 */
const personalSchema = z.object({
  baseUrl: z.union([httpsUrl, z.literal("")]),
  model: z.string().trim().max(200),
  apiKey: z.string().trim().max(512),
  // Present so the two schemas describe the same object; the personal wizard
  // never shows the step and the caller never reads the value.
  maxCycles: z.number().int().min(CYCLE_BOUNDS.min).max(CYCLE_BOUNDS.max),
});

export type ProviderValues = z.infer<typeof companySchema>;
export type CompanyProviderValues = ProviderValues;
export type PersonalProviderValues = ProviderValues;

export interface AiProviderWizardProps {
  open: boolean;
  /** Whose settings these are. Decides the copy, the steps and the fallbacks. */
  scope: "company" | "personal";
  settings: AiSettingsView | undefined;
  onClose: () => void;
  onSave: (values: ProviderValues) => Promise<unknown>;
  pending: boolean;
  error: string | null;
}

export function AiProviderWizard({
  open,
  scope,
  settings,
  onClose,
  onSave,
  pending,
  error,
}: AiProviderWizardProps) {
  const { t } = useTranslation();
  const isCompany = scope === "company";

  const form = useForm<ProviderValues>({
    // Which rules apply is a property of the scope, and the scope does not
    // change while a window is open.
    resolver: zodResolver(isCompany ? companySchema : personalSchema),
    mode: "onChange",
    defaultValues: { baseUrl: "", model: "", apiKey: "", maxCycles: 10 },
  });

  /*
   * Refilled whenever the window opens, not once on mount. A wizard that is
   * closed and reopened after a save would otherwise still be showing the
   * values from before it, and the person would be editing a stale copy of
   * their own settings.
   */
  useEffect(() => {
    if (!open) return;
    form.reset({
      baseUrl: (isCompany ? settings?.baseUrl : settings?.personalBaseUrl) ?? "",
      model: (isCompany ? settings?.model : settings?.personalModel) ?? "",
      // Never prefilled. The server does not return a key, and an empty box
      // that means "keep the saved one" is the only truthful representation.
      apiKey: "",
      maxCycles: settings?.maxCycles ?? 10,
    });
  }, [open, isCompany, settings, form]);

  const values = form.watch();
  const errors = form.formState.errors;

  /*
   * Each step reports whether it may be left, read from the resolver's own
   * errors plus presence, so the wizard and the schema cannot disagree about
   * what "valid" means.
   */
  const endpointReady = isCompany
    ? Boolean(values.baseUrl) && Boolean(values.model) && !errors.baseUrl && !errors.model
    : !errors.baseUrl && !errors.model;

  /*
   * A company that has never saved a key must supply one now; one that already
   * has may leave the box empty to keep it. A person may always leave it empty,
   * because empty means "use the company's key", which is a real choice rather
   * than an omission.
   */
  const keyReady = isCompany
    ? (settings?.hasCompanyKey ? !errors.apiKey : Boolean(values.apiKey) && !errors.apiKey)
    : !errors.apiKey;

  const endpointStep: WizardStep = {
    id: "endpoint",
    title: t("settings.aiStepEndpoint"),
    description: isCompany ? t("settings.aiStepEndpointHelp") : t("settings.aiMineStepEndpointHelp"),
    isComplete: endpointReady,
    content: (
      <>
        <Field
          label={t("settings.aiBaseUrl")}
          hint={isCompany ? t("settings.aiBaseUrlHint") : t("settings.aiMineFollowHint")}
          error={errors.baseUrl ? t("settings.aiBaseUrlInvalid") : undefined}
          required={isCompany}
        >
          <Input
            data-autofocus="true"
            aria-label={t("settings.aiBaseUrl")}
            placeholder={isCompany ? "https://api.openai.com/v1" : (settings?.baseUrl ?? "")}
            {...form.register("baseUrl")}
          />
        </Field>
        <Field
          label={t("settings.aiModel")}
          hint={isCompany ? t("settings.aiModelHint") : t("settings.aiMineFollowHint")}
          error={errors.model?.message}
          required={isCompany}
        >
          <Input
            aria-label={t("settings.aiModel")}
            placeholder={isCompany ? "" : (settings?.model ?? "")}
            {...form.register("model")}
          />
        </Field>
      </>
    ),
  };

  const keyStep: WizardStep = {
    id: "key",
    title: t("settings.aiStepKey"),
    description: isCompany ? t("settings.aiStepKeyHelp") : t("settings.aiMineStepKeyHelp"),
    isComplete: keyReady,
    content: (
      <Field
        label={isCompany ? t("settings.aiCompanyKey") : t("settings.aiPersonalKey")}
        hint={
          isCompany
            ? settings?.hasCompanyKey
              ? t("settings.aiKeyKeep")
              : t("settings.aiKeyHint")
            : settings?.hasPersonalKey
              ? t("settings.aiKeyKeep")
              : t("settings.aiMineKeyHint")
        }
        error={errors.apiKey?.message}
        required={isCompany && !settings?.hasCompanyKey}
      >
        <Input
          data-autofocus="true"
          aria-label={isCompany ? t("settings.aiCompanyKey") : t("settings.aiPersonalKey")}
          type="password"
          autoComplete="new-password"
          {...form.register("apiKey")}
        />
      </Field>
    ),
  };

  /*
   * Only the company decides the budget. It trades answer quality directly
   * against spend on the company's account, so it is not an individual's to
   * change even when the model is their own choice.
   */
  const budgetStep: WizardStep = {
    id: "budget",
    title: t("settings.aiStepBudget"),
    description: t("settings.aiStepBudgetHelp"),
    isComplete: !errors.maxCycles,
    content: (
      <Field
        label={t("settings.aiMaxCycles")}
        hint={t("settings.aiMaxCyclesHint")}
        error={errors.maxCycles ? t("settings.aiMaxCyclesInvalid") : undefined}
        required
      >
        <Input
          aria-label={t("settings.aiMaxCycles")}
          inputMode="numeric"
          {...form.register("maxCycles", { valueAsNumber: true })}
        />
      </Field>
    ),
  };

  const reviewStep: WizardStep = {
    id: "review",
    title: t("settings.aiStepReview"),
    description: isCompany ? t("settings.aiStepReviewHelp") : t("settings.aiMineStepReviewHelp"),
    content: (
      <dl className="rect-email-review">
        <div className="rect-email-review__row">
          <dt>{t("settings.aiBaseUrl")}</dt>
          <dd>{values.baseUrl || t("settings.aiMineFollowingCompany")}</dd>
        </div>
        <div className="rect-email-review__row">
          <dt>{t("settings.aiModel")}</dt>
          <dd>{values.model || t("settings.aiMineFollowingCompany")}</dd>
        </div>
        <div className="rect-email-review__row">
          <dt>{isCompany ? t("settings.aiCompanyKey") : t("settings.aiPersonalKey")}</dt>
          <dd>
            {values.apiKey
              ? t("settings.aiKeyNew")
              : isCompany
                ? t("settings.aiKeyUnchanged")
                : t("settings.aiMineFollowingCompany")}
          </dd>
        </div>
        {isCompany ? (
          <div className="rect-email-review__row">
            <dt>{t("settings.aiMaxCycles")}</dt>
            <dd>{values.maxCycles}</dd>
          </div>
        ) : null}
      </dl>
    ),
  };

  const steps = isCompany
    ? [endpointStep, keyStep, budgetStep, reviewStep]
    : [endpointStep, keyStep, reviewStep];

  return (
    <WizardDialog
      open={open}
      title={
        isCompany
          ? settings?.configured
            ? t("settings.aiEditTitle")
            : t("settings.aiSetUpTitle")
          : t("settings.aiMineTitle")
      }
      description={isCompany ? t("settings.aiDescription") : t("settings.aiMineDescription")}
      size="lg"
      steps={steps}
      onClose={onClose}
      onFinish={() => void form.handleSubmit((formValues) => onSave(formValues))()}
      finishLabel={isCompany ? t("settings.aiSave") : t("settings.aiMineSave")}
      pending={pending}
      error={error}
    />
  );
}
