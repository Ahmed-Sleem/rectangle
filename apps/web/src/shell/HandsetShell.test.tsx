/**
 * The phone layout.
 *
 * Not the desktop layout squeezed — a different arrangement of the same three
 * zones. These assertions are the owner's report turned into checks: on a phone
 * the canvas must own the screen, the rail and the assistant must be
 * full-screen and dismissible, and the widen/narrow controls must not be
 * offered at all, because there is nothing left to widen into.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppShellLayout } from "@/app/AppShellLayout";
import { AuthContext, type AuthContextValue } from "@/shared/auth";
import { RectangleI18nProvider, setRectangleLanguage } from "@/shared/i18n";
import { getEnabledFeatures } from "./registry";

const shellAuth: AuthContextValue = {
  setupRequired: false,
  loading: false,
  refresh: async () => undefined,
  user: { tenantId: "1", userId: "2", roles: ["owner"], permissions: [] },
};

/**
 * jsdom implements no media queries at all, so the viewport has to be stated.
 * `matches` is fixed for the life of a test because a test that silently
 * changed size mid-run would be testing the transition, not the layout.
 */
function setViewport(isHandset: boolean) {
  vi.stubGlobal(
    "matchMedia",
    (query: string) =>
      ({
        matches: isHandset && query.includes("max-width"),
        media: query,
        onchange: null,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        addListener: () => undefined,
        removeListener: () => undefined,
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList,
  );
}

function renderApp() {
  const children = getEnabledFeatures().map((feature) =>
    feature.routePath === "/"
      ? {
          index: true as const,
          lazy: async () => ({ Component: (await feature.load()).default }),
        }
      : {
          path: feature.routePath.replace(/^\//u, ""),
          lazy: async () => ({ Component: (await feature.load()).default }),
        },
  );

  const router = createMemoryRouter(
    [{ path: "/", element: <AppShellLayout />, HydrateFallback: () => null, children }],
    { initialEntries: ["/"] },
  );

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <RectangleI18nProvider>
        <AuthContext.Provider value={shellAuth}>
          <RouterProvider router={router} />
        </AuthContext.Provider>
      </RectangleI18nProvider>
    </QueryClientProvider>,
  );
}

describe("the shell on a phone", () => {
  beforeEach(async () => {
    window.localStorage.clear();
    vi.restoreAllMocks();
    vi.spyOn(globalThis, "fetch").mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify({ projects: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    await setRectangleLanguage("en");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("gives the canvas the screen, with no rail or assistant beside it", async () => {
    /*
     * The fault as reported. The old layout stacked all three zones in a
     * column, so the canvas shared the screen with a wrapped strip of
     * navigation above it and, whenever the assistant was open, a slab below.
     */
    setViewport(true);
    renderApp();

    await screen.findByRole("heading", { level: 1, name: "Today" });

    const shell = screen.getByTestId("app-shell");
    expect(shell).toHaveClass("rect-app--handset");
    // Neither zone is in the document until it is asked for.
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("does not offer widening or narrowing, only opening", async () => {
    // A control that widens something already filling the screen does nothing,
    // and the owner asked for these to be removed on a phone specifically.
    setViewport(true);
    renderApp();
    await screen.findByRole("heading", { level: 1, name: "Today" });

    expect(screen.queryByRole("button", { name: /Collapse menu/iu })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Expand menu/iu })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Close AI panel/iu })).not.toBeInTheDocument();
  });

  it("opens the menu over the whole screen and closes it again", async () => {
    setViewport(true);
    const user = userEvent.setup();
    renderApp();
    await screen.findByRole("heading", { level: 1, name: "Today" });

    await user.click(screen.getByRole("button", { name: "Open menu" }));

    const sheet = await screen.findByRole("dialog", { name: "Main" });
    expect(within(sheet).getByRole("navigation")).toBeInTheDocument();
    // Full size: the sheet is the screen, so it carries no width ceiling.
    expect(sheet).toHaveClass("rect-overlay__surface--full");

    await user.click(within(sheet).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("closes the menu when a destination is chosen", async () => {
    // Staying open over the page it just navigated to would hide the thing the
    // person asked for.
    setViewport(true);
    const user = userEvent.setup();
    renderApp();
    await screen.findByRole("heading", { level: 1, name: "Today" });

    await user.click(screen.getByRole("button", { name: "Open menu" }));
    const sheet = await screen.findByRole("dialog", { name: "Main" });
    await user.click(within(sheet).getByRole("link", { name: "Projects" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("opens the assistant over the whole screen and closes it again", async () => {
    setViewport(true);
    const user = userEvent.setup();
    renderApp();
    await screen.findByRole("heading", { level: 1, name: "Today" });

    await user.click(screen.getByRole("button", { name: "Open AI panel" }));

    const sheet = await screen.findByRole("dialog", { name: "AI Assistant" });
    expect(sheet).toHaveClass("rect-overlay__surface--full");
    // One way out, not two: the panel's own collapse control is suppressed
    // inside a sheet that already supplies an X.
    expect(within(sheet).queryByRole("button", { name: /Close AI panel/iu })).not.toBeInTheDocument();

    await user.click(within(sheet).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });
});

describe("the shell on a desktop", () => {
  beforeEach(async () => {
    window.localStorage.clear();
    vi.restoreAllMocks();
    vi.spyOn(globalThis, "fetch").mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify({ projects: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    await setRectangleLanguage("en");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps all three zones side by side and keeps the widen controls", async () => {
    /*
     * The other half of the change. A phone layout that also applied to
     * desktops would be a regression dressed as a fix, so the arrangement the
     * owner said was already good is asserted here explicitly.
     */
    setViewport(false);
    renderApp();
    await screen.findByRole("heading", { level: 1, name: "Today" });

    expect(screen.getByTestId("app-shell")).not.toHaveClass("rect-app--handset");
    expect(screen.getByRole("navigation")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Collapse menu/iu })).toBeInTheDocument();
    // The rail is present in the page, not behind a dialog.
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
