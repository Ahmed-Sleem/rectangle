/** Hook for accessing Rectangle language and text direction state. */
import { useContext } from "react";
import { RectangleI18nContext, type RectangleI18nContextValue } from "./I18nContext";

export function useRectangleI18n(): RectangleI18nContextValue {
  const context = useContext(RectangleI18nContext);
  if (!context) {
    throw new Error("useRectangleI18n must be used within RectangleI18nProvider");
  }
  return context;
}
