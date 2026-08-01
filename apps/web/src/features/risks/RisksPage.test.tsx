/** Tests the risk register, the exposure matrix, and permission gating. */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthContext, type AuthContextValue } from "@/shared/auth";
import { RectangleI18nProvider, setRectangleLanguage } from "@/shared/i18n";
import RisksPage from "./RisksPage";

const managerAuth: AuthContextValue = {
  setupRequired: false,
  loading: false,
  refresh: async () => undefined,
  user: { tenantId: "1", userId: "user-1", roles: ["admin"], permissions: [] },
};

const viewerAuth: AuthContextValue = {
  ...managerAuth,
  user: { tenantId: "1", userId: "user-2", roles: ["member"], permissions: [] },
};

function jsonResponse(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }),
  );
}

function renderRisks(auth: AuthContextValue = managerAuth, route = "/risks") {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <RectangleI18nProvider>
        <AuthContext.Provider value={auth}>
          <MemoryRouter initialEntries={[route]}>
            <RisksPage />
          </MemoryRouter>
        </AuthContext.Provider>
      </RectangleI18nProvider>
    </QueryClientProvider>,
  );
}

const projects = {
  projects: [
    { id: "p1", tenantId: "1", name: "New Cairo Tower", code: "NCT-01", status: "active", createdAt: "", updatedAt: "" },
  ],
};

const summary = {
  summary: {
    total: 4,
    criticalOrHigh: 2,
    underReview: 1,
    closed: 1,
    occurred: 0,
    matrix: [
      { probability: 5, impact: 5, count: 2 },
      { probability: 2, impact: 2, count: 1 },
    ],
    bySeverity: [
      { severity: "critical", count: 2 },
      { severity: "low", count: 1 },
    ],
    byCategory: [
      { category: "schedule", count: 2 },
      { category: "safety", count: 1 },
    ],
  },
};

const risks = {
  risks: [
    {
      id: "r1", projectId: "p1", projectName: "New Cairo Tower", projectCode: "NCT-01",
      kind: "risk", title: "Rebar delivery may slip", category: "schedule",
      probability: 5, impact: 5, score: 25, severity: "critical", status: "mitigating",
      ownerName: "Ahmed Sleem", createdAt: "", updatedAt: "",
    },
    {
      id: "r2", projectId: "p1", projectName: "New Cairo Tower", projectCode: "NCT-01",
      kind: "issue", title: "Scaffold failed inspection", category: "safety",
      probability: 2, impact: 2, score: 4, severity: "low", status: "occurred",
      createdAt: "", updatedAt: "",
    },
  ],
};

/**
 * What the server reports this caller may do on each project.
 *
 * The register asks for this before it decides what to offer, so a mock that
 * falls through to the project list answers the question with the wrong shape
 * and every capability reads as false — which is how these tests passed while
 * asserting nothing about the controls.
 */
const allCapabilities = {
  editProject: true, archiveProject: true, deleteProject: true, manageTeam: true,
  createTask: true, editTask: true, deleteTask: true,
  createRisk: true, editRisk: true, deleteRisk: true,
};

function capabilitiesFor(overrides: Partial<typeof allCapabilities> = {}) {
  return { capabilities: { p1: { ...allCapabilities, ...overrides } } };
}

function mockReads(capabilities = capabilitiesFor()) {
  return vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
    const url = String(input);
    if (url.includes("/v1/risks/summary")) return jsonResponse(summary);
    if (url.includes("/v1/risks")) return jsonResponse(risks);
    if (url.includes("/members")) return jsonResponse({ members: [] });
    if (url.includes("/v1/tasks")) return jsonResponse({ tasks: [] });
    // Before the generic project branch: the capability url matches it too.
    if (url.includes("/v1/projects/capabilities")) return jsonResponse(capabilities);
    return jsonResponse(projects);
  });
}

