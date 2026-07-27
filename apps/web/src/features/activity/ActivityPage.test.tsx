/** Tests the activity trail page: scoping, grouping, filters and paging. */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthContext, type AuthContextValue } from "@/shared/auth";
import { RectangleI18nProvider, setRectangleLanguage } from "@/shared/i18n";
import ActivityPage from "./ActivityPage";

const viewerAuth: AuthContextValue = {
  setupRequired: false,
  loading: false,
  refresh: async () => undefined,
  user: { tenantId: "1", userId: "2", roles: ["member"], permissions: ["projects.read"] },
};

const adminAuth: AuthContextValue = {
  ...viewerAuth,
  user: { tenantId: "1", userId: "2", roles: ["admin"], permissions: [] },
};

function jsonResponse(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }),
  );
}

function renderActivity(auth: AuthContextValue = viewerAuth) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <RectangleI18nProvider>
        <AuthContext.Provider value={auth}>
          <MemoryRouter>
            <ActivityPage />
          </MemoryRouter>
        </AuthContext.Provider>
      </RectangleI18nProvider>
    </QueryClientProvider>,
  );
}

const entry = {
  id: "e1",
  action: "project.update",
  entityType: "project",
  entityId: "p1",
  result: "success" as const,
  sensitivity: "operational" as const,
  actorUserId: "2",
  actorName: "Mona Adel",
  projectId: "p1",
  projectName: "Cairo Metro",
  metadata: {},
  createdAt: "2026-02-01T10:00:00.000Z",
};

/** Routes the two endpoints the page calls. */
function mockApi(page: Record<string, unknown>, actions: string[] = ["project.update"]) {
  vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
    const url = String(input);
    if (url.includes("/v1/activity/actions")) return jsonResponse({ actions });
    return jsonResponse(page);
  });
}

describe("ActivityPage", () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    await setRectangleLanguage("en");
    window.localStorage.clear();
  });

  it("shows what happened, grouped under the day it happened", async () => {
    mockApi({ entries: [entry], availableScopes: ["self"] });
    renderActivity();

    expect(await screen.findByText("Mona Adel")).toBeInTheDocument();
    expect(screen.getByText("Updated project details")).toBeInTheDocument();
    // Grouped by day rather than a flat run of timestamps.
    expect(screen.getByRole("region", { name: /February/u })).toBeInTheDocument();
  });

  it("offers no scope control to someone who may only see their own", async () => {
    mockApi({ entries: [entry], availableScopes: ["self"] });
    renderActivity();

    await screen.findByText("Mona Adel");
    // A control with one option is a control that cannot do anything, and
    // showing "Everyone" to someone refused it would be a lie.
    expect(screen.queryByRole("radiogroup", { name: "Whose activity" })).not.toBeInTheDocument();
  });

  it("offers every scope the server says the viewer may ask for", async () => {
    mockApi({ entries: [entry], availableScopes: ["self", "team", "all"] });
    renderActivity(adminAuth);

    await screen.findByText("Mona Adel");
    const scopes = screen.getByRole("radiogroup", { name: "Whose activity" });
    expect(within(scopes).getByRole("radio", { name: /Mine/u })).toBeInTheDocument();
    expect(within(scopes).getByRole("radio", { name: /Everyone/u })).toBeInTheDocument();
  });

  it("marks a failed action so it can be picked out", async () => {
    mockApi({
      entries: [{ ...entry, action: "auth.login_failed", result: "failure", sensitivity: "security" }],
      availableScopes: ["self"],
    });
    renderActivity();

    expect(await screen.findByText("Failed sign-in attempt")).toBeInTheDocument();
    expect(screen.getByText("Failed")).toBeInTheDocument();
  });

  it("says plainly when nothing has happened", async () => {
    mockApi({ entries: [], availableScopes: ["self"] });
    renderActivity();

    expect(await screen.findByText("Nothing has happened yet")).toBeInTheDocument();
  });

  it("distinguishes an empty trail from a filter that matched nothing", async () => {
    const user = userEvent.setup();
    mockApi({ entries: [], availableScopes: ["self"] }, ["project.update", "task.create"]);
    renderActivity();

    await screen.findByText("Nothing has happened yet");

    await user.click(screen.getByRole("button", { name: /Filters/u }));
    // Filters apply as they are chosen, so the list behind the window has
    // already changed by the time the choice is made.
    await user.selectOptions(screen.getByLabelText("Filter by outcome"), "failure");

    // "Nothing has happened" would be wrong here: things happened, none matched.
    expect(await screen.findByText("No matching activity")).toBeInTheDocument();
    expect(screen.queryByText("Nothing has happened yet")).not.toBeInTheDocument();
  });

  it("offers more only when the server says another page exists", async () => {
    mockApi({ entries: [entry], availableScopes: ["self"] });
    renderActivity();

    await screen.findByText("Mona Adel");
    expect(screen.queryByRole("button", { name: "Show older" })).not.toBeInTheDocument();
  });

  it("shows an error state rather than an empty page when the read fails", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(() =>
      jsonResponse({ error: { code: "INTERNAL", message: "boom" } }, 500),
    );
    renderActivity();

    expect(await screen.findByText("Activity could not be loaded")).toBeInTheDocument();
  });

  it("renders in Arabic when Arabic is active", async () => {
    await setRectangleLanguage("ar");
    mockApi({ entries: [entry], availableScopes: ["self"] });
    renderActivity();

    expect(await screen.findByText("Mona Adel")).toBeInTheDocument();
    expect(screen.getByText("حدّث بيانات المشروع")).toBeInTheDocument();
  });
});
