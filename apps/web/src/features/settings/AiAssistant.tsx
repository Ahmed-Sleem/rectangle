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
import {
  Badge,
  Button,
  ChoiceGroup,
  SettingRow,
  SettingsDivider,
  SettingsSection,
  Switch,
} from "@/shared/ui";
import { aiApi } from "./ai-api";
import { AiProviderWizard, type ProviderValues } from "./AiProviderWizard";

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

  /*
   * Only fetched once the section is open. It is a small list, but a closed
   * accordion should not be issuing requests for something nobody is looking
   * at, and every other block here follows the same rule.
   */
  const autoApprovals = useQuery({
    queryKey: ["ai", "auto-approvals"],
    queryFn: aiApi.listAutoApprovals,
    enabled: open,
    retry: false,
  });

  const revokeAutoApproval = useMutation({
    mutationFn: (tool: string) => aiApi.revokeAutoApproval(tool),
    onSuccess: (result) => {
      // The server's list is authoritative rather than one edited here, so a
      // preference removed in another tab cannot linger on this screen.
      queryClient.setQueryData(["ai", "auto-approvals"], result);
    },
  });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["ai", "settings"] });

  const saveCompany = useMutation({
    mutationFn: (values: ProviderValues) =>
      aiApi.saveSettings({
        baseUrl: values.baseUrl,
        model: values.model,
        ...(values.apiKey ? { apiKey: values.apiKey } : {}),
        maxCycles: values.maxCycles,
        maxOutputTokens: values.maxOutputTokens,
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
    mutationFn: (values: ProviderValues) =>
      aiApi.saveMine({
        baseUrl: values.baseUrl,
        model: values.model,
        ...(values.apiKey ? { apiKey: values.apiKey } : {}),
        maxCycles: values.maxCycles,
        maxOutputTokens: values.maxOutputTokens,
      }),
    onSuccess: async () => {
      await invalidate();
      setPersonalOpen(false);
      savePersonal.reset();
    },
  });

  const clearPersonal = useMutation({ mutationFn: aiApi.deleteMine, onSuccess: invalidate });
  const choose = useMutation({
    mutationFn: (preferred: "company" | "personal") => aiApi.choose(preferred),
    onSuccess: invalidate,
  });

  /*
   * Switching the assistant on or off is one decision and saves on its own.
   * The endpoint and model come from what is already stored rather than from a
   * form, so pausing cannot silently rewrite a provider somebody was editing.
   */
  const setEnabled = useMutation({
    mutationFn: (enabled: boolean) =>
      aiApi.saveSettings({
        baseUrl: settings?.company.baseUrl ?? "",
        model: settings?.company.model ?? "",
        enabled,
      }),
    onSuccess: invalidate,
  });

  const message = (error: unknown, fallback: string) =>
    error instanceof ApiClientError ? error.message : error ? fallback : null;

  /*
   * One sentence for the state the whole thing is in, because "why is the
   * assistant not answering" has several causes and a person should not have to
   * work out which applies to them. `active` is resolved by the server, so this
   * reports the answer rather than recomputing it.
   */
  const statusLabel = (): { text: string; tone: "success" | "neutral" | "warning" } => {
    if (settings?.active === "personal") return { text: t("settings.aiOnMine"), tone: "success" };
    if (settings?.active === "company") return { text: t("settings.aiOnCompany"), tone: "success" };
    if (settings?.company.configured && !settings.enabled)
      return { text: t("settings.aiPaused"), tone: "neutral" };
    if (settings?.company.configured && !settings.company.hasKey)
      return { text: t("settings.aiNoKey"), tone: "warning" };
    return { text: t("settings.aiNotConfigured"), tone: "neutral" };
  };

  const status = statusLabel();
  const companyConfigured = settings?.company.configured ?? false;
  const personalConfigured = settings?.personal.configured ?? false;

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
        {/*
          * The choice, and only when there is one to make.
          *
          * A radio group with a single option is not a choice — it is a control
          * that cannot change anything, which the rules say to hide rather than
          * show. `canChoose` is the server's answer to "are there two usable
          * configurations", so the browser does not compute it a second time.
          */}
        {settings?.canChoose ? (
          <SettingRow
            label={t("settings.aiWhichModel")}
            description={t("settings.aiWhichModelHelp")}
            control={
              <ChoiceGroup<"company" | "personal">
                label={t("settings.aiWhichModel")}
                value={settings.active === "personal" ? "personal" : "company"}
                onChange={(next) => choose.mutate(next)}
                options={[
                  {
                    value: "company",
                    label: t("settings.aiCompanyModel"),
                    hint: settings.company.model ?? "",
                  },
                  {
                    value: "personal",
                    label: t("settings.aiMyModel"),
                    hint: settings.personal.model ?? "",
                  },
                ]}
              />
            }
          />
        ) : null}

        {/*
          * A separator separates two things. Rendered unconditionally, the
          * first one sat at the very top of the section with nothing above it —
          * a stray horizontal line across the panel, which is exactly what was
          * reported. It appears only when the choice above it did.
          */}
        {settings?.canChoose ? <SettingsDivider /> : null}

        {/* ── The company's model ─────────────────────────────────────── */}
        {mayManage ? (
          companyConfigured ? (
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
                label={t("settings.aiCompanyModel")}
                description={t("settings.aiProviderSummary", {
                  model: settings?.company.model ?? "",
                  endpoint: settings?.company.baseUrl ?? "",
                  cycles: settings?.company.maxCycles ?? 0,
                  tokens: settings?.company.maxOutputTokens ?? 0,
                })}
                control={
                  <Button variant="secondary" onClick={() => setCompanyOpen(true)}>
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
                <Button variant="primary" onClick={() => setCompanyOpen(true)}>
                  {t("settings.aiSetUp")}
                </Button>
              }
            />
          )
        ) : (
          /*
           * Somebody who cannot configure the company provider is still told
           * whether it works, because that is the answer to "why can I not ask
           * anything" and it is not a secret from the people expected to use
           * it. What is absent is the means to change it, not the fact.
           */
          <SettingRow
            label={t("settings.aiCompanyModel")}
            description={
              companyConfigured && settings?.enabled
                ? t("settings.aiCompanyProviderOn")
                : t("settings.aiCompanyProviderOff")
            }
          />
        )}

        {/*
          * This one always has the company block above it and the personal
          * block below, so it always has two things to separate.
          */}
        <SettingsDivider />

        {/*
          * ── This person's own model ───────────────────────────────────
          *
          * Offered to everybody who may use the assistant, including the owner:
          * wanting your own model for your own questions has nothing to do with
          * whether you administer the company. It works with no company
          * configuration at all, which is the point of it standing alone.
          */}
        <SettingRow
          label={t("settings.aiMyModel")}
          description={
            personalConfigured
              ? t("settings.aiProviderSummary", {
                  model: settings?.personal.model ?? "",
                  endpoint: settings?.personal.baseUrl ?? "",
                  cycles: settings?.personal.maxCycles ?? 0,
                  tokens: settings?.personal.maxOutputTokens ?? 0,
                })
              : t("settings.aiMineNone")
          }
          control={
            <div className="rect-settings-actions rect-settings-actions--inline">
              <Button variant="secondary" onClick={() => setPersonalOpen(true)}>
                <KeyRound size={16} strokeWidth={2} aria-hidden />
                {personalConfigured ? t("settings.aiMineEdit") : t("settings.aiMineAdd")}
              </Button>
              {personalConfigured ? (
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

        {choose.error ? (
          <p className="rect-settings-message rect-settings-message--error" role="alert">
            {message(choose.error, t("settings.aiChooseFailed"))}
          </p>
        ) : null}

        {/*
          * ── Changes approved in advance ────────────────────────────────
          *
          * Granting happens on the confirmation card, in the moment somebody
          * decides they are tired of being asked about a particular kind of
          * change. Revoking has to live here, because a person who wants to
          * undo it is not in the middle of a conversation — they are looking
          * for the setting. Without this screen the tick was permanent as far
          * as anybody could tell, which made a small control a much larger
          * decision than it looked.
          *
          * Irreversible tools never appear, and cannot: the server refuses to
          * record a preference for them at all, so there is nothing to revoke
          * and nothing here to suggest otherwise.
          */}
        <SettingsDivider />

        <SettingRow
          label={t("settings.aiAutoApprovals")}
          description={
            (autoApprovals.data?.tools.length ?? 0) === 0
              ? t("settings.aiAutoApprovalsNone")
              : t("settings.aiAutoApprovalsSome")
          }
          control={
            autoApprovals.isError ? (
              <p className="rect-settings-message rect-settings-message--error" role="alert">
                {t("settings.aiAutoApprovalsFailed")}
              </p>
            ) : (
              <div className="rect-settings-actions rect-settings-actions--inline">
                {(autoApprovals.data?.tools ?? []).map((tool) => (
                  <Button
                    key={tool}
                    variant="ghost"
                    onClick={() => revokeAutoApproval.mutate(tool)}
                    disabled={revokeAutoApproval.isPending}
                  >
                    <Trash2 size={16} strokeWidth={2} aria-hidden />
                    {t("settings.aiAutoApprovalRevoke", {
                      // The same labels the confirmation card uses, so somebody
                      // recognises here exactly what they ticked there.
                      tool: t(`shell.ai.tool.${tool}`, { defaultValue: tool }),
                    })}
                  </Button>
                ))}
              </div>
            )
          }
        />

        {revokeAutoApproval.error ? (
          <p className="rect-settings-message rect-settings-message--error" role="alert">
            {message(revokeAutoApproval.error, t("settings.aiAutoApprovalRevokeFailed"))}
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
        onSave={(values) => saveCompany.mutateAsync(values)}
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
        onSave={(values) => savePersonal.mutateAsync(values)}
        pending={savePersonal.isPending}
        error={message(savePersonal.error, t("settings.aiMineSaveFailed"))}
      />
    </>
  );
}