describe("RisksPage", () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    await setRectangleLanguage("en");
  });

  it("lists the register with severity derived by the backend", async () => {
    mockReads();
    renderRisks();

    expect(await screen.findByText("Rebar delivery may slip")).toBeInTheDocument();
    // Scoped to the table: the severity breakdown names the same bands.
    const table = screen.getByRole("table");
    expect(within(table).getByText("Critical")).toBeInTheDocument();
    // The score is shown against its ceiling, so 25 is legible as the maximum.
    expect(within(table).getByText("25 of 25")).toBeInTheDocument();
  });

  it("distinguishes an issue from a risk", async () => {
    mockReads();
    renderRisks();

    await screen.findByText("Scaffold failed inspection");
    const table = screen.getByRole("table");
    // An issue is a risk that happened, so the register must say which is
    // which. Scoped to the table because the filters name the kinds too.
    expect(within(table).getByText("Issue")).toBeInTheDocument();
    expect(within(table).getByText("Risk")).toBeInTheDocument();
  });

  it("draws a full five by five grid, not only the occupied cells", async () => {
    mockReads();
    renderRisks();

    const grid = await screen.findByRole("group", { name: "Exposure matrix" });
    // The grid describes the scale as well as what sits on it.
    expect(within(grid).getAllByRole("button")).toHaveLength(25);
  });

  it("filters the register when a matrix cell is selected", async () => {
    const fetchMock = mockReads();
    const user = userEvent.setup();
    renderRisks();

    const grid = await screen.findByRole("group", { name: "Exposure matrix" });
    const cell = within(grid).getByRole("button", {
      name: /Almost certain probability, Severe impact/u,
    });
    await user.click(cell);

    expect(cell).toHaveAttribute("aria-pressed", "true");
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringMatching(/probability=5&impact=5/u),
        expect.anything(),
      ),
    );
  });

  it("releases the filter when the same cell is pressed again", async () => {
    mockReads();
    const user = userEvent.setup();
    renderRisks();

    const grid = await screen.findByRole("group", { name: "Exposure matrix" });
    const cell = within(grid).getByRole("button", {
      name: /Almost certain probability, Severe impact/u,
    });
    await user.click(cell);
    await user.click(cell);

    expect(cell).toHaveAttribute("aria-pressed", "false");
  });

  it("hides creation and deletion from someone who cannot manage projects", async () => {
    mockReads();
    renderRisks(viewerAuth);

    await screen.findByText("Rebar delivery may slip");
    expect(screen.queryByRole("button", { name: "Raise a risk" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete entry" })).not.toBeInTheDocument();
  });

  it("pre-selects the project when arriving from a project workspace", async () => {
    const fetchMock = mockReads();
    renderRisks(managerAuth, "/risks?projectId=p1");

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("projectId=p1"),
        expect.anything(),
      ),
    );
  });

  it("offers creation to a project manager who holds no company-wide permission", async () => {
    /*
     * The half of the mismatch that reads as the product being broken rather
     * than as a leak: somebody appointed manager of their own project saw no
     * Create button, because the page asked only whether they held
     * `risks.create` across the whole company.
     */
    mockReads();
    renderRisks();

    expect(await screen.findByRole("button", { name: "Raise a risk" })).toBeInTheDocument();
  });

  it("hides creation and deletion when the project grants neither", async () => {
    mockReads(capabilitiesFor({ createRisk: false, deleteRisk: false, editRisk: false }));
    renderRisks();

    await screen.findByText("Rebar delivery may slip");
    expect(screen.queryByRole("button", { name: "Raise a risk" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
    /*
     * The card title is the edit affordance, so it must stop being a button —
     * not merely lose its handler. Break-testing showed the two assertions
     * above pass with per-risk editing forced on, because neither looks at it.
     */
    expect(
      screen.queryByRole("button", { name: "Rebar delivery may slip" }),
    ).not.toBeInTheDocument();
  });

  it("makes the title an edit affordance when the project allows editing", async () => {
    // The other direction, so the assertion above cannot be satisfied by a
    // register that never offers editing at all.
    mockReads();
    renderRisks();

    expect(
      await screen.findByRole("button", { name: "Rebar delivery may slip" }),
    ).toBeInTheDocument();
  });

  it("reports a failed load instead of an empty register", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      if (String(input).includes("/v1/projects/capabilities")) return jsonResponse(capabilitiesFor());
      if (String(input).includes("/v1/projects")) return jsonResponse(projects);
      return jsonResponse({ error: { code: "INTERNAL", message: "boom" } }, 500);
    });
    renderRisks();

    expect(await screen.findByText("The register could not be loaded")).toBeInTheDocument();
  });

  it("renders in Arabic when Arabic is active", async () => {
    await setRectangleLanguage("ar");
    mockReads();
    renderRisks();

    expect(await screen.findByText("Rebar delivery may slip")).toBeInTheDocument();
    expect(screen.getByText("مصفوفة التعرّض")).toBeInTheDocument();
    expect(within(screen.getByRole("table")).getByText("حرجة")).toBeInTheDocument();
  });

  it("fills the column beside the matrix with real breakdowns", async () => {
    mockReads();
    renderRisks();

    await screen.findByText("Rebar delivery may slip");
    // The row the matrix left empty now carries figures from the same
    // aggregate, rather than being stretched to fill it.
    const severity = screen.getByRole("complementary", { name: "By severity" });
    expect(within(severity).getByRole("meter", { name: "Critical" })).toBeInTheDocument();

    const category = screen.getByRole("complementary", { name: "By category" });
    expect(within(category).getByRole("meter", { name: "Schedule" })).toBeInTheDocument();
  });

  it("says plainly that no model is connected rather than inventing advice", async () => {
    mockReads();
    renderRisks();

    const banner = await screen.findByRole("complementary", { name: "AI insight" });
    expect(
      within(banner).getByText("AI recommendations are not switched on"),
    ).toBeInTheDocument();
    // Nothing that reads as a finding.
    expect(within(banner).queryByText(/recommends/u)).not.toBeInTheDocument();
  });

  it("searches the register through the backend", async () => {
    const fetchMock = mockReads();
    const user = userEvent.setup();
    renderRisks();

    await screen.findByText("Rebar delivery may slip");
    await user.type(screen.getByLabelText("Search risks"), "rebar");

    // The API has supported this since the register was built; the page
    // simply never sent it.
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("search=rebar"),
        expect.anything(),
      ),
    );
  });

  it("offers the register as cards as well as rows", async () => {
    mockReads();
    const user = userEvent.setup();
    renderRisks();

    await screen.findByText("Rebar delivery may slip");
    await user.click(screen.getByRole("radio", { name: "Card view" }));

    // A card shows severity, owner and due date at a glance; a dense row
    // makes those a scan across columns.
    const grid = await screen.findByRole("list", { name: "Risk register" });
    expect(within(grid).getByText("Rebar delivery may slip")).toBeInTheDocument();
    expect(within(grid).getByText("Ahmed Sleem")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});
