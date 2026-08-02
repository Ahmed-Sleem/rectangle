/**
 * The wait between signing in and the workspace appearing.
 *
 * The guarantees under test are the ones that make it an improvement rather
 * than a delay: it must wait for the data, it must let go, it must let go even
 * when something hangs, and — the one most easily broken — it must never come
 * back once the person is working.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RectangleI18nProvider, setRectangleLanguage } from "@/shared/i18n";
import { WorkspaceReadyGate } from "./WorkspaceReadyGate";

const LABEL = "Preparing your workspace";

function renderGate(children: React.ReactNode, client: QueryClient) {
  return render(
    <QueryClientProvider client={client}>
      <RectangleI18nProvider>
        <WorkspaceReadyGate maxWaitMs={4000} quietMs={120}>
          {children}
        </WorkspaceReadyGate>
      </RectangleI18nProvider>
    </QueryClientProvider>,
  );
}

function newClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

describe("WorkspaceReadyGate", () => {
  beforeEach(async () => {
    await setRectangleLanguage("en");
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("mounts the workspace underneath immediately, so its data can start loading", () => {
    /*
     * The gate must not defer rendering. Queries begin when the components that
     * own them mount, so a gate that waited before mounting would be waiting
     * for requests it had itself prevented from starting.
     */
    renderGate(<div>Workspace</div>, newClient());

    expect(screen.getByText("Workspace")).toBeInTheDocument();
    expect(screen.getByRole("status", { name: LABEL })).toBeInTheDocument();
  });

  it("opens once nothing is being fetched and the page has settled", async () => {
    renderGate(<div>Workspace</div>, newClient());

    expect(screen.getByRole("status", { name: LABEL })).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(120);
    });

    expect(screen.queryByRole("status", { name: LABEL })).not.toBeInTheDocument();
  });

  it("opens anyway when a request hangs, rather than trapping the person", async () => {
    /*
     * A ceiling, not a target. One endpoint having a bad day must cost a slow
     * panel, never an application that never opens.
     */
    const client = newClient();
    void client.prefetchQuery({
      queryKey: ["hangs"],
      queryFn: () => new Promise(() => undefined),
    });

    renderGate(<div>Workspace</div>, client);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3999);
    });
    expect(screen.getByRole("status", { name: LABEL })).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(screen.queryByRole("status", { name: LABEL })).not.toBeInTheDocument();
  });

  it("never returns once the workspace is open", async () => {
    /*
     * The guarantee that matters most in daily use. Every later fetch — a
     * refresh, a filter, the refetch when a tab regains focus — would otherwise
     * throw a full-screen boot animation over somebody mid-task.
     */
    const client = newClient();
    renderGate(<div>Workspace</div>, client);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(120);
    });
    expect(screen.queryByRole("status", { name: LABEL })).not.toBeInTheDocument();

    // Something starts loading again, exactly as it would when a person works.
    await act(async () => {
      void client.prefetchQuery({
        queryKey: ["later"],
        queryFn: () => new Promise(() => undefined),
      });
      await vi.advanceTimersByTimeAsync(50);
    });

    expect(screen.queryByRole("status", { name: LABEL })).not.toBeInTheDocument();
  });
});
