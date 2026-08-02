/** Settings manages personal preferences and company-wide configuration. */
import { zodResolver } from "@hookform/resolvers/zod";
import { BookOpen, KeyRound, Languages, Mail, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useForm } from "react-hook-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { ApiClientError } from "@/shared/api/client";
import { useAuth } from "@/shared/auth";
import {
  Badge,
  Button,
  EmptyState,
  ChoiceGroup,
  Checkbox,
  Switch,
  Field,
  Input,
  SettingRow,
  SettingsDivider,
  SettingsSection,
  SettingsStack,
} from "@/shared/ui";
import { useRectangleI18n, type RectangleLanguage } from "@/shared/i18n";
import { PermissionReference } from "./PermissionReference";
import { SeparationRules } from "./SeparationRules";
import { settingsApi } from "./settings-api";
import { listPasskeys, registerPasskey } from "./passkey-api";
import "./SettingsPage.css";

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
 * Sending a test is its own act, so it validates its own field and nothing
 * else. It used to live on the credentials form and run that form's validation,
 * which meant a company whose saved record no longer satisfies a current rule
 * could type a perfectly good address, press the button, and have nothing
 * happen at all — the refusal landing on a field they were not editing.
 */
const testEmailSchema = z.object({
  recipient: z.email().max(254),
});

type EmailForm = z.infer<typeof emailSchema>;
type TestEmailForm = z.infer<typeof testEmailSchema>;

type SectionId = "language" | "email" | "permissions" | "separation" | "passkeys";

function canManageCompanySettings(user: ReturnType<typeof useAuth>["user"]): boolean {
  if (!user) return false;
  return (
    user.roles.includes("owner") ||
    user.roles.includes("admin") ||
    user.permissions.includes("settings.manage")
  );
}

