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
  user: { tenantId: "1", userId: "2", roles: ["owner"], permissions: [] },
};

const viewerAuth: AuthContextValue = {
  ...adminAuth,
  user: { tenantId: "1", userId: "3", roles: ["none"], permissions: [] },
};

import TeamPage from "./TeamPage";
import { chooseOption } from "@/test/choose";

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
  { key: "projects.read", group: "projects", label: "View projects", description: "Open projects." },
  { key: "users.read", group: "users", label: "View people", description: "See people." },
  { key: "users.edit", group: "users", label: "Edit people", description: "Change people.", implies: ["users.read"] },
] };

const ownerTypeId = "11111111-1111-4111-8111-111111111111";
const viewerTypeId = "44444444-4444-4444-8444-444444444444";

const userTypes = { userTypes: [
  { id: ownerTypeId, name: "Office bundle", key: "office", permissions: ["projects.read", "users.read", "users.edit"], systemType: false },
  { id: viewerTypeId, name: "Site Viewer", key: "site_viewer", description: "Read-only site access.", permissions: ["projects.read"], systemType: false },
] };

/*
 * The people register as the directory endpoint answers it. It replaced the
 * administrative user list, which showed the same people in a second place —
 * each row now carries both the project context and the administrative fields.
 */
const people = { people: [
  {
    id: "22222222-2222-4222-8222-222222222222",
    displayName: "Owner",
    email: "owner@rectangle.test",
    status: "active",
    standing: "owner",
    projects: [
      { id: "p1", name: "Nile Tower", code: "NT-001", role: "owner", sharedWithViewer: true },
    ],
    sharedProjectCount: 1,
    openTaskCount: 2,
    permissions: [],
  },
  {
    id: "55555555-5555-4555-8555-555555555555",
    displayName: "Mona Adel",
    email: "mona@rectangle.test",
    status: "disabled",
    standing: "none",
    projects: [],
    sharedProjectCount: 0,
    openTaskCount: 0,
    permissions: ["projects.read"],
  },
] };

function mockReads({ registers = ["company", "colleagues"] }: { registers?: string[] } = {}) {
  return vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
    const url = String(input);
    if (url.includes("permissions")) return jsonResponse(permissions);
    if (url.includes("user-types")) return jsonResponse(userTypes);
    // Which register the caller may open decides which people they are sent.
    if (url.includes("/v1/directory/registers")) return jsonResponse({ registers });
    return jsonResponse(people);
  });
}

