/**
 * Your own profile.
 *
 * Everything here acts on the signed-in person, so nothing is permission
 * gated — the subject and the actor are the same. The page exists because
 * Rectangle showed people's names throughout the product while giving them no
 * way to see or correct their own.
 */
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { ApiClientError } from "@/shared/api/client";
import { useOptionalAuth } from "@/shared/auth";
import { getCurrentLanguage } from "@/shared/i18n";
import {
  Avatar, Badge, Button, ErrorState, Field, Input, LoadingState,
  SettingRow, SettingsSection, SettingsStack, useToast,
} from "@/shared/ui";
import { requestEmailChange } from "@/features/auth-lifecycle/lifecycle-api";
import { changePassword, getProfile, updateProfile } from "./profile-api";
import "./ProfilePage.css";

const identitySchema = z.object({
  displayName: z.string().trim().min(2).max(160),
});

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1),
    newPassword: z
      .string()
      .min(12)
      .max(256)
      .regex(/[a-z]/u)
      .regex(/[A-Z]/u)
      .regex(/[0-9]/u),
    confirmPassword: z.string().min(1),
  })
  .superRefine((value, context) => {
    // Caught here as well as by the API, because a typo in a field the user
    // cannot see the contents of is worth catching before a round trip.
    if (value.newPassword !== value.confirmPassword) {
      context.addIssue({ code: "custom", path: ["confirmPassword"], message: "mismatch" });
    }
  });

type IdentityForm = z.infer<typeof identitySchema>;
type PasswordForm = z.infer<typeof passwordSchema>;

type SectionId = "identity" | "email" | "password" | "access";

const emailSchema = z.object({
  newEmail: z.email().max(254),
  currentPassword: z.string().min(1),
});

type EmailForm = z.infer<typeof emailSchema>;

