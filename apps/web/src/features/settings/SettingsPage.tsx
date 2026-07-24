/** Settings page manages personal preferences and company-wide configuration. */
import { zodResolver } from "@hookform/resolvers/zod";
import { KeyRound, Languages, Mail } from "lucide-react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useForm } from "react-hook-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { ApiClientError } from "@/shared/api/client";
import { useAuth } from "@/shared/auth";
import { Badge, Button, Card, Checkbox, Field, Input, Toolbar } from "@/shared/ui";
import { useRectangleI18n, type RectangleLanguage } from "@/shared/i18n";
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

function canManageCompanySettings(user: ReturnType<typeof useAuth>["user"]): boolean {
  if (!user) return false;
  return user.roles.includes("tenant_owner") || user.roles.includes("tenant_admin") || user.permissions.includes("settings.manage");
}

export default function SettingsPage() {
  const { t } = useTranslation();
  const auth = useAuth();
  const canManageEmail = canManageCompanySettings(auth.user);
  const { language, direction, setLanguage } = useRectangleI18n();
  const queryClient = useQueryClient();
  const emailSettings = useQuery({ queryKey: ["settings", "email"], queryFn: settingsApi.getEmail, retry: false, enabled: canManageEmail });
  const passkeys = useQuery({ queryKey: ["auth", "passkeys"], queryFn: listPasskeys, retry: false });
  const emailForm = useForm<EmailForm>({ resolver: zodResolver(emailSchema), defaultValues: { enabled: true, host: "", port: 587, secure: false, username: "", password: "", fromEmail: "", fromName: "Rectangle", testRecipient: "" } });

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

  async function selectLanguage(nextLanguage: RectangleLanguage) {
    if (nextLanguage !== language) await setLanguage(nextLanguage);
  }

  const saveEmail = useMutation({
    mutationFn: (values: EmailForm) => settingsApi.saveEmail({
      enabled: values.enabled,
      host: values.host,
      port: values.port,
      secure: values.secure,
      username: values.username,
      ...(values.password ? { password: values.password } : {}),
      fromEmail: values.fromEmail,
      fromName: values.fromName,
    }),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["settings", "email"] }); emailForm.setValue("password", ""); },
  });

  const testEmail = useMutation({ mutationFn: (recipientEmail: string) => settingsApi.testEmail(recipientEmail) });
  const addPasskey = useMutation({ mutationFn: registerPasskey, onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["auth", "passkeys"] }); } });

  const saveError = saveEmail.error instanceof ApiClientError ? saveEmail.error.message : saveEmail.error ? "Email settings could not be saved." : null;
  const testError = testEmail.error instanceof ApiClientError ? testEmail.error.message : testEmail.error ? "Test email could not be sent." : null;

  return (
    <section className="rect-settings-page" aria-label="Settings">
      <details className="rect-settings-disclosure" open>
        <summary>
          <span className="rect-settings-section__icon" aria-hidden><Languages size={18} strokeWidth={2} /></span>
          <span><h2>{t("settings.languageTitle")}</h2><small>{t("settings.activeLanguage")}: {language === "ar" ? t("settings.arabic") : t("settings.english")}</small></span>
          <Badge tone="info">{direction.toUpperCase()}</Badge>
        </summary>
        <Card className="rect-settings-section rect-settings-section--inside">
          <Toolbar className="rect-settings-section__actions" aria-label={t("settings.activeLanguage")}>
            <Button variant={language === "en" ? "primary" : "secondary"} aria-pressed={language === "en"} onClick={() => void selectLanguage("en")}>{t("settings.english")}</Button>
            <Button variant={language === "ar" ? "primary" : "secondary"} aria-pressed={language === "ar"} onClick={() => void selectLanguage("ar")}>{t("settings.arabic")}</Button>
          </Toolbar>
        </Card>
      </details>

      {canManageEmail ? (
        <details className="rect-settings-disclosure">
          <summary>
            <span className="rect-settings-section__icon" aria-hidden><Mail size={18} strokeWidth={2} /></span>
            <span><h2>Email delivery</h2><small>Company-wide SMTP for invitations, reset emails, approvals, and reminders.</small></span>
            <Badge tone={emailSettings.data?.emailSettings.enabled ? "success" : "neutral"}>{emailSettings.data?.emailSettings.configured ? "Configured" : "Not set"}</Badge>
          </summary>
          <Card className="rect-settings-email rect-settings-section--inside">
            <form className="rect-settings-email__form" onSubmit={emailForm.handleSubmit((values) => saveEmail.mutate(values))}>
              <Checkbox label="Enable email delivery" {...emailForm.register("enabled")} />
              <div className="rect-settings-email__grid">
                <Field label="SMTP host" error={emailForm.formState.errors.host?.message} required><Input aria-label="SMTP host" {...emailForm.register("host")} /></Field>
                <Field label="Port" error={emailForm.formState.errors.port?.message} required><Input aria-label="Port" inputMode="numeric" {...emailForm.register("port", { valueAsNumber: true })} /></Field>
                <Field label="Username" error={emailForm.formState.errors.username?.message} required><Input aria-label="Username" {...emailForm.register("username")} /></Field>
                <Field label="Password" hint={emailSettings.data?.emailSettings.hasPassword ? "Leave blank to keep current password." : undefined} error={emailForm.formState.errors.password?.message}><Input aria-label="Password" type="password" {...emailForm.register("password")} /></Field>
                <Field label="From email" error={emailForm.formState.errors.fromEmail?.message} required><Input aria-label="From email" type="email" {...emailForm.register("fromEmail")} /></Field>
                <Field label="From name" error={emailForm.formState.errors.fromName?.message} required><Input aria-label="From name" {...emailForm.register("fromName")} /></Field>
              </div>
              <Checkbox label="Use SSL/TLS connection" {...emailForm.register("secure")} />
              {saveError ? <p className="rect-settings-error" role="alert">{saveError}</p> : null}
              {saveEmail.isSuccess ? <p className="rect-settings-success" role="status">Email settings saved.</p> : null}
              <Toolbar className="rect-settings-email__actions"><Button variant="primary" type="submit" disabled={saveEmail.isPending}>{saveEmail.isPending ? "Saving…" : "Save email settings"}</Button></Toolbar>
            </form>
            <form className="rect-settings-email__test" onSubmit={emailForm.handleSubmit((values) => values.testRecipient ? testEmail.mutate(values.testRecipient) : undefined)}>
              <Field label="Send test email to" error={emailForm.formState.errors.testRecipient?.message}><Input aria-label="Send test email to" type="email" {...emailForm.register("testRecipient")} /></Field>
              <Button variant="secondary" type="submit" disabled={testEmail.isPending || !emailSettings.data?.emailSettings.configured}>{testEmail.isPending ? "Sending…" : "Send test email"}</Button>
            </form>
            {testError ? <p className="rect-settings-error" role="alert">{testError}</p> : null}
            {testEmail.isSuccess ? <p className="rect-settings-success" role="status">Test email sent.</p> : null}
          </Card>
        </details>
      ) : null}

      <details className="rect-settings-disclosure">
        <summary>
          <span className="rect-settings-section__icon" aria-hidden><KeyRound size={18} strokeWidth={2} /></span>
          <span><h2>Passkeys</h2><small>Sign in faster with your device unlock or security key.</small></span>
          <Badge tone="info">{passkeys.data?.passkeys.length ?? 0}</Badge>
        </summary>
        <Card className="rect-settings-email rect-settings-section--inside">
          <Toolbar><Button variant="secondary" onClick={() => addPasskey.mutate()} disabled={addPasskey.isPending}>{addPasskey.isPending ? "Adding…" : "Add passkey"}</Button></Toolbar>
          {addPasskey.error ? <p className="rect-settings-error" role="alert">Passkey could not be added.</p> : null}
          <div className="rect-settings-passkeys">
            {(passkeys.data?.passkeys ?? []).length === 0 ? <p>No passkeys added yet.</p> : (passkeys.data?.passkeys ?? []).map((passkey) => <p key={passkey.id}>{passkey.name} · {new Date(passkey.createdAt).toLocaleDateString()}</p>)}
          </div>
        </Card>
      </details>
    </section>
  );
}
