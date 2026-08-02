/**
 * Company mail delivery: what the state is, and two ways to change it.
 *
 * This used to be two hundred lines inside one accordion panel — an enable
 * switch, four server fields, a secure checkbox, two sender fields, a save bar,
 * a divider and a test-send form, all arriving at once. Opening it dropped a
 * wall on the reader, and it was the only section on the page that behaved that
 * way: language is a single row, the access sections open a surface of their
 * own, passkeys is a short list.
 *
 * So the section states the situation and offers actions. Configuring is a
 * deliberate act in a focused window, and because the configuration genuinely
 * has three parts — where the mail goes out, who it appears to come from, and
 * whether that actually works — it is asked one part at a time. The last step
 * is a real send, so finishing the wizard means the thing is proved rather than
 * merely saved.
 *
 * The wizard itself is `WizardDialog` from the shared library and knows nothing
 * about mail. This file is its first caller, not its owner.
 */
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Mail, PencilLine, Send } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { ApiClientError } from "@/shared/api/client";
import {
  Badge,
  Button,
  Checkbox,
  Field,
  FormDialog,
  Input,
  SettingRow,
  SettingsSection,
  Switch,
  WizardDialog,
  type WizardStep,
} from "@/shared/ui";
import { settingsApi } from "./settings-api";

const emailSchema = z.object({
  enabled: z.boolean(),
  host: z.string().trim().min(2).max(255),
  port: z.number().int().min(1).max(65535),
  secure: z.boolean(),
  username: z.string().trim().min(1).max(255),
  password: z.string().max(512).optional(),
  fromEmail: z.email().max(254),
  fromName: z.string().trim().min(1).max(160),
});

/*
 * Sending a test validates its own field and nothing else. It used to run the
 * credentials form's validation, so a company whose saved record no longer
 * satisfies a current rule could type a perfectly good address, press the
 * button, and have nothing happen — the refusal landing on a field they were
 * not editing.
 */
const testEmailSchema = z.object({ recipient: z.email().max(254) });

type EmailForm = z.infer<typeof emailSchema>;
type TestEmailForm = z.infer<typeof testEmailSchema>;

