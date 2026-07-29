/** Settings manages personal preferences and company-wide configuration. */
import { zodResolver } from "@hookform/resolvers/zod";
import { KeyRound, Languages, Mail, ShieldCheck } from "lucide-react";
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
  Field,
  Input,
  SettingRow,
  SettingsSection,
  SettingsStack,
} from "@/shared/ui";
import { useRectangleI18n, type RectangleLanguage } from "@/shared/i18n";
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
  testRecipient: z.email().max(254).optional().or(z.literal("")),
});

type EmailForm = z.infer<typeof emailSchema>;

type SectionId = "language" | "email" | "separation" | "passkeys";

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
      testRecipient: "",
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
      testRecipient: "",
    });
  }, [emailForm, emailSettings.data?.emailSettings]);

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
            <SettingRow
              label={t("settings.emailEnable")}
              description={t("settings.emailEnableHelp")}
              control={<Checkbox label={t("settings.emailEnable")} {...emailForm.register("enabled")} />}
            />

            <SettingRow
              label={t("settings.emailServer")}
              description={t("settings.emailServerHelp")}
              stacked
            >
              <div className="rect-settings-grid">
                <Field
                  label={t("settings.emailHost")}
                  error={emailForm.formState.errors.host?.message}
                  required
                >
                  <Input aria-label={t("settings.emailHost")} {...emailForm.register("host")} />
                </Field>
                <Field
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
              <Checkbox label={t("settings.emailSecure")} {...emailForm.register("secure")} />
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

          <div className="rect-settings-divider" role="presentation" />

          <SettingRow
            label={t("settings.emailTest")}
            description={
              emailConfigured ? t("settings.emailTestHelp") : t("settings.emailRequiredFirst")
            }
            stacked
          >
            <form
              className="rect-settings-inline"
              onSubmit={emailForm.handleSubmit((values) =>
                values.testRecipient ? testEmail.mutate(values.testRecipient) : undefined,
              )}
            >
              <Field
                className="rect-settings-inline__field"
                label={t("settings.emailTestRecipient")}
                error={emailForm.formState.errors.testRecipient?.message}
              >
                <Input
                  aria-label={t("settings.emailTestRecipient")}
                  type="email"
                  {...emailForm.register("testRecipient")}
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
          </SettingRow>

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
