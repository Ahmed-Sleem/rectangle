/**
 * Provider stack for production app state: i18n/RTL, API query caching, and
 * real session/setup state.
 */
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RectangleI18nProvider } from "@/shared/i18n";
import { AuthProvider } from "@/shared/auth";
import { ToastProvider } from "@/shared/ui";

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
        {/* Inside i18n so the region is labelled, outside auth so a signed-out
            screen can still report a failure. */}
        <ToastProvider>
          <AuthProvider>{children}</AuthProvider>
        </ToastProvider>
      </RectangleI18nProvider>
    </QueryClientProvider>
  );
}
