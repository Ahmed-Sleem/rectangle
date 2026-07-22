import type { ReactNode } from "react";

/** Future-proof provider stack (auth, query, i18n). Identity in P0. */
export function AppProviders({ children }: { children: ReactNode }) {
  return children;
}
