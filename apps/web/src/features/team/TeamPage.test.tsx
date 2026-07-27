/** Tests tenant team administration for real user types, users, and editing. */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { AuthContext, type AuthContextValue } from "@/shared/auth";
import { RectangleI18nProvider, setRectangleLanguage } from "@/shared/i18n";

const adminAuth: AuthContextValue = {
  setupRequired: false,
  loading: false,
  refresh: async () => undefined,
  user: { tenantId: "1", userId: "2", roles: ["admin"], permissions: [] },
};

const viewerAuth: AuthContextValue = {
  ...adminAuth,
  user: { tenantId: "1", userId: "3", roles: ["member"], permissions: [] },
};

import TeamPage from "./TeamPage";

function jsonResponse(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));
}

function renderTeam(auth: AuthContextValue = adminAuth) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <RectangleI18nProvider>
        <AuthContext.Provider value={auth}>
          <TeamPage />
        </AuthContext.Provider>
      </RectangleI18nProvider>
    </QueryClientProvider>,
  );
}

const permissions = { permissions: [
  { key: "projects.read", label: "View projects", description: "Open projects." },
  { key: "users.manage", label: "Manage users", description: "Create users." },
] };

const ownerTypeId = "11111111-1111-4111-8111-111111111111";
const viewerTypeId = "44444444-4444-4444-8444-444444444444";

const userTypes = { userTypes: [
  { id: ownerTypeId, name: "Owner", key: "owner", permissions: ["projects.read", "users.manage"], systemType: true },
  { id: viewerTypeId, name: "Site Viewer", key: "site_viewer", description: "Read-only site access.", permissions: ["projects.read"], systemType: false },
] };

const users = { users: [
  {
    id: "22222222-2222-4222-8222-222222222222",
    displayName: "Owner",
    email: "owner@rectangle.test",
    status: "active",
    standing: "owner",
    projectCount: 3,
    userTypes: [{ id: ownerTypeId, name: "Owner", key: "owner" }],
  },
  {
    id: "55555555-5555-4555-8555-555555555555",
    displayName: "Mona Adel",
    email: "mona@rectangle.test",
    status: "disabled",
    standing: "member",
    projectCount: 0,
    userTypes: [{ id: viewerTypeId, name: "Site Viewer", key: "site_viewer" }],
  },
] };

function mockReads() {
  return vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
    const url = String(input);
    if (url.includes("permissions")) return jsonResponse(permissions);
    if (url.includes("user-types")) return jsonResponse(userTypes);
    return jsonResponse(users);
  });
}

