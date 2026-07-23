/**
 * Minimal user-facing Settings page for live language and direction changes.
 * Developer-only RTL checks live in tests, not in the production UI.
 */
import { Languages } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge, Button, Toolbar } from "@/shared/ui";
import { useRectangleI18n, type RectangleLanguage } from "@/shared/i18n";
import "./SettingsPage.css";

export default function SettingsPage() {
  const { t } = useTranslation();
  const { language, direction, setLanguage } = useRectangleI18n();

  async function selectLanguage(nextLanguage: RectangleLanguage) {
    if (nextLanguage !== language) {
      await setLanguage(nextLanguage);
    }
  }

  return (
    <section className="rect-settings-page" aria-labelledby="settings-language-title">
      <div className="rect-settings-language">
        <span className="rect-settings-language__icon" aria-hidden>
          <Languages size={18} strokeWidth={2} />
        </span>

        <div className="rect-settings-language__content">
          <div className="rect-settings-language__heading-row">
            <h2 id="settings-language-title">{t("settings.languageTitle")}</h2>
            <Badge tone="info">{direction.toUpperCase()}</Badge>
          </div>
          <p>
            {t("settings.activeLanguage")}: {language === "ar" ? t("settings.arabic") : t("settings.english")}
          </p>
        </div>

        <Toolbar className="rect-settings-language__actions" aria-label={t("settings.activeLanguage")}>
          <Button
            variant={language === "en" ? "primary" : "secondary"}
            aria-pressed={language === "en"}
            onClick={() => void selectLanguage("en")}
          >
            {t("settings.english")}
          </Button>
          <Button
            variant={language === "ar" ? "primary" : "secondary"}
            aria-pressed={language === "ar"}
            onClick={() => void selectLanguage("ar")}
          >
            {t("settings.arabic")}
          </Button>
        </Toolbar>
      </div>
    </section>
  );
}
