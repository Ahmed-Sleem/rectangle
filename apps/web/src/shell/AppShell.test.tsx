import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, it, beforeEach, vi } from "vitest";
import { AppShellLayout } from "@/app/AppShellLayout";
import { AuthContext, type AuthContextValue } from "@/shared/auth";
import { LANGUAGE_STORAGE_KEY, RectangleI18nProvider, setRectangleLanguage } from "@/shared/i18n";
import { getEnabledFeatures } from "./registry";
import NotFound from "@/app/NotFound";

const shellAuth: AuthContextValue = {
  setupRequired: false,
  loading: false,
  refresh: async () => undefined,
  user: { tenantId: "1", userId: "2", roles: ["tenant_admin"], permissions: [] },
};

function renderApp(initialPath = "/") {
  const features = getEnabledFeatures();
  const children = features.map((feature) => {
    if (feature.routePath === "/") {
      return {
        index: true as const,
        lazy: async () => {
          const mod = await feature.load();
          return { Component: mod.default };
        },
      };
    }
    return {
      path: feature.routePath.replace(/^\//, ""),
      lazy: async () => {
        const mod = await feature.load();
        return { Component: mod.default };
      },
    };
  });

  const router = createMemoryRouter(
    [
      {
        path: "/",
        element: <AppShellLayout />,
        HydrateFallback: () => null,
        children: [
          ...children,
          { path: "*", element: <NotFound /> },
        ],
      },
    ],
    { initialEntries: [initialPath] },
  );

  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return {
    router,
    ...render(
      <QueryClientProvider client={queryClient}>
        <RectangleI18nProvider>
          {/*
            The shell only ever renders behind authentication, and the menu now
            offers only what the signed-in person may open. Rendering it without
            a principal would test a state the product cannot reach.
          */}
          <AuthContext.Provider value={shellAuth}>
            <RouterProvider router={router} />
          </AuthContext.Provider>
        </RectangleI18nProvider>
      </QueryClientProvider>,
    ),
  };
}

describe("AppShell", () => {
  beforeEach(async () => {
    window.localStorage.clear();
    vi.restoreAllMocks();
    vi.spyOn(globalThis, "fetch").mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ projects: [] }), { status: 200, headers: { "Content-Type": "application/json" } })));
    await setRectangleLanguage("en");
  });

  it("renders the wordmark, page title, and page-specific browser title", async () => {
    renderApp("/");
    expect(await screen.findByText("rectangle")).toBeInTheDocument();
    expect(
      await screen.findByRole("heading", { level: 1, name: "Today" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { level: 1, name: "RECTANGLE" }),
    ).not.toBeInTheDocument();
    expect(document.title).toBe("Today · Rectangle");
  });

  it("renders Arabic shell labels and RTL document direction", async () => {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, "ar");
    await setRectangleLanguage("ar");

    renderApp("/projects");

    expect(
      await screen.findByRole("heading", { level: 1, name: "المشاريع" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "المشاريع" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "الإعدادات" })).toBeInTheDocument();
    expect(document.documentElement).toHaveAttribute("lang", "ar");
    expect(document.documentElement).toHaveAttribute("dir", "rtl");
    await waitFor(() => {
      expect(document.title).toBe("المشاريع · Rectangle");
    });
  });

  it("toggles the icon-only navigation control", async () => {
    renderApp("/");
    await screen.findByText("rectangle");

    const toggle = screen.getByRole("button", { name: /collapse menu/i });
    fireEvent.click(toggle);

    expect(screen.getByTestId("app-shell")).toHaveClass("rect-app--collapsed");
    expect(
      screen.getByRole("button", { name: /expand menu/i }),
    ).toHaveAttribute("aria-expanded", "false");
  });

  it("navigates to projects and updates the shell and browser titles", async () => {
    const user = userEvent.setup();
    renderApp("/");
    await screen.findByRole("heading", { level: 1, name: "Today" });

    await user.click(screen.getByRole("link", { name: "Projects" }));

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { level: 1, name: "Projects" }),
      ).toBeInTheDocument();
    });

    expect(await screen.findByText("No projects yet")).toBeInTheDocument();
    expect(screen.queryByText(/fake data/i)).not.toBeInTheDocument();
    // The harness now signs in as an administrator, because the menu offers
    // only what the viewer may open and an unauthenticated shell is a state the
    // product never reaches. Permission-gated creation itself is covered in
    // ProjectsPage.test.tsx; here it is enough that the page rendered its own
    // action rather than the shell swallowing it.
    expect(screen.getAllByRole("button", { name: /create project/i }).length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: "Projects" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await waitFor(() => {
      expect(document.title).toBe("Projects · Rectangle");
    });
  });

  it("renders a retractable AI assistant panel without fake model output", async () => {
    renderApp("/");
    expect(await screen.findByLabelText("AI Assistant")).toBeInTheDocument();
    expect(screen.getByText("AI Assistant")).toBeInTheDocument();
    expect(screen.getByText("Model connection pending")).toBeInTheDocument();
    expect(
      screen.getByText(/Connect a real model adapter before enabling send/i),
    ).toBeInTheDocument();
    expect(screen.queryByText("Project context")).not.toBeInTheDocument();
    expect(screen.queryByText("Documents")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /attach file/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /voice input/i }),
    ).not.toBeInTheDocument();

    const currentPageToggle = screen.getByRole("button", {
      name: /current page context on/i,
    });
    expect(currentPageToggle).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(currentPageToggle);

    expect(
      screen.getByRole("button", { name: /current page context off/i }),
    ).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(screen.getByRole("button", { name: /close ai panel/i }));

    expect(screen.getByTestId("app-shell")).toHaveClass(
      "rect-app--ai-collapsed",
    );
    await waitFor(() => {
      expect(screen.queryByLabelText("AI Assistant")).not.toBeInTheDocument();
    });
    expect(
      screen.getByRole("button", { name: /open ai panel/i }),
    ).toHaveAttribute("aria-expanded", "false");
  });

  it("does not repeat account links that live in the profile menu", async () => {
    renderApp("/projects");

    const nav = await screen.findByRole("navigation", { name: /Primary|التنقل/u });
    // Offering the same two destinations in two places is clutter, not choice.
    expect(within(nav).queryByRole("link", { name: /Profile|الملف/u })).not.toBeInTheDocument();
    expect(within(nav).queryByRole("link", { name: /Logout|تسجيل الخروج/u })).not.toBeInTheDocument();
  });
});
