/**
 * Provider stack for production app state: i18n/RTL, API query caching, and
 * real session/setup state.
 */
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RectangleI18nProvider } from "@/shared/i18n";
import { AuthProvider } from "@/shared/auth";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 20_000,
      retry: 1,
    },
  },
});

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <RectangleI18nProvider>
        <AuthProvider>{children}</AuthProvider>
      </RectangleI18nProvider>
    </QueryClientProvider>
  );
}