export default function ProfilePage() {
  const { t } = useTranslation();
  const language = getCurrentLanguage();
  const auth = useOptionalAuth();
  const queryClient = useQueryClient();

  const [openSection, setOpenSection] = useState<SectionId | null>("identity");
  const toast = useToast();

  const profile = useQuery({ queryKey: ["profile"], queryFn: getProfile });
  const record = profile.data?.profile;

  const identityForm = useForm<IdentityForm>({
    resolver: zodResolver(identitySchema),
    defaultValues: { displayName: "" },
  });
  const emailForm = useForm<EmailForm>({
    resolver: zodResolver(emailSchema),
    defaultValues: { newEmail: "", currentPassword: "" },
  });
  const passwordForm = useForm<PasswordForm>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" },
  });

  // Filled from the loaded record rather than left blank, so the field shows
  // the current name instead of asking the person to retype it.
  useEffect(() => {
    if (record) identityForm.reset({ displayName: record.displayName });
  }, [record, identityForm]);

  const saveIdentity = useMutation({
    mutationFn: (values: IdentityForm) => updateProfile(values),
    onSuccess: async () => {
      toast.success(t("profile.saved"));
      // The shell shows this name, so its copy is now stale.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["profile"] }),
        queryClient.invalidateQueries({ queryKey: ["me"] }),
      ]);
      await auth?.refresh();
    },
  });

  const changeEmail = useMutation({
    mutationFn: (values: EmailForm) => requestEmailChange(values),
    onSuccess: () => {
      toast.success(t("profile.emailPending"), { description: t("profile.emailPendingDetail") });
      emailForm.reset();
    },
  });

  const savePassword = useMutation({
    mutationFn: (values: PasswordForm) =>
      changePassword({ currentPassword: values.currentPassword, newPassword: values.newPassword }),
    onSuccess: (result) => {
      toast.success(
        result.revokedSessions > 0
          ? t("profile.passwordChangedSignedOut", { count: result.revokedSessions })
          : t("profile.passwordChanged"),
      );
      passwordForm.reset();
    },
  });

  const messageFor = (error: unknown, fallback: string) =>
    error instanceof ApiClientError ? error.message : error ? fallback : null;

  if (profile.isLoading) {
    return <LoadingState title={t("profile.loadingTitle")} message={t("profile.loadingMessage")} />;
  }

  if (profile.isError || !record) {
    return (
      <ErrorState
        title={t("profile.errorTitle")}
        message={t("profile.errorMessage")}
        action={
          <Button variant="secondary" onClick={() => void profile.refetch()}>
            {t("profile.tryAgain")}
          </Button>
        }
      />
    );
  }

  const toggle = (id: SectionId) => setOpenSection((current) => (current === id ? null : id));
  const joined = new Intl.DateTimeFormat(language, { dateStyle: "long" }).format(
    new Date(record.createdAt),
  );

  return (
    <section className="rect-profile" aria-label={t("profile.pageLabel")}>
      <header className="rect-profile__head">
        <Avatar name={record.displayName} colorKey={record.userId} />
        <span className="rect-profile__identity">
          <span className="rect-profile__name">{record.displayName}</span>
          <span className="rect-profile__email">{record.email}</span>
        </span>
      </header>

      <SettingsStack>
        <SettingsSection
          title={t("profile.identityTitle")}
          description={t("profile.identityDescription")}
          open={openSection === "identity"}
          onToggle={() => toggle("identity")}
        >
          <form
            className="rect-profile__form"
            onSubmit={identityForm.handleSubmit((values) => saveIdentity.mutate(values))}
          >
            <Field
              label={t("profile.displayName")}
              error={identityForm.formState.errors.displayName?.message}
              required
            >
              <Input {...identityForm.register("displayName")} />
            </Field>
            {/* Shown here for context; changing it lives in its own section
                because it needs the current password and a confirmation step. */}
            <Field label={t("profile.email")} hint={t("profile.emailSectionHint")}>
              <Input value={record.email} readOnly disabled />
            </Field>
            {messageFor(saveIdentity.error, t("profile.saveFailed")) ? (
              <p className="rect-profile__error" role="alert">
                {messageFor(saveIdentity.error, t("profile.saveFailed"))}
              </p>
            ) : null}
            <Button type="submit" variant="primary" disabled={saveIdentity.isPending}>
              {t("profile.save")}
            </Button>
          </form>
        </SettingsSection>

        <SettingsSection
          title={t("profile.emailTitle")}
          description={t("profile.emailDescription")}
          open={openSection === "email"}
          onToggle={() => toggle("email")}
        >
          <form
            className="rect-profile__form"
            onSubmit={emailForm.handleSubmit((values) => changeEmail.mutate(values))}
          >
            <Field
              label={t("profile.newEmail")}
              hint={t("profile.newEmailHint")}
              error={emailForm.formState.errors.newEmail?.message}
              required
            >
              <Input type="email" autoComplete="email" {...emailForm.register("newEmail")} />
            </Field>
            <Field
              label={t("profile.currentPassword")}
              error={emailForm.formState.errors.currentPassword?.message}
              required
            >
              <Input type="password" autoComplete="current-password" {...emailForm.register("currentPassword")} />
            </Field>
            {messageFor(changeEmail.error, t("profile.emailFailed")) ? (
              <p className="rect-profile__error" role="alert">
                {messageFor(changeEmail.error, t("profile.emailFailed"))}
              </p>
            ) : null}
            <Button type="submit" variant="primary" disabled={changeEmail.isPending}>
              {t("profile.emailSubmit")}
            </Button>
          </form>
        </SettingsSection>

        <SettingsSection
          title={t("profile.passwordTitle")}
          description={t("profile.passwordDescription")}
          open={openSection === "password"}
          onToggle={() => toggle("password")}
        >
          <form
            className="rect-profile__form"
            onSubmit={passwordForm.handleSubmit((values) => savePassword.mutate(values))}
          >
            <Field
              label={t("profile.currentPassword")}
              error={passwordForm.formState.errors.currentPassword?.message}
              required
            >
              <Input type="password" autoComplete="current-password" {...passwordForm.register("currentPassword")} />
            </Field>
            <Field
              label={t("profile.newPassword")}
              hint={t("profile.passwordRule")}
              error={passwordForm.formState.errors.newPassword?.message}
              required
            >
              <Input type="password" autoComplete="new-password" {...passwordForm.register("newPassword")} />
            </Field>
            <Field
              label={t("profile.confirmPassword")}
              error={
                passwordForm.formState.errors.confirmPassword
                  ? t("profile.passwordMismatch")
                  : undefined
              }
              required
            >
              <Input type="password" autoComplete="new-password" {...passwordForm.register("confirmPassword")} />
            </Field>
            {messageFor(savePassword.error, t("profile.passwordFailed")) ? (
              <p className="rect-profile__error" role="alert">
                {messageFor(savePassword.error, t("profile.passwordFailed"))}
              </p>
            ) : null}
            <Button type="submit" variant="primary" disabled={savePassword.isPending}>
              {t("profile.changePassword")}
            </Button>
          </form>
        </SettingsSection>

        <SettingsSection
          title={t("profile.accessTitle")}
          description={t("profile.accessDescription")}
          open={openSection === "access"}
          onToggle={() => toggle("access")}
        >
          <SettingRow
            label={t("profile.roles")}
            control={
              <span className="rect-profile__badges">
                {record.roles.map((role) => (
                  <Badge key={role} tone="info">
                    {t(`enums.memberRole.${role}`, { defaultValue: role })}
                  </Badge>
                ))}
              </span>
            }
          />
          <SettingRow
            label={t("profile.userTypes")}
            control={
              <span className="rect-profile__badges">
                {record.userTypes.length === 0 ? (
                  <span className="rect-profile__muted">{t("profile.noUserTypes")}</span>
                ) : (
                  record.userTypes.map((type) => (
                    <Badge key={type.id} tone="neutral">
                      {t(`enums.systemUserType.${type.key}`, { defaultValue: type.name })}
                    </Badge>
                  ))
                )}
              </span>
            }
          />
          <SettingRow
            label={t("settings.passkeysTitle")}
            control={
              <span className="rect-profile__muted">
                {t("profile.passkeys", { count: record.passkeyCount })}
              </span>
            }
          />
          <SettingRow
            label={t("profile.memberSince", { date: joined })}
            control={
              <Badge tone={record.status === "active" ? "success" : "neutral"}>
                {t(`enums.userStatus.${record.status}`, { defaultValue: record.status })}
              </Badge>
            }
          />
        </SettingsSection>
      </SettingsStack>
    </section>
  );
}