export default function SettingsPage() {
  const { t } = useTranslation();
  const auth = useAuth();
  const canManageCompany = canManageCompanySettings(auth.user);
  const { language, setLanguage } = useRectangleI18n();
  const queryClient = useQueryClient();

  // Only one section is expanded at a time so the page stays scannable.
  const [openSection, setOpenSection] = useState<SectionId | null>("language");
  const toggleSection = (id: SectionId) =>
    setOpenSection((current) => (current === id ? null : id));

  const emailSettings = useQuery({
    queryKey: ["settings", "email"],
    queryFn: settingsApi.getEmail,
    retry: false,
    enabled: canManageCompany,
  });
  const passkeys = useQuery({ queryKey: ["auth", "passkeys"], queryFn: listPasskeys, retry: false });

  const testEmailForm = useForm<TestEmailForm>({
    resolver: zodResolver(testEmailSchema),
    defaultValues: { recipient: "" },
  });

  const emailForm = useForm<EmailForm>({
    resolver: zodResolver(emailSchema),
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

  useEffect(() => {
    const value = emailSettings.data?.emailSettings;
    if (!value?.configured) return;
    emailForm.reset({
      enabled: value.enabled,
      host: value.host ?? "",
      port: value.port ?? 587,
      secure: value.secure ?? false,
      username: value.username ?? "",
      password: "",
      fromEmail: value.fromEmail ?? "",
      fromName: value.fromName ?? "Rectangle",
    });
  }, [emailForm, emailSettings.data?.emailSettings]);

  /*
   * A success notice that never clears is a lie after the first edit. Both
   * forms reset theirs the moment the person changes something, which is what
   * the project settings page already does — the same page should not answer
   * the same question two different ways.
   */
  const saveEmail = useMutation({
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
      emailForm.setValue("password", "");
    },
  });

  const testEmail = useMutation({
    mutationFn: (recipientEmail: string) => settingsApi.testEmail(recipientEmail),
  });

  /*
   * Editing either form clears its own notice. `react-hook-form` reports the
   * subscription's unsubscribe function, so it is returned from the effect.
   */
  useEffect(() => {
    const subscription = emailForm.watch(() => saveEmail.reset());
    return () => subscription.unsubscribe();
  }, [emailForm, saveEmail]);

  useEffect(() => {
    const subscription = testEmailForm.watch(() => testEmail.reset());
    return () => subscription.unsubscribe();
  }, [testEmailForm, testEmail]);


  const addPasskey = useMutation({
    mutationFn: registerPasskey,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["auth", "passkeys"] });
    },
  });

  const saveError =
    saveEmail.error instanceof ApiClientError
      ? saveEmail.error.message
      : saveEmail.error
        ? t("settings.emailSaveFailed")
        : null;
  const testError =
    testEmail.error instanceof ApiClientError
      ? testEmail.error.message
      : testEmail.error
        ? t("settings.emailTestFailed")
        : null;

  const emailConfigured = emailSettings.data?.emailSettings.configured ?? false;
  const passkeyList = passkeys.data?.passkeys ?? [];

  // Language is always available, so this only triggers if every section is
  // ever gated away. It keeps the page honest rather than blank.
  const hasAnySection = true;
  if (!hasAnySection) {
    return <EmptyState title={t("settings.noSectionsTitle")} message={t("settings.noSectionsMessage")} />;
  }

  return (
    <SettingsStack className="rect-settings-page" aria-label={t("feature.settings")}>
      <SettingsSection
        title={t("settings.languageTitle")}
        description={t("settings.languageDescription")}
        icon={<Languages size={18} strokeWidth={2} />}
        open={openSection === "language"}
        onToggle={() => toggleSection("language")}
      >
        <SettingRow
          label={t("settings.interfaceLanguage")}
          description={t("settings.interfaceLanguageHelp")}
          control={
            <ChoiceGroup<RectangleLanguage>
              label={t("settings.interfaceLanguage")}
              value={language}
              onChange={(next) => void setLanguage(next)}
              options={[
                {
                  value: "en",
                  label: t("settings.english"),
                  hint: t("settings.directionLtr"),
                },
                {
                  value: "ar",
                  label: t("settings.arabic"),
                  hint: t("settings.directionRtl"),
                },
              ]}
            />
          }
        />
      </SettingsSection>

      {canManageCompany ? (
        <SettingsSection
          title={t("settings.emailTitle")}
          description={t("settings.emailDescription")}
          icon={<Mail size={18} strokeWidth={2} />}
          status={
            <Badge tone={emailConfigured ? "success" : "neutral"}>
              {emailConfigured ? t("settings.emailConfigured") : t("settings.emailNotConfigured")}
            </Badge>
          }
          open={openSection === "email"}
          onToggle={() => toggleSection("email")}
        >
          <form
            className="rect-settings-form"
            onSubmit={emailForm.handleSubmit((values) => saveEmail.mutate(values))}
          >
            {/*
              * A switch, not a checkbox. This turns a capability on and off for
              * the whole company and takes effect on save; a checkbox says "one
              * of several choices" and reads as part of the form below it.
              *
              * The row states what the setting is, so the control must not
              * repeat it — printing "Send email from Rectangle" twice, once as
              * the row label and again beside the control, read as a rendering
              * fault. The switch still needs its own accessible name because
              * the row's label is a span, not a `label` element.
              */}
            <SettingRow
              label={t("settings.emailEnable")}
              description={t("settings.emailEnableHelp")}
              control={
                <Switch
                  label={t("settings.emailEnableToggle")}
                  aria-label={t("settings.emailEnable")}
                  {...emailForm.register("enabled")}
                />
              }
            />

            <SettingRow
              label={t("settings.emailServer")}
              description={t("settings.emailServerHelp")}
              stacked
            >
              {/*
                * Address and port on one line, because they are one fact: a
                * port is meaningless without the host it belongs to. The port
                * is given the narrow width its four digits actually need —
                * stretching it to match the address made a number look like a
                * long answer and is the kind of mismatch that makes people
                * re-read the label.
                */}
              <div className="rect-settings-row">
                <Field
                  className="rect-settings-row__grow"
                  label={t("settings.emailHost")}
                  error={emailForm.formState.errors.host?.message}
                  required
                >
                  <Input aria-label={t("settings.emailHost")} {...emailForm.register("host")} />
                </Field>
                <Field
                  className="rect-settings-row__port"
                  label={t("settings.emailPort")}
                  error={emailForm.formState.errors.port?.message}
                  required
                >
                  <Input
                    aria-label={t("settings.emailPort")}
                    inputMode="numeric"
                    {...emailForm.register("port", { valueAsNumber: true })}
                  />
                </Field>
              </div>

              {/*
                * Immediately beneath the address and port it qualifies. It used
                * to sit after the credentials, where it read as a property of
                * the password rather than of the connection.
                */}
              <Checkbox label={t("settings.emailSecure")} {...emailForm.register("secure")} />

              <div className="rect-settings-grid">
                <Field
                  label={t("settings.emailUsername")}
                  error={emailForm.formState.errors.username?.message}
                  required
                >
                  <Input aria-label={t("settings.emailUsername")} {...emailForm.register("username")} />
                </Field>
                <Field
                  label={t("settings.emailPassword")}
                  hint={
                    emailSettings.data?.emailSettings.hasPassword
                      ? t("settings.emailPasswordKeep")
                      : undefined
                  }
                  error={emailForm.formState.errors.password?.message}
                >
                  <Input
                    aria-label={t("settings.emailPassword")}
                    type="password"
                    {...emailForm.register("password")}
                  />
                </Field>
              </div>
            </SettingRow>

            <SettingRow
              label={t("settings.emailSender")}
              description={t("settings.emailSenderHelp")}
              stacked
            >
              <div className="rect-settings-grid">
                <Field
                  label={t("settings.emailFromAddress")}
                  error={emailForm.formState.errors.fromEmail?.message}
                  required
                >
                  <Input
                    aria-label={t("settings.emailFromAddress")}
                    type="email"
                    {...emailForm.register("fromEmail")}
                  />
                </Field>
                <Field
                  label={t("settings.emailFromName")}
                  error={emailForm.formState.errors.fromName?.message}
                  required
                >
                  <Input aria-label={t("settings.emailFromName")} {...emailForm.register("fromName")} />
                </Field>
              </div>
            </SettingRow>

            {saveError ? (
              <p className="rect-settings-message rect-settings-message--error" role="alert">
                {saveError}
              </p>
            ) : null}
            {saveEmail.isSuccess ? (
              <p className="rect-settings-message rect-settings-message--success" role="status">
                {t("settings.emailSaved")}
              </p>
            ) : null}

            <div className="rect-settings-actions">
              <Button variant="primary" type="submit" disabled={saveEmail.isPending}>
                {saveEmail.isPending ? t("common.saving") : t("settings.emailSave")}
              </Button>
            </div>
          </form>

          <SettingsDivider />

          <SettingRow
            label={t("settings.emailTest")}
            description={
              emailConfigured ? t("settings.emailTestHelp") : t("settings.emailRequiredFirst")
            }
            stacked
          >
            <form
              className="rect-settings-inline"
              onSubmit={testEmailForm.handleSubmit((values) => testEmail.mutate(values.recipient))}
            >
              <Field
                className="rect-settings-inline__field"
                label={t("settings.emailTestRecipient")}
                error={testEmailForm.formState.errors.recipient?.message}
              >
                <Input
                  aria-label={t("settings.emailTestRecipient")}
                  type="email"
                  {...testEmailForm.register("recipient")}
                />
              </Field>
              <Button
                variant="secondary"
                type="submit"
                disabled={testEmail.isPending || !emailConfigured}
              >
                {testEmail.isPending ? t("settings.emailTestSending") : t("settings.emailTestAction")}
              </Button>
            </form>

            {/*
              * Inside the row it belongs to, like every other message on this
              * page. Outside it, the notice sat against the section edge and
              * read as a comment on the whole of email delivery rather than on
              * the send that just happened.
              */}
            {testError ? (
              <p className="rect-settings-message rect-settings-message--error" role="alert">
                {testError}
              </p>
            ) : null}
            {testEmail.isSuccess ? (
              <p className="rect-settings-message rect-settings-message--success" role="status">
                {t("settings.emailTestSent")}
              </p>
            ) : null}
          </SettingRow>
        </SettingsSection>
      ) : null}

      {/*
        Placed before separation of duties: somebody declaring which permissions
        must stay apart needs to know what the permissions are first.
      */}
      {canManageCompany ? (
        <SettingsSection
          title={t("settings.permissionsTitle")}
          description={t("settings.permissionsDescription")}
          icon={<BookOpen size={18} strokeWidth={2} />}
          open={openSection === "permissions"}
          onToggle={() => toggleSection("permissions")}
        >
          <PermissionReference />
        </SettingsSection>
      ) : null}

      {/*
        Company policy, so it sits with the rest of company configuration
        rather than on the Team page. Team is people and the roles they hold;
        this is a constraint on what those roles may combine, and gating it on
        the same permission as the other company section keeps that consistent.
      */}
      {canManageCompany ? (
        <SettingsSection
          title={t("settings.separationTitle")}
          description={t("settings.separationDescription")}
          icon={<ShieldCheck size={18} strokeWidth={2} />}
          open={openSection === "separation"}
          onToggle={() => toggleSection("separation")}
        >
          <SeparationRules />
        </SettingsSection>
      ) : null}

      <SettingsSection
        title={t("settings.passkeysTitle")}
        description={t("settings.passkeysDescription")}
        icon={<KeyRound size={18} strokeWidth={2} />}
        status={<Badge tone="neutral">{t("settings.passkeysCount", { count: passkeyList.length })}</Badge>}
        open={openSection === "passkeys"}
        onToggle={() => toggleSection("passkeys")}
      >
        <SettingRow
          label={t("settings.passkeysTitle")}
          description={t("settings.passkeysDescription")}
          control={
            <Button
              variant="secondary"
              onClick={() => addPasskey.mutate()}
              disabled={addPasskey.isPending}
            >
              {addPasskey.isPending ? t("settings.passkeysAdding") : t("settings.passkeysAdd")}
            </Button>
          }
        />

        {addPasskey.error ? (
          <p className="rect-settings-message rect-settings-message--error" role="alert">
            {t("settings.passkeysAddFailed")}
          </p>
        ) : null}

        {passkeyList.length === 0 ? (
          <p className="rect-settings-message">{t("settings.passkeysEmpty")}</p>
        ) : (
          <ul className="rect-settings-list">
            {passkeyList.map((passkey) => (
              <li key={passkey.id} className="rect-settings-list__item">
                <span className="rect-settings-list__name">{passkey.name}</span>
                <span className="rect-settings-list__meta">
                  {t("settings.passkeysAddedOn", {
                    date: new Date(passkey.createdAt).toLocaleDateString(),
                  })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </SettingsSection>
    </SettingsStack>
  );
}
