/**
 * Provider stack for production app state: i18n/RTL, API query caching, and
 * real session/setup state.
 */
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RectangleI18nProvider } from "@/shared/i18n";
import { AuthProvider } from "@/shared/auth";
import { ToastProvider } from "@/shared/ui";

/**
 * How fresh the product keeps itself, decided once for every screen.
 *
 * A construction company has several people editing the same register at the
 * same time, so a page that only reloads when told to shows one of them a
 * version of the work that stopped being true an hour ago. The opposite —
 * refetching on every mount — hammers the API on each tab switch for data that
 * has not changed.
 *
 * The settled answer for this class of product: a short staleness window so
 * navigating between pages is instant, plus a refetch when the person comes
 * back to the tab, which is exactly the moment they are about to trust what is
 * on screen. No polling: nothing here is a live feed, and a timer that fires
 * for every idle tab is a cost paid by every customer for a case none of them
 * asked for.
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: true,
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
