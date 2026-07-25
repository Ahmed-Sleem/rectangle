/** Project settings must write real changes and respect project permissions. */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ProjectSettingsPage from "./ProjectSettingsPage";

const projectId = "33333333-3333-4333-8333-333333333333";

const project = {
  id: projectId,
  tenantId: "1",
  name: "Cairo Metro Extension",
  code: "CME-01",
  status: "active",
  locationName: "Cairo",
  createdAt: "2026-07-25T10:00:00.000Z",
  updatedAt: "2026-07-25T10:00:00.000Z",
};

function json(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }),
  );
}

function mockApi({ canManage = true }: { canManage?: boolean } = {}) {
  const calls: Array<{ url: string; method: string; body?: unknown }> = [];
  vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    calls.push({ url, method, ...(init?.body ? { body: JSON.parse(String(init.body)) } : {}) });

    if (url.endsWith("/access")) return json({ access: { canRead: true, canManage } });
    if (method === "PATCH") return json({ project });
    return json({ project });
  });
  return calls;
}

function renderSettings() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/projects/${projectId}/settings`]}>
        <Routes>
          <Route path="/projects/:projectId/settings" element={<ProjectSettingsPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("ProjectSettingsPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("loads current values into the identity section", async () => {
    mockApi();
    renderSettings();

    expect(await screen.findByDisplayValue("Cairo Metro Extension")).toBeInTheDocument();
    expect(screen.getByDisplayValue("CME-01")).toBeInTheDocument();
  });

  it("saves identity changes through the project update endpoint", async () => {
    const user = userEvent.setup();
    const calls = mockApi();
    renderSettings();

    const nameField = await screen.findByLabelText("Project name");
    await user.clear(nameField);
    await user.type(nameField, "Cairo Metro Phase 2");
    await user.click(screen.getByRole("button", { name: "Save identity" }));

    await waitFor(() => {
      const patch = calls.find((call) => call.method === "PATCH");
      expect(patch?.body).toMatchObject({ name: "Cairo Metro Phase 2", code: "CME-01" });
    });

    expect(await screen.findByText("Saved.")).toBeInTheDocument();
  });

  it("blocks a budget amount without a currency before reaching the API", async () => {
    const user = userEvent.setup();
    const calls = mockApi();
    renderSettings();

    await user.click(await screen.findByRole("button", { name: /Budget/ }));
    const budget = screen.getByRole("button", { name: "Save budget" });
    await user.type(screen.getByLabelText("Amount"), "1500000");
    await user.click(budget);

    expect(await screen.findByText("Currency is required when a budget is set.")).toBeInTheDocument();
    // Validation must stop the request rather than relying on a server rejection.
    expect(calls.some((call) => call.method === "PATCH")).toBe(false);
  });

  it("keeps only one section open at a time", async () => {
    const user = userEvent.setup();
    mockApi();
    renderSettings();

    const identity = await screen.findByRole("button", { name: /Project identity/ });
    const delivery = screen.getByRole("button", { name: /Delivery and location/ });

    expect(identity).toHaveAttribute("aria-expanded", "true");
    await user.click(delivery);

    expect(delivery).toHaveAttribute("aria-expanded", "true");
    expect(identity).toHaveAttribute("aria-expanded", "false");
  });

  it("explains that settings are managed by the project team when read-only", async () => {
    mockApi({ canManage: false });
    renderSettings();

    expect(await screen.findByText("Settings are managed by the project team")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save identity" })).not.toBeInTheDocument();
  });

  it("validates the project code format in the browser", async () => {
    const user = userEvent.setup();
    mockApi();
    renderSettings();

    const codeField = await screen.findByLabelText("Project code");
    await user.clear(codeField);
    await user.type(codeField, "bad code");
    await user.click(screen.getByRole("button", { name: "Save identity" }));

    expect(
      await screen.findByText("Use uppercase letters, numbers, dot, dash, or underscore."),
    ).toBeInTheDocument();
  });
});
