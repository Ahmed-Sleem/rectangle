/** Shared i18n context types and object used by provider and hook modules. */
import { createContext } from "react";
import type { RectangleLanguage } from "./resources";

export interface RectangleI18nContextValue {
  language: RectangleLanguage;
  direction: "ltr" | "rtl";
  setLanguage: (language: RectangleLanguage) => Promise<void>;
}

export const RectangleI18nContext = createContext<RectangleI18nContextValue | null>(null);
