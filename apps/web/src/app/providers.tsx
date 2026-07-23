import type { ReactNode } from "react";
import { RectangleI18nProvider } from "@/shared/i18n";

/** Future-proof provider stack. i18n/RTL is active now; auth/query providers come later. */
export function AppProviders({ children }: { children: ReactNode }) {
  return <RectangleI18nProvider>{children}</RectangleI18nProvider>;
}
