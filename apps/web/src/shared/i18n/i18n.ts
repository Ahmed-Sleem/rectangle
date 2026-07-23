/**
 * Initializes the Rectangle i18n runtime once for React. The module exposes a
 * small language setter so tests and future settings UI can switch language
 * without knowing storage or direction details.
 */
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { getDirection, isRectangleLanguage, resources, type RectangleLanguage } from "./resources";

export const LANGUAGE_STORAGE_KEY = "rectangle.i18n.language";

function readInitialLanguage(): RectangleLanguage {
  if (typeof window === "undefined") return "en";
  const stored = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
  if (isRectangleLanguage(stored)) return stored;

  const browserLanguage = window.navigator.language.split("-")[0] ?? "en";
  return isRectangleLanguage(browserLanguage) ? browserLanguage : "en";
}

export const rectangleI18n = i18n.createInstance();

void rectangleI18n.use(initReactI18next).init({
  resources,
  lng: readInitialLanguage(),
  fallbackLng: "en",
  interpolation: {
    escapeValue: false,
  },
  returnNull: false,
});

export async function setRectangleLanguage(language: RectangleLanguage): Promise<void> {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  }
  await rectangleI18n.changeLanguage(language);
}

export function getCurrentLanguage(): RectangleLanguage {
  return isRectangleLanguage(rectangleI18n.language) ? rectangleI18n.language : "en";
}

export function getCurrentDirection(): "ltr" | "rtl" {
  return getDirection(getCurrentLanguage());
}
