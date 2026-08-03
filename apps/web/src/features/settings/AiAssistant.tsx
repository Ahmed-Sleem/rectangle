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
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, PencilLine, Sparkles, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ApiClientError } from "@/shared/api/client";
import { useAuth } from "@/shared/auth";
import { hasPermission } from "@/shared/auth/authority";
import { Badge, Button, SettingRow, SettingsSection, Switch } from "@/shared/ui";
import { aiApi } from "./ai-api";
import {
  AiProviderWizard,
  type CompanyProviderValues,
  type PersonalProviderValues,
} from "./AiProviderWizard";

export function AiAssistant({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const { t } = useTranslation();
  const auth = useAuth();
  const queryClient = useQueryClient();
  const [companyOpen, setCompanyOpen] = useState(false);
  const [personalOpen, setPersonalOpen] = useState(false);

  const mayManage = hasPermission(auth.user, "settings.manage");

  const query = useQuery({
    queryKey: ["ai", "settings"],
    queryFn: aiApi.getSettings,
    retry: false,
  });

  const settings = query.data?.aiSettings;
  const configured = settings?.configured ?? false;
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["ai", "settings"] });

  const saveCompany = useMutation({
    mutationFn: (values: CompanyProviderValues) =>
      aiApi.saveSettings({
        baseUrl: values.baseUrl,
        model: values.model,
        ...(values.apiKey ? { apiKey: values.apiKey } : {}),
        maxCycles: values.maxCycles,
        // Saving a provider switches it on. Somebody who has just typed an
        // endpoint and a key has said what they want; making them find a
        // second control afterwards is a step that exists for no reason.
        enabled: true,
      }),
    onSuccess: async () => {
      await invalidate();
      setCompanyOpen(false);
      saveCompany.reset();
    },
  });

  const savePersonal = useMutation({
    mutationFn: (values: PersonalProviderValues) =>
      aiApi.saveMine({
        ...(values.baseUrl ? { baseUrl: values.baseUrl } : {}),
        ...(values.model ? { model: values.model } : {}),
        ...(values.apiKey ? { apiKey: values.apiKey } : {}),
      }),
    onSuccess: async () => {
      await invalidate();
      setPersonalOpen(false);
      savePersonal.reset();
    },
  });

  const clearPersonal = useMutation({ mutationFn: aiApi.deleteMine, onSuccess: invalidate });

  /*
   * Switching the assistant on or off is one decision and saves on its own.
   * The endpoint and model come from what is already stored rather than from a
   * form, so pausing cannot silently rewrite a provider somebody was editing.
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

  const message = (error: unknown, fallback: string) =>
    error instanceof ApiClientError ? error.message : error ? fallback : null;

  /*
   * One sentence for the state the whole thing is in, because "why is the
   * assistant not answering" has four different causes and a person should not
   * have to work out which applies to them. The order matters: it names the
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
  const hasPersonalOverride = Boolean(
    settings?.hasPersonalKey || settings?.personalBaseUrl || settings?.personalModel,
  );

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
                  <Button variant="secondary" onClick={() => setCompanyOpen(true)}>
                    <PencilLine size={16} strokeWidth={2} aria-hidden />
                    {t("settings.aiEdit")}
                  </Button>
                }
              />

              {/* The spend control, stated as a fact rather than buried in the form. */}
              <SettingRow
                label={t("settings.aiMaxCycles")}
                description={t("settings.aiMaxCyclesSummary", { count: settings?.maxCycles ?? 10 })}
              />
            </>
          ) : (
            <SettingRow
              label={t("settings.aiNotConfigured")}
              description={t("settings.aiSetUpHelp")}
              control={
                <Button variant="primary" onClick={() => setCompanyOpen(true)}>
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

        {/*
          * Everybody who may use the assistant gets this row, including the
          * owner: wanting a different model for your own questions has nothing
          * to do with whether you administer the company.
          */}
        <SettingRow
          label={t("settings.aiMineTitle")}
          description={
            hasPersonalOverride
              ? t("settings.aiMineUsing", {
                  model: settings?.personalModel ?? settings?.model ?? "",
                  endpoint: settings?.personalBaseUrl ?? settings?.baseUrl ?? "",
                })
              : t("settings.aiMineNone")
          }
          control={
            <div className="rect-settings-actions rect-settings-actions--inline">
              <Button variant="secondary" onClick={() => setPersonalOpen(true)}>
                <KeyRound size={16} strokeWidth={2} aria-hidden />
                {hasPersonalOverride ? t("settings.aiMineEdit") : t("settings.aiMineAdd")}
              </Button>
              {hasPersonalOverride ? (
                <Button
                  variant="ghost"
                  onClick={() => clearPersonal.mutate()}
                  disabled={clearPersonal.isPending}
                >
                  <Trash2 size={16} strokeWidth={2} aria-hidden />
                  {t("settings.aiMineClear")}
                </Button>
              ) : null}
            </div>
          }
        />

        {clearPersonal.error ? (
          <p className="rect-settings-message rect-settings-message--error" role="alert">
            {message(clearPersonal.error, t("settings.aiMineClearFailed"))}
          </p>
        ) : null}
      </SettingsSection>

      <AiProviderWizard
        open={companyOpen}
        scope="company"
        settings={settings}
        onClose={() => {
          setCompanyOpen(false);
          saveCompany.reset();
        }}
        onSave={(values) => saveCompany.mutateAsync(values as CompanyProviderValues)}
        pending={saveCompany.isPending}
        error={message(saveCompany.error, t("settings.aiSaveFailed"))}
      />

      <AiProviderWizard
        open={personalOpen}
        scope="personal"
        settings={settings}
        onClose={() => {
          setPersonalOpen(false);
          savePersonal.reset();
        }}
        onSave={(values) => savePersonal.mutateAsync(values as PersonalProviderValues)}
        pending={savePersonal.isPending}
        error={message(savePersonal.error, t("settings.aiMineSaveFailed"))}
      />
    </>
  );
}