export function EmailDelivery({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [wizardOpen, setWizardOpen] = useState(false);
  const [testOpen, setTestOpen] = useState(false);

  const emailSettings = useQuery({
    queryKey: ["settings", "email"],
    queryFn: settingsApi.getEmail,
    retry: false,
  });

  const settings = emailSettings.data?.emailSettings;
  const configured = settings?.configured ?? false;

  const form = useForm<EmailForm>({
    resolver: zodResolver(emailSchema),
    mode: "onChange",
    defaultValues: {
      enabled: true,
      host: "",
      port: 587,
      secure: false,
      username: "",
      password: "",
      fromEmail: "",
      fromName: "Rectangle",
    },
  });

  const testForm = useForm<TestEmailForm>({
    resolver: zodResolver(testEmailSchema),
    defaultValues: { recipient: "" },
  });

  useEffect(() => {
    if (!settings?.configured) return;
    form.reset({
      enabled: settings.enabled,
      host: settings.host ?? "",
      port: settings.port ?? 587,
      secure: settings.secure ?? false,
      username: settings.username ?? "",
      // Never prefilled. The server does not return it, and an empty box that
      // means "keep the saved one" is the only honest representation.
      password: "",
      fromEmail: settings.fromEmail ?? "",
      fromName: settings.fromName ?? "Rectangle",
    });
  }, [form, settings]);

  const save = useMutation({
    mutationFn: (values: EmailForm) =>
      settingsApi.saveEmail({
        enabled: values.enabled,
        host: values.host,
        port: values.port,
        secure: values.secure,
        username: values.username,
        ...(values.password ? { password: values.password } : {}),
        fromEmail: values.fromEmail,
        fromName: values.fromName,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["settings", "email"] });
      form.setValue("password", "");
    },
  });

  const test = useMutation({
    mutationFn: (recipient: string) => settingsApi.testEmail(recipient),
  });

  /*
   * Switching sending on or off is one decision and saves on its own. Making
   * somebody walk a three-step wizard to pause outgoing mail would be the
   * opposite of what the wizard is for.
   */
  const setEnabled = useMutation({
    mutationFn: (enabled: boolean) => {
      const values = form.getValues();
      return settingsApi.saveEmail({
        enabled,
        host: values.host,
        port: values.port,
        secure: values.secure,
        username: values.username,
        fromEmail: values.fromEmail,
        fromName: values.fromName,
      });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["settings", "email"] }),
  });

  const message = (error: unknown, fallback: string) =>
    error instanceof ApiClientError ? error.message : error ? fallback : null;

  const values = form.watch();
  const errors = form.formState.errors;

  /*
   * Each step reports whether it may be left. Read from the resolver's own
   * errors plus presence, so the wizard and the schema cannot disagree about
   * what "valid" means.
   */
  const serverReady =
    values.host?.trim().length >= 2 &&
    Number.isInteger(values.port) &&
    values.username?.trim().length >= 1 &&
    !errors.host &&
    !errors.port &&
    !errors.username;

  const senderReady =
    values.fromEmail?.length > 0 && values.fromName?.trim().length >= 1 && !errors.fromEmail && !errors.fromName;

  const steps: WizardStep[] = [
    {
      id: "server",
      title: t("settings.emailStepServer"),
      description: t("settings.emailServerHelp"),
      isComplete: serverReady,
      content: (
        <>
          <div className="rect-settings-row">
            <Field
              className="rect-settings-row__grow"
              label={t("settings.emailHost")}
              error={errors.host?.message}
              required
            >
              <Input data-autofocus="true" aria-label={t("settings.emailHost")} {...form.register("host")} />
            </Field>
            <Field
              className="rect-settings-row__port"
              label={t("settings.emailPort")}
              error={errors.port?.message}
              required
            >
              <Input
                aria-label={t("settings.emailPort")}
                inputMode="numeric"
                {...form.register("port", { valueAsNumber: true })}
              />
            </Field>
          </div>

          {/* Qualifies the address and port above, so it sits with them. */}
          <Checkbox label={t("settings.emailSecure")} {...form.register("secure")} />

          <div className="rect-settings-grid">
            <Field label={t("settings.emailUsername")} error={errors.username?.message} required>
              <Input aria-label={t("settings.emailUsername")} {...form.register("username")} />
            </Field>
            <Field
              label={t("settings.emailPassword")}
              hint={settings?.hasPassword ? t("settings.emailPasswordKeep") : undefined}
              error={errors.password?.message}
            >
              <Input
                aria-label={t("settings.emailPassword")}
                type="password"
                autoComplete="new-password"
                {...form.register("password")}
              />
            </Field>
          </div>
        </>
      ),
    },
    {
      id: "sender",
      title: t("settings.emailStepSender"),
      description: t("settings.emailSenderHelp"),
      isComplete: senderReady,
      content: (
        <div className="rect-settings-grid">
          <Field label={t("settings.emailFromAddress")} error={errors.fromEmail?.message} required>
            <Input
              aria-label={t("settings.emailFromAddress")}
              type="email"
              {...form.register("fromEmail")}
            />
          </Field>
          <Field label={t("settings.emailFromName")} error={errors.fromName?.message} required>
            <Input aria-label={t("settings.emailFromName")} {...form.register("fromName")} />
          </Field>
        </div>
      ),
    },
    {
      id: "review",
      title: t("settings.emailStepReview"),
      description: t("settings.emailStepReviewHelp"),
      content: (
        <dl className="rect-email-review">
          <div className="rect-email-review__row">
            <dt>{t("settings.emailServer")}</dt>
            <dd>
              {values.host}:{values.port}
              {values.secure ? ` · ${t("settings.emailSecureShort")}` : ""}
            </dd>
          </div>
          <div className="rect-email-review__row">
            <dt>{t("settings.emailUsername")}</dt>
            <dd>{values.username}</dd>
          </div>
          <div className="rect-email-review__row">
            <dt>{t("settings.emailSender")}</dt>
            <dd>
              {values.fromName} &lt;{values.fromEmail}&gt;
            </dd>
          </div>
        </dl>
      ),
    },
  ];

  return (
    <>
      <SettingsSection
        title={t("settings.emailTitle")}
        description={t("settings.emailDescription")}
        icon={<Mail size={18} strokeWidth={2} />}
        status={
          <Badge tone={configured ? "success" : "neutral"}>
            {configured ? t("settings.emailConfigured") : t("settings.emailNotConfigured")}
          </Badge>
        }
        open={open}
        onToggle={onToggle}
      >
        {configured ? (
          <>
            {/*
              * The two facts somebody opens this section to check: whether mail
              * is going out at all, and what address it appears to come from.
              */}
            <SettingRow
              label={t("settings.emailEnable")}
              description={t("settings.emailEnableHelp")}
              control={
                <Switch
                  aria-label={t("settings.emailEnable")}
                  label={t("settings.emailEnableToggle")}
                  checked={settings?.enabled ?? false}
                  disabled={setEnabled.isPending}
                  onChange={(event) => setEnabled.mutate(event.currentTarget.checked)}
                />
              }
            />

            <SettingRow
              label={t("settings.emailSender")}
              description={`${settings?.fromName ?? ""} <${settings?.fromEmail ?? ""}>`}
              control={
                <div className="rect-settings-actions rect-settings-actions--inline">
                  <Button variant="secondary" onClick={() => setWizardOpen(true)}>
                    <PencilLine size={16} strokeWidth={2} aria-hidden />
                    {t("settings.emailEdit")}
                  </Button>
                  <Button variant="ghost" onClick={() => setTestOpen(true)}>
                    <Send size={16} strokeWidth={2} aria-hidden />
                    {t("settings.emailTestAction")}
                  </Button>
                </div>
              }
            />
          </>
        ) : (
          /*
           * Nothing to show but the one thing to do. A company that has not set
           * this up does not need a form; it needs to be told what this is for
           * and given the way in.
           */
          <SettingRow
            label={t("settings.emailNotConfigured")}
            description={t("settings.emailSetUpHelp")}
            control={
              <Button variant="primary" onClick={() => setWizardOpen(true)}>
                {t("settings.emailSetUp")}
              </Button>
            }
          />
        )}
      </SettingsSection>

      <WizardDialog
        open={wizardOpen}
        title={configured ? t("settings.emailEditTitle") : t("settings.emailSetUpTitle")}
        description={t("settings.emailDescription")}
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
        finishLabel={t("settings.emailSave")}
        pending={save.isPending}
        error={message(save.error, t("settings.emailSaveFailed"))}
      />

      <FormDialog
        open={testOpen}
        title={t("settings.emailTest")}
        description={t("settings.emailTestHelp")}
        size="sm"
        onClose={() => {
          setTestOpen(false);
          test.reset();
        }}
        onSubmit={testForm.handleSubmit((formValues) => test.mutate(formValues.recipient))}
        submitLabel={t("settings.emailTestAction")}
        pendingLabel={t("settings.emailTestSending")}
        pending={test.isPending}
        error={message(test.error, t("settings.emailTestFailed"))}
      >
        <Field
          label={t("settings.emailTestRecipient")}
          error={testForm.formState.errors.recipient?.message}
          required
        >
          <Input
            data-autofocus="true"
            aria-label={t("settings.emailTestRecipient")}
            type="email"
            {...testForm.register("recipient")}
          />
        </Field>
        {test.isSuccess ? (
          <p className="rect-settings-message rect-settings-message--success" role="status">
            {t("settings.emailTestSent")}
          </p>
        ) : null}
      </FormDialog>
    </>
  );
}
