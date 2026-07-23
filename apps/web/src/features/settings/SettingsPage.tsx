/**
 * Real Settings page for shell-level language and direction controls. This page
 * lets us validate Arabic/RTL live before building data-heavy product modules.
 */
import { Languages } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  Badge,
  Button,
  Card,
  PageGrid,
  PageHeader,
  Toolbar,
} from "@/shared/ui";
import { useRectangleI18n, type RectangleLanguage } from "@/shared/i18n";
import "./SettingsPage.css";

export default function SettingsPage() {
  const { t } = useTranslation();
  const { language, direction, setLanguage } = useRectangleI18n();

  async function selectLanguage(nextLanguage: RectangleLanguage) {
    await setLanguage(nextLanguage);
  }

  return (
    <div className="rect-settings-page">
      <PageHeader
        title={t("settings.languageTitle")}
        eyebrow={t("feature.settings")}
        actions={<Badge tone="info">{direction.toUpperCase()}</Badge>}
      >
        {t("settings.languageDescription")}
      </PageHeader>

      <PageGrid columns={2}>
        <Card aria-labelledby="language-card-title">
          <div className="rect-settings-page__card-head">
            <span className="rect-settings-page__icon" aria-hidden>
              <Languages size={18} strokeWidth={2} />
            </span>
            <div>
              <h3 id="language-card-title">{t("settings.activeLanguage")}</h3>
              <p>{language === "ar" ? t("settings.arabic") : t("settings.english")}</p>
            </div>
          </div>

          <Toolbar className="rect-settings-page__actions" aria-label={t("settings.activeLanguage")}>
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
        </Card>

        <Card aria-labelledby="direction-card-title">
          <h3 id="direction-card-title">{t("settings.currentDirection")}</h3>
          <p className="rect-settings-page__direction">
            {direction === "rtl" ? t("settings.directionRtl") : t("settings.directionLtr")}
          </p>
          <div className="rect-settings-page__sample" lang="ar" dir="rtl">
            <strong>{t("settings.testArabicTitle")}</strong>
            <span>{t("settings.testArabicText")}</span>
          </div>
        </Card>
      </PageGrid>
    </div>
  );
}
