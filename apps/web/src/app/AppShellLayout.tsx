/**
 * Owns shell-level state that must survive feature swaps: navigation collapse,
 * AI panel visibility, localized page titles, and the browser tab title.
 */
import { Suspense, useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Outlet, useLocation } from "react-router-dom";
import { AppShell } from "@/shell/AppShell";
import { getFeatureByPath } from "@/shell/registry";
import { getLocalizedFeatureTitle, useRectangleI18n } from "@/shared/i18n";

const NAV_STORAGE_KEY = "rectangle.shell.navCollapsed";
const AI_STORAGE_KEY = "rectangle.shell.aiCollapsed";

function readStoredBoolean(key: string, fallback: boolean): boolean {
  if (typeof window === "undefined") return fallback;
  try {
    const value = window.localStorage.getItem(key);
    if (value === null) return fallback;
    return value === "1";
  } catch {
    return fallback;
  }
}

function writeStoredBoolean(key: string, value: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, value ? "1" : "0");
  } catch {
    /* Private browsing/quota failures should not break the shell controls. */
  }
}

export function AppShellLayout() {
  const [navCollapsed, setNavCollapsed] = useState(() =>
    readStoredBoolean(NAV_STORAGE_KEY, false),
  );
  const [aiCollapsed, setAiCollapsed] = useState(() =>
    readStoredBoolean(AI_STORAGE_KEY, false),
  );
  const location = useLocation();
  const { language } = useRectangleI18n();
  const { t } = useTranslation();
  const feature = getFeatureByPath(location.pathname);
  const title = getLocalizedFeatureTitle(feature, language, t("feature.unknown"));
  const appName = t("app.name");

  const onToggleNav = useCallback(() => {
    setNavCollapsed((prev) => {
      const next = !prev;
      writeStoredBoolean(NAV_STORAGE_KEY, next);
      return next;
    });
  }, []);

  const onToggleAi = useCallback(() => {
    setAiCollapsed((prev) => {
      const next = !prev;
      writeStoredBoolean(AI_STORAGE_KEY, next);
      return next;
    });
  }, []);

  useEffect(() => {
    document.title = `${title} · ${appName}`;
  }, [appName, title]);

  return (
    <AppShell
      navCollapsed={navCollapsed}
      onToggleNav={onToggleNav}
      aiCollapsed={aiCollapsed}
      onToggleAi={onToggleAi}
      title={title}
    >
      <Suspense
        fallback={
          <div className="rect-panel__fallback" role="status">
            {t("common.loading")}
          </div>
        }
      >
        <Outlet />
      </Suspense>
    </AppShell>
  );
}
