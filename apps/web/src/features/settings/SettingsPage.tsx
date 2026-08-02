/** Settings manages personal preferences and company-wide configuration. */
import { BookOpen, KeyRound, Languages, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/shared/auth";
import { hasPermission } from "@/shared/auth/authority";
import {
  Badge,
  Button,
  EmptyState,
  ChoiceGroup,
  SettingRow,
  SettingsSection,
  SettingsStack,
} from "@/shared/ui";
import { useRectangleI18n, type RectangleLanguage } from "@/shared/i18n";
import { AiAssistant } from "./AiAssistant";
import { PermissionReference } from "./PermissionReference";
import { EmailDelivery } from "./EmailDelivery";
import { SeparationRules } from "./SeparationRules";
import { listPasskeys, registerPasskey } from "./passkey-api";
import "./SettingsPage.css";


type SectionId = "language" | "email" | "ai" | "permissions" | "separation" | "passkeys";

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
  const canUseAi = hasPermission(auth.user, "ai.use");
  const { language, setLanguage } = useRectangleI18n();
  const queryClient = useQueryClient();

  // Only one section is expanded at a time so the page stays scannable.
  const [openSection, setOpenSection] = useState<SectionId | null>("language");
  const toggleSection = (id: SectionId) =>
    setOpenSection((current) => (current === id ? null : id));

  const passkeys = useQuery({ queryKey: ["auth", "passkeys"], queryFn: listPasskeys, retry: false });


  const addPasskey = useMutation({
    mutationFn: registerPasskey,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["auth", "passkeys"] });
    },
  });

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
        <EmailDelivery open={openSection === "email"} onToggle={() => toggleSection("email")} />
      ) : null}

      {/*
        Open to anyone who may use the assistant, not only to those who
        configure it. Somebody without `settings.manage` still needs to save
        their own key and to find out why the panel is not answering; the
        section shows them those two things and no means of changing the
        company's provider.
      */}
      {canUseAi ? (
        <AiAssistant open={openSection === "ai"} onToggle={() => toggleSection("ai")} />
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
