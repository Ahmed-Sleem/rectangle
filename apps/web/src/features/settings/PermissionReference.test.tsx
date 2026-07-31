/**
 * The page that explains who can do what.
 *
 * The thing worth pinning is not that a table renders. It is that the four
 * rules a table cannot express are shown, and shown before the table — an owner
 * holds everything with no user type, a guest is refused everything, per-project
 * actions need reach as well as capability, and deletion is stricter than any
 * permission. A reader who takes the grid at face value without those draws the
 * wrong conclusion, and this page is the one place that is supposed to prevent
 * exactly that.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthContext, type AuthContextValue } from "@/shared/auth";
import { RectangleI18nProvider, setRectangleLanguage } from "@/shared/i18n";
import { PermissionReference } from "./PermissionReference";

const REFERENCE = {
  permissions: [
    {
      key: "projects.read",
      group: "projects",
      label: "View projects",
      description: "Open the project register.",
      heldBy: [{ id: "t1", name: "Read only" }],
    },
    {
      key: "projects.delete",
      group: "projects",
      label: "Delete projects",
      description: "Permanently destroy a project.",
      implies: ["projects.read"],
      heldBy: [],
    },
    {
      key: "users.edit",
      group: "users",
      label: "Edit people",
      description: "Change a person's details.",
      heldBy: [{ id: "t2", name: "People Admin" }],
    },
  ],
  projectRoles: [
    { role: "project_admin", grants: ["projects.read", "users.edit"] },
    { role: "external_collaborator", grants: [] },
  ],
  standings: [
    { standing: "owner", holdsEverything: true, refusedCompanyWide: false },
    { standing: "member", holdsEverything: false, refusedCompanyWide: false },
    { standing: "guest", holdsEverything: false, refusedCompanyWide: true },
  ],
  deletionRule: { requiresProjectAdmin: true, manageAllInsufficient: true },
};

const admin: AuthContextValue = {
  setupRequired: false,
  loading: false,
  refresh: async () => undefined,
  user: { tenantId: "1", userId: "2", roles: ["member"], permissions: ["settings.manage"] },
};

function json(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }),
  );
}

function mockApi(body: unknown = REFERENCE, status = 200) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(() => json(body, status));
}

function renderReference(auth: AuthContextValue = admin) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <RectangleI18nProvider>
        <AuthContext.Provider value={auth}>
          <PermissionReference />
        </AuthContext.Provider>
      </RectangleI18nProvider>
    </QueryClientProvider>,
  );
}

describe("PermissionReference", () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    await setRectangleLanguage("en");
  });

  it("refuses somebody who may not manage company settings", async () => {
    /*
     * Asked by the component rather than left to the section hosting it. A
     * component that only behaves while its parent remembers to gate it is one
     * refactor away from being reachable.
     */
    const fetchMock = mockApi();
    renderReference({
      ...admin,
      user: { tenantId: "1", userId: "3", roles: ["member"], permissions: ["user_types.read"] },
    });

    expect(await screen.findByText(/do not have access/iu)).toBeInTheDocument();
    // And it does not ask the server for a model it has no business reading.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows an error state that can be retried", async () => {
    mockApi({ error: { message: "nope" } }, 500);
    renderReference();
    expect(await screen.findByText(/could not be loaded/iu)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Try again/iu })).toBeInTheDocument();
  });

  it("states the rules a table cannot express, before the table", async () => {
    /*
     * The reason this page exists. Each of these changes how the grid should be
     * read, so a reader reaching the grid without them would conclude the wrong
     * thing — and a page that looks authoritative while being wrong is worse
     * than no page.
     */
    mockApi();
    renderReference();

    const rules = await screen.findByRole("region", { name: /Rules that decide access/iu });
    expect(within(rules).getByText(/holds every permission, whatever user types/iu)).toBeInTheDocument();
    expect(within(rules).getByText(/guest is refused every company-wide/iu)).toBeInTheDocument();
    expect(within(rules).getByText(/needs two things/iu)).toBeInTheDocument();
    expect(within(rules).getByText(/stricter than any permission/iu)).toBeInTheDocument();

    // Before, not merely present: the order is the point.
    const matrix = screen.getByRole("region", { name: /Every permission/iu });
    expect(rules.compareDocumentPosition(matrix) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("lists each permission with what it allows and who grants it", async () => {
    mockApi();
    renderReference();

    const matrix = await screen.findByRole("region", { name: /Every permission/iu });
    expect(within(matrix).getByText("View projects")).toBeInTheDocument();
    expect(within(matrix).getByText("Open the project register.")).toBeInTheDocument();
    expect(within(matrix).getByText("Read only")).toBeInTheDocument();
  });

  it("says plainly when only owners and administrators hold something", async () => {
    // An empty cell reads as a rendering fault. This is a real answer.
    mockApi();
    renderReference();
    const matrix = await screen.findByRole("region", { name: /Every permission/iu });
    expect(within(matrix).getByText(/No user type grants this/iu)).toBeInTheDocument();
  });

  it("explains why a granted set can be larger than the boxes ticked", async () => {
    mockApi();
    renderReference();
    const matrix = await screen.findByRole("region", { name: /Every permission/iu });
    expect(within(matrix).getByText(/Also grants View projects/iu)).toBeInTheDocument();
  });

  it("shows what a project role grants, which no company-wide table does", async () => {
    /*
     * The half of the model that lives on membership. Without it the page would
     * imply that everything comes from user types, which is how somebody
     * concludes a site engineer cannot run their own project.
     */
    mockApi();
    renderReference();

    const roles = await screen.findByRole("region", { name: /What a project role grants/iu });
    expect(within(roles).getByText("Project admin")).toBeInTheDocument();
    expect(within(roles).getByText(/Grants nothing on its own/iu)).toBeInTheDocument();
  });

  it("distinguishes the three kinds of standing", async () => {
    mockApi();
    renderReference();

    const standings = await screen.findByRole("region", { name: /Company standing/iu });
    expect(within(standings).getByText(/Holds every permission/iu)).toBeInTheDocument();
    expect(within(standings).getByText(/Refused every company-wide/iu)).toBeInTheDocument();
    expect(within(standings).getByText(/comes from their user types/iu)).toBeInTheDocument();
  });

  it("names a project role the same way the project team table does", async () => {
    // 'project_admin' rendered raw would mean the translation is missing and
    // nobody noticed, which a defaultValue would have hidden.
    mockApi();
    renderReference();
    const roles = await screen.findByRole("region", { name: /What a project role grants/iu });
    expect(within(roles).queryByText("project_admin")).not.toBeInTheDocument();
  });
});
