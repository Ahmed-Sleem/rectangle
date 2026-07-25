/** Tests the real Projects register and create action UI. */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthContext, type AuthContextValue } from "@/shared/auth";
import { RectangleI18nProvider, setRectangleLanguage } from "@/shared/i18n";
import ProjectsPage from "./ProjectsPage";

const managerAuth: AuthContextValue = {
  setupRequired: false,
  loading: false,
  refresh: async () => undefined,
  user: { tenantId: "1", userId: "2", roles: ["tenant_admin"], permissions: [] },
};

const viewerAuth = {
  ...managerAuth,
  user: { tenantId: "1", userId: "3", roles: ["viewer"], permissions: ["projects.read"] },
};

function renderProjectsPage(auth = managerAuth) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <RectangleI18nProvider>
        <AuthContext.Provider value={auth}>
          <MemoryRouter>
            <ProjectsPage />
          </MemoryRouter>
        </AuthContext.Provider>
      </RectangleI18nProvider>
    </QueryClientProvider>,
  );
}

function jsonResponse(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));
}

describe("ProjectsPage", () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    await setRectangleLanguage("en");
  });

  it("shows an end-user empty state and real create action", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(() => jsonResponse({ projects: [] }));
    renderProjectsPage();

    expect(await screen.findByText("No projects yet")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Create project" }).length).toBeGreaterThan(0);
    expect(screen.queryByText(/fake data/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/backend/i)).not.toBeInTheDocument();
  });

  it("renders real project rows from the API", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(() => jsonResponse({ projects: [{
      id: "11111111-1111-4111-8111-111111111111",
      tenantId: "22222222-2222-4222-8222-222222222222",
      name: "Cairo Metro Extension",
      code: "CME-01",
      status: "active",
      locationName: "Cairo",
      createdAt: "2026-07-23T20:00:00.000Z",
      updatedAt: "2026-07-23T20:00:00.000Z",
    }] }));

    renderProjectsPage();

    expect(await screen.findByRole("link", { name: "Cairo Metro Extension" })).toBeInTheDocument();
    expect(screen.getByText("CME-01")).toBeInTheDocument();
    // Status renders as a readable badge in the row, not the raw enum value.
    // Scope to the table so the status filter's option cannot satisfy this.
    const register = screen.getByRole("table");
    expect(within(register).getByText("Active")).toBeInTheDocument();
  });

  it("submits a validated project create request", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.spyOn(globalThis, "fetch");
    fetchMock
      .mockImplementationOnce(() => jsonResponse({ projects: [] }))
      .mockImplementationOnce((_input, init) => {
        expect(init?.method).toBe("POST");
        expect(JSON.parse(String(init?.body))).toMatchObject({ name: "New Hospital", code: "HOSP-01", status: "planned" });
        return jsonResponse({ project: { id: "11111111-1111-4111-8111-111111111111", name: "New Hospital", code: "HOSP-01", status: "planned" } }, 201);
      })
      .mockImplementationOnce(() => jsonResponse({ projects: [] }));

    renderProjectsPage();
    await user.click(await screen.findByRole("button", { name: "Create project" }));
    await user.type(screen.getByLabelText(/Project name/i), "New Hospital");
    await user.type(screen.getByLabelText(/Project code/i), "HOSP-01");
    // Submit from inside the window so the trigger button can never satisfy this.
    const dialog = screen.getByRole("dialog", { name: "Create project" });
    await user.click(within(dialog).getByRole("button", { name: "Create project" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
  });

  it("sends search and status filters to the API instead of filtering locally", async () => {
    const user = userEvent.setup();
    const urls: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      urls.push(String(input));
      return jsonResponse({ projects: [] });
    });

    renderProjectsPage();
    await screen.findByRole("button", { name: "Create project" });

    await user.type(screen.getByLabelText("Search projects"), "metro");
    await user.selectOptions(screen.getByLabelText("Filter by status"), "active");

    // The backend already supports these filters; the UI must use them so
    // results stay correct beyond the first page of records.
    await waitFor(() => {
      expect(urls.some((url) => url.includes("search=metro") && url.includes("status=active"))).toBe(true);
    });
  });

  it("offers a way out of an over-filtered list", async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, "fetch").mockImplementation(() => jsonResponse({ projects: [] }));

    renderProjectsPage();
    await user.type(await screen.findByLabelText("Search projects"), "nothing-matches");

    expect(await screen.findByText("No matching projects")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(await screen.findByText("No projects yet")).toBeInTheDocument();
  });

  it("hides project creation from a user who cannot create projects", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(() => jsonResponse({ projects: [] }));

    renderProjectsPage(viewerAuth);

    expect(await screen.findByText("No projects yet")).toBeInTheDocument();
    // The action is hidden rather than shown and failing on submit.
    expect(screen.queryByRole("button", { name: "Create project" })).not.toBeInTheDocument();
  });
});
