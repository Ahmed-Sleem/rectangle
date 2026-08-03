/**
 * Connecting a model, whether for the company or for one person.
 *
 * There is one wizard because there is one job. A company owner and an
 * individual answer exactly the same four questions — where do requests go,
 * which model, which key, and what budget — and the only differences are the
 * words around them and whose settings are being written. Two wizards would
 * have been two hundred lines that drift apart the first time somebody adds a
 * field to one of them.
 *
 * Both scopes require a COMPLETE provider. An earlier version let a personal
 * configuration be a set of overrides onto the company's, so a blank endpoint
 * meant "use theirs". That made "whose settings are these, and who is paying"
 * unanswerable, and it meant nobody could set up their own model until an owner
 * had set one up first. A personal provider now stands alone: its own endpoint,
 * its own model, its own key, and its own budgets, because whoever pays for the
 * calls sets the limits on them.
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

/** How long a single reply may be. Mirrors the server's bounds. */
export const TOKEN_BOUNDS = { min: 256, max: 32_000 } as const;

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
/**
 * One shape for both scopes.
 *
 * They validate identically now that a personal provider is complete rather
 * than a set of overrides, so there is one schema instead of two that had to be
 * kept in step. The only thing scope decides is the copy and where the values
 * are read from and written to.
 */
const providerSchema = z.object({
  baseUrl: httpsUrl,
  model: z.string().trim().min(1).max(200),
  apiKey: z.string().trim().max(512),
  maxCycles: z.number().int().min(CYCLE_BOUNDS.min).max(CYCLE_BOUNDS.max),
  maxOutputTokens: z.number().int().min(TOKEN_BOUNDS.min).max(TOKEN_BOUNDS.max),
});

export type ProviderValues = z.infer<typeof providerSchema>;
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
    resolver: zodResolver(providerSchema),
    mode: "onChange",
    defaultValues: { baseUrl: "", model: "", apiKey: "", maxCycles: 10, maxOutputTokens: 2048 },
  });

  /*
   * Refilled whenever the window opens, not once on mount. A wizard that is
   * closed and reopened after a save would otherwise still be showing the
   * values from before it, and the person would be editing a stale copy of
   * their own settings.
   */
  useEffect(() => {
    if (!open) return;
    const provider = isCompany ? settings?.company : settings?.personal;
    form.reset({
      baseUrl: provider?.baseUrl ?? "",
      model: provider?.model ?? "",
      // Never prefilled. The server does not return a key, and an empty box
      // that means "keep the saved one" is the only truthful representation.
      apiKey: "",
      maxCycles: provider?.maxCycles ?? 10,
      maxOutputTokens: provider?.maxOutputTokens ?? 2048,
    });
  }, [open, isCompany, settings, form]);

  const values = form.watch();
  const errors = form.formState.errors;

  /*
   * Each step reports whether it may be left, read from the resolver's own
   * errors plus presence, so the wizard and the schema cannot disagree about
   * what "valid" means.
   */
  /*
   * Each step reports whether it may be left, read from the resolver's own
   * errors plus presence, so the wizard and the schema cannot disagree about
   * what "valid" means. Identical for both scopes now that a personal provider
   * is complete rather than a set of overrides.
   */
  const endpointReady =
    Boolean(values.baseUrl) && Boolean(values.model) && !errors.baseUrl && !errors.model;

  /*
   * A key is required the first time and optional afterwards, for either scope.
   * Demanding it again to change a model name would mean retyping a secret
   * nobody can read back.
   */
  const hasStoredKey = isCompany ? settings?.company.hasKey : settings?.personal.hasKey;
  const keyReady = hasStoredKey ? !errors.apiKey : Boolean(values.apiKey) && !errors.apiKey;

  const endpointStep: WizardStep = {
    id: "endpoint",
    title: t("settings.aiStepEndpoint"),
    description: isCompany ? t("settings.aiStepEndpointHelp") : t("settings.aiMineStepEndpointHelp"),
    isComplete: endpointReady,
    content: (
      <>
        <Field
          label={t("settings.aiBaseUrl")}
          hint={t("settings.aiBaseUrlHint")}
          error={errors.baseUrl ? t("settings.aiBaseUrlInvalid") : undefined}
          required
        >
          <Input
            data-autofocus="true"
            aria-label={t("settings.aiBaseUrl")}
            placeholder="https://api.openai.com/v1"
            {...form.register("baseUrl")}
          />
        </Field>
        <Field
          label={t("settings.aiModel")}
          hint={t("settings.aiModelHint")}
          error={errors.model?.message}
          required
        >
          <Input
            aria-label={t("settings.aiModel")}
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
        hint={hasStoredKey ? t("settings.aiKeyKeep") : t("settings.aiKeyHint")}
        error={errors.apiKey?.message}
        required={!hasStoredKey}
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
  /*
   * Both budgets, for whichever scope is being configured. They belong to
   * whoever pays: an owner sets the company's, and somebody on their own key
   * sets their own, because the company's limits have nothing to do with an
   * account the company is not billed for.
   */
  const budgetStep: WizardStep = {
    id: "budget",
    title: t("settings.aiStepBudget"),
    description: t("settings.aiStepBudgetHelp"),
    isComplete: !errors.maxCycles && !errors.maxOutputTokens,
    content: (
      <>
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
        <Field
          label={t("settings.aiMaxTokens")}
          hint={t("settings.aiMaxTokensHint")}
          error={errors.maxOutputTokens ? t("settings.aiMaxTokensInvalid") : undefined}
          required
        >
          <Input
            aria-label={t("settings.aiMaxTokens")}
            inputMode="numeric"
            {...form.register("maxOutputTokens", { valueAsNumber: true })}
          />
        </Field>
      </>
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
          <dd>{values.baseUrl}</dd>
        </div>
        <div className="rect-email-review__row">
          <dt>{t("settings.aiModel")}</dt>
          <dd>{values.model}</dd>
        </div>
        <div className="rect-email-review__row">
          <dt>{isCompany ? t("settings.aiCompanyKey") : t("settings.aiPersonalKey")}</dt>
          <dd>{values.apiKey ? t("settings.aiKeyNew") : t("settings.aiKeyUnchanged")}</dd>
        </div>
        <div className="rect-email-review__row">
          <dt>{t("settings.aiMaxCycles")}</dt>
          <dd>{values.maxCycles}</dd>
        </div>
        <div className="rect-email-review__row">
          <dt>{t("settings.aiMaxTokens")}</dt>
          <dd>{values.maxOutputTokens}</dd>
        </div>
      </dl>
    ),
  };

  // The same four steps either way: the scopes differ in whose settings they
  // write, not in what has to be answered.
  const steps = [endpointStep, keyStep, budgetStep, reviewStep];

  return (
    <WizardDialog
      open={open}
      title={
        isCompany
          ? settings?.company.configured
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