describe("TeamPage", () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    await setRectangleLanguage("en");
    window.localStorage.clear();
  });

  it("renders people with the projects the viewer may see", async () => {
    mockReads();
    renderTeam();

    expect(await screen.findByText("Mona Adel")).toBeInTheDocument();
    expect(screen.getByText("owner@rectangle.test")).toBeInTheDocument();
    // Named, not counted. A count says how much is hidden; the register shows
    // what the viewer is entitled to see and says so when that is nothing.
    expect(screen.getByText("Nile Tower")).toBeInTheDocument();
    expect(screen.getByText("No projects you can see")).toBeInTheDocument();
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
      if (url.includes("/v1/directory/registers")) return jsonResponse({ registers: ["company", "colleagues"] });
      return jsonResponse(people);
    });
    renderTeam();

    await user.click(await screen.findByRole("radio", { name: "Roles" }));
    await user.click(screen.getByRole("button", { name: "Create a role" }));
    await user.type(screen.getByLabelText("Name"), "Cost Controller");
    await user.type(screen.getByLabelText("Key"), "cost_controller");
    /*
     * Permissions are grouped now, and a group with nothing chosen starts
     * collapsed — which is what keeps twenty-seven of them readable. Open the
     * area before choosing from inside it, exactly as a person would.
     */
    await user.click(screen.getByRole("button", { name: /Projects/i }));
    await user.click(screen.getByRole("checkbox", { name: /View projects/i }));
    const dialog = screen.getByRole("dialog", { name: "Create a role" });
    await user.click(within(dialog).getByRole("button", { name: "Create a role" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/v1/admin/user-types", expect.objectContaining({ method: "POST" })));
  });

  it("opens an edit form filled with that person's current details", async () => {
    const user = userEvent.setup();
    const fetchMock = mockReads();
    renderTeam();

    await screen.findByText("Mona Adel");
    const card = screen.getByText("Mona Adel").closest("li")!;
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
    const card = screen.getByText("owner@rectangle.test").closest("li")!;
    await user.click(within(card).getByRole("button", { name: "Disable" }));

    const dialog = await screen.findByRole("dialog", { name: "Disable this person?" });
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));

    expect(fetchMock).not.toHaveBeenCalledWith(expect.stringContaining("/v1/admin/users/"), expect.objectContaining({ method: "PATCH" }));
  });

  it("gives someone with no administrative permission the directory and nothing else", async () => {
    mockReads();
    renderTeam(viewerAuth);

    /*
     * People is everyone's register — it shows this person their colleagues
     * rather than the company — so the segment is there and the row actions
     * are not. Roles is administrative and absent entirely.
     */
    const segments = await screen.findByRole("radiogroup", { name: "Team register" });
    expect(within(segments).getByRole("radio", { name: /People/u })).toBeInTheDocument();
    expect(within(segments).queryByRole("radio", { name: /Roles/u })).not.toBeInTheDocument();

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

  it("labels every register segment with visible text and an icon", async () => {
    mockReads();
    renderTeam();

    await screen.findByText("Mona Adel");
    const segments = screen.getByRole("radiogroup", { name: "Team register" });
    // The words must be rendered, not only announced, or the control is a row
    // of unlabelled squares.
    expect(within(segments).getByText("People")).toBeInTheDocument();
    expect(within(segments).getByText("Roles")).toBeInTheDocument();
    /*
     * One icon per option, counted from the options rather than hard-coded, so
     * adding a third register cannot leave it iconless while this still
     * passes — which is what a literal count here would allow.
     */
    const options = within(segments).getAllByRole("radio");
    expect(options).toHaveLength(2);
    expect(segments.querySelectorAll("svg").length).toBe(options.length);
  });

  it("keeps the toolbar intact when the register changes", async () => {
    const user = userEvent.setup();
    mockReads();
    renderTeam();

    await screen.findByText("Mona Adel");
    expect(screen.getByRole("textbox", { name: "Search people" })).toBeInTheDocument();
    expect(screen.getByRole("radiogroup", { name: "Card view" })).toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: /Roles/u }));

    /*
     * Withdrawing these on Roles rebuilt the row on every switch, and is the
     * fault this test exists to prevent coming back. The Filters button is
     * deliberately not asserted: saved lists have nothing left to filter by
     * now that the product seeds none, and a button that opens an empty panel
     * is worse than no button.
     */
    expect(screen.getByRole("textbox", { name: "Search roles" })).toBeInTheDocument();
    expect(screen.getByRole("radiogroup", { name: "Card view" })).toBeInTheDocument();
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

  it("shows a new person without the page being reloaded by hand", async () => {
    /*
     * The fault the owner reported, as a test. Creating somebody invalidated
     * `["admin", "users"]` while the register had moved to `["directory", ...]`,
     * so the refresh signal was sent to a key nothing was listening to and the
     * new person did not appear until the browser was reloaded.
     */
    const user = userEvent.setup();
    let currentPeople = [...people.people];
    vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
      const url = String(input);
      if (url.endsWith("/v1/admin/users") && init?.method === "POST") {
        currentPeople = [
          ...currentPeople,
          {
            ...people.people[1]!,
            id: "99999999-9999-4999-8999-999999999999",
            displayName: "Nadia Samir",
            email: "nadia@rectangle.test",
            status: "active",
          },
        ];
        return jsonResponse({ user: currentPeople.at(-1) }, 201);
      }
      if (url.includes("permissions")) return jsonResponse(permissions);
      if (url.includes("user-types")) return jsonResponse(userTypes);
      if (url.includes("/v1/directory/registers")) {
        return jsonResponse({ registers: ["company", "colleagues"] });
      }
      return jsonResponse({ people: currentPeople });
    });
    renderTeam();

    await screen.findByText("Mona Adel");
    expect(screen.queryByText("Nadia Samir")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Create user" }));
    const dialog = await screen.findByRole("dialog", { name: "Create user" });
    await user.type(within(dialog).getByLabelText("Name"), "Nadia Samir");
    await user.type(within(dialog).getByLabelText("Email"), "nadia@rectangle.test");
    await user.click(within(dialog).getByRole("button", { name: "Create user" }));

    expect(await screen.findByText("Nadia Samir")).toBeInTheDocument();
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
    expect(screen.getByText("Office bundle")).toBeInTheDocument();

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

    const table = screen.getByRole("table", { name: /Roles/u });
    expect(within(table).getByText("site_viewer")).toBeInTheDocument();
    expect(within(table).getByText("Site Viewer")).toBeInTheDocument();
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
    mockReads();
    renderTeam({
      ...adminAuth,
      user: {
        tenantId: "1", userId: "4", roles: ["none"],
        permissions: ["users.read", "users.create", "users.edit"],
      },
    });

    await screen.findByText("Mona Adel");
    // People actions are allowed for this principal.
    expect(screen.getByRole("button", { name: "Create user" })).toBeInTheDocument();

    /*
     * The register itself is gone, not merely its buttons. This principal
     * holds no `user_types.read`, and the rule is that a thing you may not do
     * is absent rather than offered and then refused — so there is no Roles
     * segment to open. Stricter than the behaviour this test was written
     * against, which showed the segment and hid the buttons inside it.
     */
    const segments = screen.getByRole("radiogroup", { name: "Team register" });
    expect(within(segments).queryByRole("radio", { name: /Roles/u })).not.toBeInTheDocument();
    expect(within(segments).getByRole("radio", { name: /People/u })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Create a role" })).not.toBeInTheDocument();
  });

  /*
   * The two faults the owner reported, as tests.
   *
   * "Why choose standing and then choose the accessibility options too?" and
   * the wall of checkboxes that produced it. Both are about the form asking
   * questions whose answers do not matter, so both are asserted from what the
   * screen actually offers rather than from internal state.
   */
  describe("the create-user form asks only what matters", () => {
    it("stops asking what somebody may do once they own the company", async () => {
      const user = userEvent.setup();
      mockReads();
      renderTeam();

      await screen.findByText("Mona Adel");
      await user.click(screen.getByRole("button", { name: "Create user" }));
      const dialog = await screen.findByRole("dialog", { name: "Create user" });

      // Ordinary people are described entirely by what is ticked for them.
      expect(within(dialog).getByText("What this person can do")).toBeInTheDocument();
      expect(within(dialog).getByText("Start from a saved list")).toBeInTheDocument();

      // An owner holds everything by standing, so the ticks would be a second
      // answer to a question already answered.
      await chooseOption(user, within(dialog).getByLabelText("Company standing"), "owner");
      expect(within(dialog).queryByText("Start from a saved list")).not.toBeInTheDocument();
      expect(
        within(dialog).getByText("Every permission, because they own the company."),
      ).toBeInTheDocument();
    });

    it("ticks permissions in a window of their own, stacked over the form", async () => {
      /*
       * The catalogue is taller than the form around it, so unfolding it in
       * place pushed the name and email off screen mid-task. It opens above
       * instead, and the form underneath is inert until it is finished — the
       * owner's rule that the original window cannot be touched until the
       * current one is done.
       */
      const user = userEvent.setup();
      mockReads();
      renderTeam();

      await screen.findByText("Mona Adel");
      await user.click(screen.getByRole("button", { name: "Create user" }));
      const form = await screen.findByRole("dialog", { name: "Create user" });

      await user.click(within(form).getByRole("button", { name: /Choose permissions/iu }));

      const picker = await screen.findByRole("dialog", { name: "What this person can do" });
      const formRoot = form.closest("[data-overlay-root]") as HTMLElement;
      expect(formRoot.inert).toBe(true);

      await user.click(within(picker).getByRole("button", { name: /Projects/iu }));
      await user.click(within(picker).getByRole("checkbox", { name: /View projects/iu }));
      await user.click(within(picker).getByRole("button", { name: /Done/iu }));

      // Closed, the form usable again, and showing what was just chosen.
      await waitFor(() => expect(formRoot.inert).toBe(false));
      expect(within(form).getByText("View projects")).toBeInTheDocument();
    });

    it("saves a new list from inside the form and applies it to the person", async () => {
      /*
       * A third window, opened from the second. What comes back is the
       * permissions themselves — the saved list is a convenience for next time
       * and grants nothing on its own.
       */
      const user = userEvent.setup();
      const fetchMock = mockReads();
      renderTeam();

      await screen.findByText("Mona Adel");
      await user.click(screen.getByRole("button", { name: "Create user" }));
      const form = await screen.findByRole("dialog", { name: "Create user" });
      await user.click(within(form).getByRole("button", { name: /Save a new list/iu }));

      const bundle = await screen.findByRole("dialog", { name: "Save a new list" });
      await user.type(within(bundle).getByLabelText("Name"), "Site engineer");
      await user.click(within(bundle).getByRole("button", { name: /Projects/iu }));
      await user.click(within(bundle).getByRole("checkbox", { name: /View projects/iu }));
      await user.click(within(bundle).getByRole("button", { name: /Save list/iu }));

      await waitFor(() => {
        const call = fetchMock.mock.calls.find(
          ([url, init]) =>
            String(url).endsWith("/v1/admin/user-types") && init?.method === "POST",
        );
        expect(call).toBeDefined();
        expect(JSON.parse(String(call?.[1]?.body)).key).toBe("site_engineer");
      });

      // The window closes and the form behind it shows the result.
      await waitFor(() =>
        expect(screen.queryByRole("dialog", { name: "Save a new list" })).not.toBeInTheDocument(),
      );
      expect(within(form).getByText("View projects")).toBeInTheDocument();
    });

    it("fills the boxes from a saved list without that list granting anything", async () => {
      /*
       * The whole point of demoting bundles. Applying one ticks boxes; what is
       * sent is the permissions themselves, so the person's access no longer
       * depends on a list somebody may edit later.
       */
      const user = userEvent.setup();
      const fetchMock = mockReads();
      renderTeam();

      await screen.findByText("Mona Adel");
      await user.click(screen.getByRole("button", { name: "Create user" }));
      const dialog = await screen.findByRole("dialog", { name: "Create user" });
      await user.type(within(dialog).getByLabelText("Name"), "Nadia Samir");
      await user.type(within(dialog).getByLabelText("Email"), "nadia@example.com");
      /*
       * By role, because the words now appear twice: once as the field's label
       * and once inside the control, which shows the chosen list. Asking for
       * the combobox names the thing being operated rather than the sentence
       * above it.
       */
      await chooseOption(
        user,
        within(dialog).getByRole("combobox", { name: "Start from a saved list" }),
        ownerTypeId,
      );
      await user.click(within(dialog).getByRole("button", { name: "Create user" }));

      await waitFor(() => {
        const call = fetchMock.mock.calls.find(
          ([url, init]) => String(url).endsWith("/v1/admin/users") && init?.method === "POST",
        );
        expect(call).toBeDefined();
        const body = JSON.parse(String(call?.[1]?.body));
        expect(body.permissions).toEqual(["projects.read", "users.read", "users.edit"]);
        expect(body.userTypeIds).toBeUndefined();
      });
    });

    it("allows somebody who will get their work from a project instead", async () => {
      /*
       * No company-wide permission at all is a legitimate answer: somebody
       * added so they can be put on a project. Refusing it would grant access
       * nobody asked for.
       */
      const user = userEvent.setup();
      const fetchMock = mockReads();
      renderTeam();

      await screen.findByText("Mona Adel");
      await user.click(screen.getByRole("button", { name: "Create user" }));
      const dialog = await screen.findByRole("dialog", { name: "Create user" });
      await user.type(within(dialog).getByLabelText("Name"), "Nadia Samir");
      await user.type(within(dialog).getByLabelText("Email"), "nadia@example.com");
      await user.click(within(dialog).getByRole("button", { name: "Create user" }));

      await waitFor(() => {
        const call = fetchMock.mock.calls.find(
          ([url, init]) => String(url).endsWith("/v1/admin/users") && init?.method === "POST",
        );
        expect(call).toBeDefined();
        expect(JSON.parse(String(call?.[1]?.body)).permissions).toEqual([]);
      });
    });
  });

  describe("the permission picker keeps a long list readable", () => {
    it("groups permissions by area and opens one at a time", async () => {
      const user = userEvent.setup();
      mockReads();
      renderTeam();

      await user.click(await screen.findByRole("radio", { name: "Roles" }));
      await user.click(screen.getByRole("button", { name: "Create a role" }));
      const dialog = await screen.findByRole("dialog", { name: "Create a role" });

      // Closed to begin with: the whole point is that the list is short until
      // somebody asks for an area.
      expect(within(dialog).queryByRole("checkbox", { name: /View projects/iu })).not.toBeInTheDocument();

      await user.click(within(dialog).getByRole("button", { name: /Projects/iu }));
      expect(within(dialog).getByRole("checkbox", { name: /View projects/iu })).toBeInTheDocument();
    });

    it("grants the read a write implies rather than a write nobody can see", async () => {
      const user = userEvent.setup();
      const fetchMock = mockReads();
      renderTeam();

      await user.click(await screen.findByRole("radio", { name: "Roles" }));
      await user.click(screen.getByRole("button", { name: "Create a role" }));
      const dialog = await screen.findByRole("dialog", { name: "Create a role" });
      await user.type(within(dialog).getByLabelText("Name"), "People Editor");
      await user.type(within(dialog).getByLabelText("Key"), "people_editor");

      await user.click(within(dialog).getByRole("button", { name: /People/iu }));
      await user.click(within(dialog).getByRole("checkbox", { name: /Edit people/iu }));

      // Choosing "edit" alone would produce somebody who can change a record
      // and not see the result, which nobody means to ask for.
      expect(within(dialog).getByRole("checkbox", { name: /View people/iu })).toBeChecked();

      fetchMock.mockImplementation((input, init) => {
        const url = String(input);
        if (init?.method === "POST") {
          expect(JSON.parse(String(init.body)).permissions).toEqual(["users.read", "users.edit"]);
          return jsonResponse({ userType: { id: "55555555-5555-4555-8555-555555555555", name: "People Editor", key: "people_editor", permissions: ["users.read", "users.edit"], systemType: false } }, 201);
        }
        if (url.includes("permissions")) return jsonResponse(permissions);
        if (url.includes("user-types")) return jsonResponse(userTypes);
        if (url.includes("/v1/directory/registers")) return jsonResponse({ registers: ["company", "colleagues"] });
        return jsonResponse(people);
      });
      await user.click(within(dialog).getByRole("button", { name: "Create a role" }));
      await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    });

    it("takes a whole area at once, and says how much of it is held", async () => {
      const user = userEvent.setup();
      mockReads();
      renderTeam();

      await user.click(await screen.findByRole("radio", { name: "Roles" }));
      await user.click(screen.getByRole("button", { name: "Create a role" }));
      const dialog = await screen.findByRole("dialog", { name: "Create a role" });

      await user.click(within(dialog).getByRole("button", { name: /People/iu }));
      expect(within(dialog).getByRole("button", { name: /People/iu })).toHaveTextContent("0 of 2");

      // "All" is what stops a company hand-picking eight boxes to express
      // something as ordinary as "may run the people register".
      const people = within(dialog).getByRole("button", { name: /People/iu }).closest("section");
      await user.click(within(people as HTMLElement).getByRole("checkbox", { name: "All" }));
      expect(within(dialog).getByRole("button", { name: /People/iu })).toHaveTextContent("2 of 2");
    });
  });
});
