/** Tests the real Projects register and create action UI. */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthContext, type AuthContextValue } from "@/shared/auth";
import { RectangleI18nProvider, setRectangleLanguage } from "@/shared/i18n";
import ProjectsPage from "./ProjectsPage";

const managerAuth: AuthContextValue = {
  setupRequired: false,
  loading: false,
  refresh: async () => undefined,
  user: { tenantId: "1", userId: "2", roles: ["owner"], permissions: [] },
};

const viewerAuth = {
  ...managerAuth,
  user: { tenantId: "1", userId: "3", roles: ["none"], permissions: ["projects.read"] },
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
    window.localStorage.clear();
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

    // Cards are the default view; each card is a labelled link to the project.
    expect(await screen.findByRole("listitem", { name: "Cairo Metro Extension" })).toBeInTheDocument();
    expect(screen.getByText("CME-01")).toBeInTheDocument();
    // Cards are the default view, so switch to the table for column assertions.
    await userEvent.setup().click(screen.getByRole("radio", { name: "Table view" }));

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

    // Status now lives in the filter window; search stays on the bar because
    // it is the control people reach for most.
    await user.click(screen.getByRole("button", { name: /Filters/u }));
    const dialog = await screen.findByRole("dialog", { name: "Filters" });
    await user.selectOptions(within(dialog).getByLabelText("Filter by status"), "active");

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

  it("shows projects as cards by default and remembers a switch to the table", async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, "fetch").mockImplementation(() =>
      jsonResponse({ projects: [{ id: "1", tenantId: "1", name: "Cairo Metro Extension", code: "CME-01", status: "active", locationName: "Cairo", createdAt: "", updatedAt: "2026-01-01" }] }),
    );

    const { unmount } = renderProjectsPage();

    expect(await screen.findByRole("listitem", { name: "Cairo Metro Extension" })).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: "Table view" }));
    expect(screen.getByRole("table")).toBeInTheDocument();

    // The layout is a preference, so it must survive leaving the page.
    unmount();
    renderProjectsPage();
    expect(await screen.findByRole("table")).toBeInTheDocument();
  });

  it("summarises the register from the records it already has", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(() =>
      jsonResponse({ projects: [
        { id: "1", tenantId: "1", name: "A", code: "A-1", status: "active", createdAt: "", updatedAt: "2026-01-01" },
        { id: "2", tenantId: "1", name: "B", code: "B-1", status: "active", createdAt: "", updatedAt: "2026-01-02" },
        { id: "3", tenantId: "1", name: "C", code: "C-1", status: "on_hold", createdAt: "", updatedAt: "2026-01-03" },
        { id: "4", tenantId: "1", name: "D", code: "D-1", status: "archived", createdAt: "", updatedAt: "2026-01-04" },
      ] }),
    );

    renderProjectsPage();

    const summary = await screen.findByRole("group", { name: "Project register" });
    // Every figure is counted from loaded records; none is fabricated.
    expect(within(summary).getByText("4")).toBeInTheDocument();
    expect(within(summary).getByText("1 archived")).toBeInTheDocument();
    expect(within(summary).getByText("Active").parentElement).toHaveTextContent("2");
  });

  it("shows a real error state instead of pretending there are no projects", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify({ error: { code: "SERVER_ERROR", message: "boom" } }), { status: 500, headers: { "Content-Type": "application/json" } })),
    );

    renderProjectsPage();

    expect(await screen.findByText("Projects could not be loaded")).toBeInTheDocument();
    expect(screen.queryByText("No projects yet")).not.toBeInTheDocument();
  });

  it("shows completion for a project that has countable work", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(() =>
      jsonResponse({
        projects: [
          { id: "p1", tenantId: "1", name: "New Cairo Tower", code: "NCT-01", status: "active", doneTasks: 3, totalTasks: 12, createdAt: "", updatedAt: "" },
        ],
      }),
    );
    renderProjectsPage();

    expect(await screen.findByText("New Cairo Tower")).toBeInTheDocument();
    expect(screen.getByText("25%")).toBeInTheDocument();
    // The denominator is shown, because "25%" alone hides 1/4 versus 25/100.
    expect(screen.getByText("3/12")).toBeInTheDocument();
  });

  it("shows no progress at all for a project with no work, rather than zero", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(() =>
      jsonResponse({
        projects: [
          { id: "p2", tenantId: "1", name: "Alexandria Depot", code: "ALX-04", status: "planned", createdAt: "", updatedAt: "" },
        ],
      }),
    );
    renderProjectsPage();

    expect(await screen.findByText("Alexandria Depot")).toBeInTheDocument();
    // 0% would claim the project had started and achieved nothing.
    expect(screen.queryByText("0%")).not.toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });

  it("shows who is on a project, with an honest overflow count", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(() =>
      jsonResponse({
        projects: [
          {
            id: "p3", tenantId: "1", name: "Giza Bridge", code: "GZB-02", status: "active",
            createdAt: "", updatedAt: "",
            memberNames: ["Mona Adel", "Sara Nabil", "Youssef Amin", "Hana Fouad", "Omar Zaki"],
            memberCount: 9,
          },
        ],
      }),
    );
    renderProjectsPage();

    await screen.findByText("Giza Bridge");
    const team = screen.getByLabelText("Team on Giza Bridge");
    // Four faces are drawn; the remainder is counted from the real total, not
    // from the five names the query happened to fetch.
    expect(within(team).getByText("+5")).toBeInTheDocument();
    expect(within(team).getByText(/Mona Adel/u)).toBeInTheDocument();
  });

  it("says a project has no members rather than drawing an empty row", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(() =>
      jsonResponse({
        projects: [
          { id: "p4", tenantId: "1", name: "Luxor Terminal", code: "LXT-01", status: "planned", createdAt: "", updatedAt: "", memberNames: [], memberCount: 0 },
        ],
      }),
    );
    renderProjectsPage();

    await screen.findByText("Luxor Terminal");
    expect(screen.getByText("No members")).toBeInTheDocument();
  });
});
