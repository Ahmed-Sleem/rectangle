import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { describe, expect, it, beforeEach } from "vitest";
import { AppShellLayout } from "@/app/AppShellLayout";
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
    ...render(<RouterProvider router={router} />),
  };
}

describe("AppShell", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("renders the rectangle wordmark", async () => {
    renderApp("/");
    expect(await screen.findByText("rectangle")).toBeInTheDocument();
    expect(
      await screen.findByRole("heading", { level: 1, name: "Overview" }),
    ).toBeInTheDocument();
  });

  it("toggles collapse and shows R", async () => {
    renderApp("/");
    await screen.findByText("rectangle");

    const toggle = screen.getByRole("button", { name: /collapse menu/i });
    // Toggle is opacity/pointer-events gated until hover (demo parity).
    // fireEvent exercises the handler without CSS pointer-events checks.
    fireEvent.click(toggle);

    expect(screen.getByTestId("app-shell")).toHaveClass("rect-app--collapsed");
    expect(
      screen.getByRole("button", { name: /expand menu/i }),
    ).toHaveAttribute("aria-expanded", "false");
  });

  it("navigates to projects via nav", async () => {
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
  });
});
