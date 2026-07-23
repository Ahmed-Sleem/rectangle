/**
 * Synchronizes Rectangle language state with React, localStorage, and the HTML
 * `lang`/`dir` attributes so the shell can become Arabic/RTL before domain
 * feature pages are built.
 */
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { I18nextProvider } from "react-i18next";
import { RectangleI18nContext, type RectangleI18nContextValue } from "./I18nContext";
import { getDirection, type RectangleLanguage } from "./resources";
import { getCurrentLanguage, rectangleI18n, setRectangleLanguage } from "./i18n";

export function RectangleI18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<RectangleLanguage>(getCurrentLanguage);

  useEffect(() => {
    function handleLanguageChanged(nextLanguage: string) {
      setLanguageState(nextLanguage === "ar" ? "ar" : "en");
    }

    rectangleI18n.on("languageChanged", handleLanguageChanged);
    return () => {
      rectangleI18n.off("languageChanged", handleLanguageChanged);
    };
  }, []);

  const direction = getDirection(language);

  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = direction;
  }, [direction, language]);

  const value = useMemo<RectangleI18nContextValue>(() => ({
    language,
    direction,
    setLanguage: setRectangleLanguage,
  }), [direction, language]);

  return (
    <I18nextProvider i18n={rectangleI18n}>
      <RectangleI18nContext.Provider value={value}>
        {children}
      </RectangleI18nContext.Provider>
    </I18nextProvider>
  );
}