describe("TeamPage", () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    await setRectangleLanguage("en");
    window.localStorage.clear();
  });

  it("renders people from the API with their real project counts", async () => {
    mockReads();
    renderTeam();

    expect(await screen.findByText("Mona Adel")).toBeInTheDocument();
    expect(screen.getByText("owner@rectangle.test")).toBeInTheDocument();
    expect(screen.getByText("3 projects")).toBeInTheDocument();
    // A person with no project membership says so rather than showing nothing.
    expect(screen.getByText("0 projects")).toBeInTheDocument();
  });

  it("summarises the register from the records it loaded", async () => {
    mockReads();
    renderTeam();

    const summary = await screen.findByRole("group", { name: "Team administration" });
    expect(within(summary).getByText("People")).toBeInTheDocument();
    // Two people, one active, one disabled, two roles.
    expect(within(summary).getAllByText("2").length).toBeGreaterThan(0);
    expect(within(summary).getAllByText("1").length).toBeGreaterThan(0);
  });

  it("filters people by search term", async () => {
    const user = userEvent.setup();
    mockReads();
    renderTeam();

    await screen.findByText("Mona Adel");
    await user.type(screen.getByLabelText("Search people"), "mona");

    await waitFor(() => expect(screen.queryByText("owner@rectangle.test")).not.toBeInTheDocument());
    expect(screen.getByText("Mona Adel")).toBeInTheDocument();
  });

  it("offers a way out when filters match nobody", async () => {
    const user = userEvent.setup();
    mockReads();
    renderTeam();

    await screen.findByText("Mona Adel");
    await user.type(screen.getByLabelText("Search people"), "nobody-by-this-name");

    expect(await screen.findByText("No matching people")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(await screen.findByText("Mona Adel")).toBeInTheDocument();
  });

  it("names a role's permissions instead of counting them", async () => {
    const user = userEvent.setup();
    mockReads();
    renderTeam();

    await screen.findByText("Mona Adel");
    await user.click(screen.getByRole("radio", { name: "Roles" }));

    expect(await screen.findByText("Site Viewer")).toBeInTheDocument();
    expect(screen.getAllByText("View projects").length).toBeGreaterThan(0);
    expect(screen.getByText("Read-only site access.")).toBeInTheDocument();
  });

  it("submits a new user type", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.spyOn(globalThis, "fetch");
    fetchMock.mockImplementation((input, init) => {
      const url = String(input);
      if (init?.method === "POST") {
        expect(JSON.parse(String(init.body))).toMatchObject({ name: "Cost Controller", key: "cost_controller", permissions: ["projects.read"] });
        return jsonResponse({ userType: { id: "33333333-3333-4333-8333-333333333333", name: "Cost Controller", key: "cost_controller", permissions: ["projects.read"], systemType: false } }, 201);
      }
      if (url.includes("permissions")) return jsonResponse(permissions);
      if (url.includes("user-types")) return jsonResponse(userTypes);
      return jsonResponse(users);
    });
    renderTeam();

    await user.click(await screen.findByRole("radio", { name: "Roles" }));
    await user.click(screen.getByRole("button", { name: "Create user type" }));
    await user.type(screen.getByLabelText("Name"), "Cost Controller");
    await user.type(screen.getByLabelText("Key"), "cost_controller");
    await user.click(screen.getByRole("checkbox", { name: /View projects/i }));
    const dialog = screen.getByRole("dialog", { name: "Create user type" });
    await user.click(within(dialog).getByRole("button", { name: "Create user type" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/v1/admin/user-types", expect.objectContaining({ method: "POST" })));
  });

  it("opens an edit form filled with that person's current details", async () => {
    const user = userEvent.setup();
    const fetchMock = mockReads();
    renderTeam();

    await screen.findByText("Mona Adel");
    const card = screen.getByText("Mona Adel").closest("article")!;
    await user.click(within(card).getByRole("button", { name: "Edit" }));

    const dialog = await screen.findByRole("dialog", { name: "Edit person" });
    expect(within(dialog).getByLabelText("Name")).toHaveValue("Mona Adel");

    await user.clear(within(dialog).getByLabelText("Name"));
    await user.type(within(dialog).getByLabelText("Name"), "Mona A. Adel");
    await user.click(within(dialog).getByRole("button", { name: "Save changes" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/v1/admin/users/55555555-5555-4555-8555-555555555555",
        expect.objectContaining({ method: "PATCH" }),
      ),
    );
  });

  it("confirms before locking someone out, and does not disable on cancel", async () => {
    const user = userEvent.setup();
    const fetchMock = mockReads();
    renderTeam();

    await screen.findByText("owner@rectangle.test");
    const card = screen.getByText("owner@rectangle.test").closest("article")!;
    await user.click(within(card).getByRole("button", { name: "Disable" }));

    const dialog = await screen.findByRole("dialog", { name: "Disable this person?" });
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));

    expect(fetchMock).not.toHaveBeenCalledWith(expect.stringContaining("/v1/admin/users/"), expect.objectContaining({ method: "PATCH" }));
  });

  it("hides every administrative action from someone who cannot manage users", async () => {
    mockReads();
    renderTeam(viewerAuth);

    await screen.findByText("Mona Adel");
    expect(screen.queryByRole("button", { name: "Create user" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Disable" })).not.toBeInTheDocument();
  });

  it("reports a failed load instead of showing an empty register", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(() =>
      jsonResponse({ error: { code: "INTERNAL", message: "boom" } }, 500),
    );
    renderTeam();

    expect(await screen.findByText("Team could not be loaded")).toBeInTheDocument();
    expect(screen.queryByText("No people yet")).not.toBeInTheDocument();
  });

  it("renders in Arabic when Arabic is active", async () => {
    await setRectangleLanguage("ar");
    mockReads();
    renderTeam();

    expect(await screen.findByText("Mona Adel")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "الأشخاص" })).toBeInTheDocument();
    expect(screen.getAllByText("معطّل").length).toBeGreaterThan(0);
  });

  it("labels the people and roles segments with visible text and icons", async () => {
    mockReads();
    renderTeam();

    await screen.findByText("Mona Adel");
    const segments = screen.getByRole("radiogroup", { name: "Team register" });
    // The words must be rendered, not only announced, or the control is a
    // pair of unlabelled squares.
    expect(within(segments).getByText("People")).toBeInTheDocument();
    expect(within(segments).getByText("Roles")).toBeInTheDocument();
    expect(segments.querySelectorAll("svg").length).toBe(2);
  });

  it("keeps the toolbar intact when the register changes", async () => {
    const user = userEvent.setup();
    mockReads();
    renderTeam();

    await screen.findByText("Mona Adel");
    expect(screen.getByRole("textbox", { name: "Search people" })).toBeInTheDocument();
    expect(screen.getByRole("radiogroup", { name: "Card view" })).toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: /Roles/u }));

    // Withdrawing these on Roles rebuilt the row on every switch, and is the
    // fault this test exists to prevent coming back.
    expect(screen.getByRole("textbox", { name: "Search roles" })).toBeInTheDocument();
    expect(screen.getByRole("radiogroup", { name: "Card view" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Filters/u })).toBeInTheDocument();
  });

  it("puts the register picker after search so the keyboard path matches the layout", async () => {
    mockReads();
    renderTeam();

    await screen.findByText("Mona Adel");
    const search = screen.getByRole("textbox", { name: "Search people" });
    const register = screen.getByRole("radiogroup", { name: "Team register" });

    // DOCUMENT_POSITION_FOLLOWING: the register comes after the search field.
    expect(search.compareDocumentPosition(register) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("searches roles by name, key and description", async () => {
    const user = userEvent.setup();
    mockReads();
    renderTeam();

    await screen.findByText("Mona Adel");
    await user.click(screen.getByRole("radio", { name: /Roles/u }));
    expect(screen.getByText("Site Viewer")).toBeInTheDocument();

    await user.type(screen.getByRole("textbox", { name: "Search roles" }), "site_viewer");
    expect(screen.getByText("Site Viewer")).toBeInTheDocument();
    expect(screen.queryByText("Owner")).not.toBeInTheDocument();

    await user.clear(screen.getByRole("textbox", { name: "Search roles" }));
    await user.type(screen.getByRole("textbox", { name: "Search roles" }), "Read-only");
    expect(screen.getByText("Site Viewer")).toBeInTheDocument();
  });

  it("keeps people and role searches apart", async () => {
    const user = userEvent.setup();
    mockReads();
    renderTeam();

    await screen.findByText("Mona Adel");
    await user.type(screen.getByRole("textbox", { name: "Search people" }), "Mona");

    await user.click(screen.getByRole("radio", { name: /Roles/u }));
    // A term typed against people must not silently narrow a register it means
    // nothing in.
    expect(screen.getByRole("textbox", { name: "Search roles" })).toHaveValue("");
    expect(screen.getByText("Site Viewer")).toBeInTheDocument();
    expect(screen.getByText("Owner")).toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: /People/u }));
    expect(screen.getByRole("textbox", { name: "Search people" })).toHaveValue("Mona");
  });

  it("shows roles as a table when the table view is chosen", async () => {
    const user = userEvent.setup();
    mockReads();
    renderTeam();

    await screen.findByText("Mona Adel");
    await user.click(screen.getByRole("radio", { name: /Roles/u }));
    await user.click(screen.getByRole("radio", { name: "Table view" }));

    const table = screen.getByRole("table", { name: /User types/u });
    expect(within(table).getByText("site_viewer")).toBeInTheDocument();
    expect(within(table).getByText("Created here")).toBeInTheDocument();
  });

  it("offers a way out when no role matches", async () => {
    const user = userEvent.setup();
    mockReads();
    renderTeam();

    await screen.findByText("Mona Adel");
    await user.click(screen.getByRole("radio", { name: /Roles/u }));
    await user.type(screen.getByRole("textbox", { name: "Search roles" }), "zzzz");

    expect(screen.getByText("No matching roles")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(screen.getByText("Site Viewer")).toBeInTheDocument();
  });

  it("hides role actions from someone who may manage people but not roles", async () => {
    const user = userEvent.setup();
    mockReads();
    renderTeam({
      ...adminAuth,
      user: { tenantId: "1", userId: "4", roles: ["member"], permissions: ["users.manage"] },
    });

    await screen.findByText("Mona Adel");
    // People actions are allowed for this principal.
    expect(screen.getByRole("button", { name: "Create user" })).toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: /Roles/u }));
    // Roles need user_types.manage, which this principal does not hold.
    expect(screen.queryByRole("button", { name: "Create user type" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
  });
});
