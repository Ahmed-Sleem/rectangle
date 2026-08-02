/**
 * The assistant's configuration: what the state is, and how to change it.
 *
 * Built the same way as mail delivery, because it is the same shape of problem
 * — a company-wide connection that is either working or not, and a form nobody
 * needs to look at once it is set up. Status in the section, form in a window.
 *
 * Two audiences share one section, which is deliberate. Somebody who can manage
 * company settings sees the provider and the company key; everybody who may use
 * the assistant sees whether their own key is saved. Splitting these into two
 * sections would put one subject in two places and force a person to check both
 * to answer "why is this not working". Instead the section answers that once,
 * for whoever is reading, and the blocks that do not apply to them are absent
 * rather than disabled — the difference between "you cannot" and "not yet".
 *
 * Keys are write-only throughout. The server never returns one, so this file
 * never has one to render: it renders whether a key is saved, which is the only
 * honest thing an empty box can mean.
 */
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, PencilLine, Sparkles, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { ApiClientError } from "@/shared/api/client";
import { useAuth } from "@/shared/auth";
import { hasPermission } from "@/shared/auth/authority";
import {
  Badge,
  Button,
  Field,
  FormDialog,
  Input,
  SettingRow,
  SettingsSection,
  Switch,
  WizardDialog,
  type WizardStep,
} from "@/shared/ui";
import { aiApi } from "./ai-api";

/*
 * https is required rather than preferred: the request carries an API key, and
 * over plain http that key is readable by anything on the path. The server
 * refuses it too — this copy exists so the person is told before they submit,
 * not after.
 */
const providerSchema = z.object({
  baseUrl: z
    .url()
    .max(512)
    .refine((value) => value.startsWith("https://"), { message: "httpsRequired" }),
  model: z.string().trim().min(1).max(200),
  apiKey: z.string().trim().max(512).optional(),
});

const personalKeySchema = z.object({ apiKey: z.string().trim().min(1).max(512) });

type ProviderForm = z.infer<typeof providerSchema>;
type PersonalKeyForm = z.infer<typeof personalKeySchema>;

