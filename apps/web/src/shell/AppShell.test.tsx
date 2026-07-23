import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { describe, expect, it, beforeEach } from "vitest";
import { AppShellLayout } from "@/app/AppShellLayout";
import { LANGUAGE_STORAGE_KEY, RectangleI18nProvider, setRectangleLanguage } from "@/shared/i18n";
import { getEnabledFeatures } from "./registry";
import NotFound from "@/app/NotFound";

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

  return {
    router,
    ...render(
      <RectangleI18nProvider>
        <RouterProvider router={router} />
      </RectangleI18nProvider>,
    ),
  };
}

describe("AppShell", () => {
  beforeEach(async () => {
    window.localStorage.clear();
    await setRectangleLanguage("en");
  });

  it("renders the wordmark, page title, and page-specific browser title", async () => {
    renderApp("/");
    expect(await screen.findByText("rectangle")).toBeInTheDocument();
    expect(
      await screen.findByRole("heading", { level: 1, name: "Overview" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { level: 1, name: "RECTANGLE" }),
    ).not.toBeInTheDocument();
    expect(document.title).toBe("Overview · Rectangle");
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
    await screen.findByRole("heading", { level: 1, name: "Overview" });

    await user.click(screen.getByRole("link", { name: "Projects" }));

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { level: 1, name: "Projects" }),
      ).toBeInTheDocument();
    });

    expect(
      screen.getByText("This module is not implemented yet."),
    ).toBeInTheDocument();
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
});