export function AiAssistant({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const { t } = useTranslation();
  const auth = useAuth();
  const queryClient = useQueryClient();
  const [wizardOpen, setWizardOpen] = useState(false);
  const [keyDialogOpen, setKeyDialogOpen] = useState(false);

  const mayManage = hasPermission(auth.user, "settings.manage");

  const query = useQuery({
    queryKey: ["ai", "settings"],
    queryFn: aiApi.getSettings,
    retry: false,
  });

  const settings = query.data?.aiSettings;
  const configured = settings?.configured ?? false;

  const form = useForm<ProviderForm>({
    resolver: zodResolver(providerSchema),
    mode: "onChange",
    defaultValues: { baseUrl: "", model: "", apiKey: "" },
  });

  const keyForm = useForm<PersonalKeyForm>({
    resolver: zodResolver(personalKeySchema),
    defaultValues: { apiKey: "" },
  });

  useEffect(() => {
    if (!settings?.configured) return;
    form.reset({
      baseUrl: settings.baseUrl ?? "",
      model: settings.model ?? "",
      // Never prefilled. The server does not return it, and an empty box that
      // means "keep the saved one" is the only truthful representation.
      apiKey: "",
    });
  }, [form, settings]);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["ai", "settings"] });

  const save = useMutation({
    mutationFn: (values: ProviderForm) =>
      aiApi.saveSettings({
        baseUrl: values.baseUrl,
        model: values.model,
        ...(values.apiKey ? { apiKey: values.apiKey } : {}),
        // Saving a provider switches it on. Somebody who has just typed an
        // endpoint and a key has said what they want; making them find a
        // second control afterwards is a step that exists for no reason.
        enabled: true,
      }),
    onSuccess: async () => {
      await invalidate();
      form.setValue("apiKey", "");
    },
  });

  /*
   * Turning the assistant on or off is one decision and saves on its own. The
   * endpoint and model come from what is already stored rather than the form,
   * so pausing the assistant cannot silently rewrite a provider somebody edited
   * in the window and abandoned without saving.
   */
  const setEnabled = useMutation({
    mutationFn: (enabled: boolean) =>
      aiApi.saveSettings({
        baseUrl: settings?.baseUrl ?? "",
        model: settings?.model ?? "",
        enabled,
      }),
    onSuccess: invalidate,
  });

  const savePersonalKey = useMutation({
    mutationFn: (values: PersonalKeyForm) => aiApi.saveMyKey(values.apiKey),
    onSuccess: async () => {
      await invalidate();
      setKeyDialogOpen(false);
      keyForm.reset({ apiKey: "" });
    },
  });

  const removePersonalKey = useMutation({
    mutationFn: aiApi.deleteMyKey,
    onSuccess: invalidate,
  });

  const message = (error: unknown, fallback: string) =>
    error instanceof ApiClientError ? error.message : error ? fallback : null;

  const values = form.watch();
  const errors = form.formState.errors;

  const endpointReady = Boolean(values.baseUrl) && Boolean(values.model) && !errors.baseUrl && !errors.model;

  /*
   * A company that has never saved a key must supply one now; a company that
   * already has one may leave the box empty to keep it. The step knows which
   * situation it is in rather than always demanding a key, which would mean
   * re-entering a working credential to change a model name.
   */
  const keyReady = settings?.hasCompanyKey ? !errors.apiKey : Boolean(values.apiKey) && !errors.apiKey;

  const steps: WizardStep[] = [
    {
      id: "endpoint",
      title: t("settings.aiStepEndpoint"),
      description: t("settings.aiStepEndpointHelp"),
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
            <Input aria-label={t("settings.aiModel")} {...form.register("model")} />
          </Field>
        </>
      ),
    },
    {
      id: "key",
      title: t("settings.aiStepKey"),
      description: t("settings.aiStepKeyHelp"),
      isComplete: keyReady,
      content: (
        <Field
          label={t("settings.aiCompanyKey")}
          hint={settings?.hasCompanyKey ? t("settings.aiKeyKeep") : t("settings.aiKeyHint")}
          error={errors.apiKey?.message}
          required={!settings?.hasCompanyKey}
        >
          <Input
            data-autofocus="true"
            aria-label={t("settings.aiCompanyKey")}
            type="password"
            autoComplete="new-password"
            {...form.register("apiKey")}
          />
        </Field>
      ),
    },
    {
      id: "review",
      title: t("settings.aiStepReview"),
      description: t("settings.aiStepReviewHelp"),
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
            <dt>{t("settings.aiCompanyKey")}</dt>
            <dd>{values.apiKey ? t("settings.aiKeyNew") : t("settings.aiKeyUnchanged")}</dd>
          </div>
        </dl>
      ),
    },
  ];

  /*
   * One sentence for the state the whole thing is in, because "why is the
   * assistant not answering" has four different causes and a person should not
   * have to work out which one applies to them. The order matters: it names the
   * first thing standing in the way, not every one at once.
   */
  const statusLabel = (): { text: string; tone: "success" | "neutral" | "warning" } => {
    if (!configured) return { text: t("settings.aiNotConfigured"), tone: "neutral" };
    if (!settings?.enabled) return { text: t("settings.aiPaused"), tone: "neutral" };
    if (!settings.hasCompanyKey && !settings.hasPersonalKey)
      return { text: t("settings.aiNoKey"), tone: "warning" };
    return { text: t("settings.aiReady"), tone: "success" };
  };

  const status = statusLabel();

  return (
    <>
      <SettingsSection
        title={t("settings.aiTitle")}
        description={t("settings.aiDescription")}
        icon={<Sparkles size={18} strokeWidth={2} />}
        status={<Badge tone={status.tone}>{status.text}</Badge>}
        open={open}
        onToggle={onToggle}
      >
        {mayManage ? (
          configured ? (
            <>
              <SettingRow
                label={t("settings.aiEnable")}
                description={t("settings.aiEnableHelp")}
                control={
                  <Switch
                    aria-label={t("settings.aiEnable")}
                    label={t("settings.aiEnableToggle")}
                    checked={settings?.enabled ?? false}
                    disabled={setEnabled.isPending}
                    onChange={(event) => setEnabled.mutate(event.currentTarget.checked)}
                  />
                }
              />

              <SettingRow
                label={t("settings.aiProvider")}
                description={`${settings?.model ?? ""} · ${settings?.baseUrl ?? ""}`}
                control={
                  <Button variant="secondary" onClick={() => setWizardOpen(true)}>
                    <PencilLine size={16} strokeWidth={2} aria-hidden />
                    {t("settings.aiEdit")}
                  </Button>
                }
              />
            </>
          ) : (
            <SettingRow
              label={t("settings.aiNotConfigured")}
              description={t("settings.aiSetUpHelp")}
              control={
                <Button variant="primary" onClick={() => setWizardOpen(true)}>
                  {t("settings.aiSetUp")}
                </Button>
              }
            />
          )
        ) : (
          /*
           * Somebody who cannot configure the company provider is still told
           * whether it is working, because that is the answer to "why can I not
           * ask anything" and it is not a secret from the people expected to
           * use it. What is absent is the means to change it, not the fact.
           */
          <SettingRow
            label={t("settings.aiCompanyProvider")}
            description={
              configured && settings?.enabled
                ? t("settings.aiCompanyProviderOn")
                : t("settings.aiCompanyProviderOff")
            }
          />
        )}

        <SettingRow
          label={t("settings.aiPersonalKey")}
          description={
            settings?.hasPersonalKey
              ? t("settings.aiPersonalKeySaved")
              : t("settings.aiPersonalKeyHelp")
          }
          control={
            <div className="rect-settings-actions rect-settings-actions--inline">
              <Button variant="secondary" onClick={() => setKeyDialogOpen(true)}>
                <KeyRound size={16} strokeWidth={2} aria-hidden />
                {settings?.hasPersonalKey
                  ? t("settings.aiPersonalKeyReplace")
                  : t("settings.aiPersonalKeyAdd")}
              </Button>
              {settings?.hasPersonalKey ? (
                <Button
                  variant="ghost"
                  onClick={() => removePersonalKey.mutate()}
                  disabled={removePersonalKey.isPending}
                >
                  <Trash2 size={16} strokeWidth={2} aria-hidden />
                  {t("settings.aiPersonalKeyRemove")}
                </Button>
              ) : null}
            </div>
          }
        />

        {removePersonalKey.error ? (
          <p className="rect-settings-message rect-settings-message--error" role="alert">
            {message(removePersonalKey.error, t("settings.aiPersonalKeyRemoveFailed"))}
          </p>
        ) : null}
      </SettingsSection>

      <WizardDialog
        open={wizardOpen}
        title={configured ? t("settings.aiEditTitle") : t("settings.aiSetUpTitle")}
        description={t("settings.aiDescription")}
        size="lg"
        steps={steps}
        onClose={() => {
          setWizardOpen(false);
          save.reset();
        }}
        onFinish={() =>
          form.handleSubmit((formValues) =>
            save.mutateAsync(formValues).then(() => {
              setWizardOpen(false);
              save.reset();
            }),
          )()
        }
        finishLabel={t("settings.aiSave")}
        pending={save.isPending}
        error={message(save.error, t("settings.aiSaveFailed"))}
      />

      <FormDialog
        open={keyDialogOpen}
        title={t("settings.aiPersonalKeyTitle")}
        description={t("settings.aiPersonalKeyDialogHelp")}
        size="sm"
        onClose={() => {
          setKeyDialogOpen(false);
          savePersonalKey.reset();
        }}
        onSubmit={keyForm.handleSubmit((formValues) => savePersonalKey.mutate(formValues))}
        submitLabel={t("settings.aiPersonalKeySave")}
        pending={savePersonalKey.isPending}
        error={message(savePersonalKey.error, t("settings.aiPersonalKeySaveFailed"))}
      >
        <Field
          label={t("settings.aiPersonalKey")}
          hint={t("settings.aiPersonalKeyFieldHint")}
          error={keyForm.formState.errors.apiKey?.message}
          required
        >
          <Input
            data-autofocus="true"
            aria-label={t("settings.aiPersonalKey")}
            type="password"
            autoComplete="new-password"
            {...keyForm.register("apiKey")}
          />
        </Field>
      </FormDialog>
    </>
  );
}
