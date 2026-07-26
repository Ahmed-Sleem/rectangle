/** Tests that Today renders only backend-provided figures and every state. */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthContext, type AuthContextValue } from "@/shared/auth";
import { RectangleI18nProvider, setRectangleLanguage } from "@/shared/i18n";
import TodayPage from "./TodayPage";

const managerAuth: AuthContextValue = {
  setupRequired: false,
  loading: false,
  refresh: async () => undefined,
  user: { tenantId: "1", userId: "2", roles: ["tenant_admin"], permissions: [] },
};

const viewerAuth: AuthContextValue = {
  ...managerAuth,
  user: { tenantId: "1", userId: "3", roles: ["viewer"], permissions: [] },
};

function jsonResponse(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

function renderToday(auth: AuthContextValue = managerAuth) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <RectangleI18nProvider>
        <AuthContext.Provider value={auth}>
          <MemoryRouter>
            <TodayPage />
          </MemoryRouter>
        </AuthContext.Provider>
      </RectangleI18nProvider>
    </QueryClientProvider>,
  );
}

const populated = {
  overview: {
    horizonDays: 14,
    totalProjects: 4,
    statusCounts: [
      { status: "active", count: 3 },
      { status: "completed", count: 1 },
    ],
    budgets: [{ currency: "EGP", amount: "2500000.00", projectCount: 2 }],
    attention: [
      {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        name: "New Cairo Tower",
        code: "NCT-01",
        status: "active",
        reason: "overdue",
        daysFromToday: -3,
        plannedFinishDate: "2026-07-22",
      },
      {
        id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        name: "Alexandria Depot",
        code: "ALX-04",
        status: "planned",
        reason: "starting_soon",
        daysFromToday: 5,
        plannedStartDate: "2026-07-30",
      },
    ],
    activity: [
      {
        id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        action: "project.create",
        entityType: "project",
        entityId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        result: "success",
        actorName: "Ahmed Sleem",
        metadata: {},
        createdAt: "2026-07-20T09:30:00.000Z",
      },
    ],
    tasks: { open: 9, overdue: 2, dueSoon: 4, assignedToMe: 3 },
    risks: { open: 5, criticalOrHigh: 2, occurred: 1 },
    team: { activeUsers: 6, disabledUsers: 1 },
  },
};

describe("TodayPage", () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    await setRectangleLanguage("en");
  });

  it("shows the figures the backend returned", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(() => jsonResponse(populated));
    renderToday();

    expect(await screen.findByText("New Cairo Tower")).toBeInTheDocument();
    expect(screen.getByText("Alexandria Depot")).toBeInTheDocument();
    // Total projects comes from the rollup, not from the length of any list.
    const summary = screen.getByRole("group", { name: "Portfolio at a glance" });
    expect(within(summary).getByText("Projects").parentElement).toHaveTextContent("4");
    expect(screen.getByText("Past planned finish")).toBeInTheDocument();
    expect(screen.getByText("3 days late")).toBeInTheDocument();
    expect(screen.getByText("In 5 days")).toBeInTheDocument();
  });

  it("links every attention row to its project record", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(() => jsonResponse(populated));
    renderToday();

    const link = await screen.findByRole("link", { name: /New Cairo Tower/u });
    expect(link).toHaveAttribute("href", "/projects/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
  });

  it("omits the people figure when the backend did not send one", async () => {
    const withoutTeam = { overview: { ...populated.overview, team: undefined } };
    vi.spyOn(globalThis, "fetch").mockImplementation(() => jsonResponse(withoutTeam));
    renderToday(viewerAuth);

    expect(await screen.findByText("New Cairo Tower")).toBeInTheDocument();
    expect(screen.queryByText("People")).not.toBeInTheDocument();
  });

  it("offers project creation from the empty state only to those who may create", async () => {
    const empty = {
      overview: {
        horizonDays: 14,
        totalProjects: 0,
        statusCounts: [],
        budgets: [],
        attention: [],
        activity: [],
        tasks: { open: 0, overdue: 0, dueSoon: 0, assignedToMe: 0 },
        risks: { open: 0, criticalOrHigh: 0, occurred: 0 },
      },
    };
    vi.spyOn(globalThis, "fetch").mockImplementation(() => jsonResponse(empty));
    const view = renderToday(viewerAuth);

    expect(await screen.findByText("Nothing to show yet")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Create project" })).not.toBeInTheDocument();

    view.unmount();
    renderToday(managerAuth);
    expect(await screen.findByRole("link", { name: "Create project" })).toBeInTheDocument();
  });

  it("reports a failed load instead of showing zeroes", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(() =>
      jsonResponse({ error: { code: "INTERNAL", message: "boom" } }, 500),
    );
    renderToday();

    expect(await screen.findByText("Today could not be loaded")).toBeInTheDocument();
    expect(screen.queryByText("Needs your attention")).not.toBeInTheDocument();
  });

  it("says nothing is due rather than hiding the panel", async () => {
    const quiet = {
      overview: { ...populated.overview, attention: [] },
    };
    vi.spyOn(globalThis, "fetch").mockImplementation(() => jsonResponse(quiet));
    renderToday();

    expect(await screen.findByText("Nothing due right now")).toBeInTheDocument();
  });

  it("renders in Arabic when Arabic is active", async () => {
    await setRectangleLanguage("ar");
    vi.spyOn(globalThis, "fetch").mockImplementation(() => jsonResponse(populated));
    renderToday();

    expect(await screen.findByText("يحتاج انتباهك")).toBeInTheDocument();
    expect(screen.getByText("تجاوز تاريخ الانتهاء المخطط")).toBeInTheDocument();
  });

  it("surfaces open work from the tasks module", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(() => jsonResponse(populated));
    renderToday();

    const panel = await screen.findByRole("complementary", { name: "Work in progress" });
    expect(within(panel).getByText("Open tasks").parentElement).toHaveTextContent("9");
    expect(within(panel).getByText("Overdue").parentElement).toHaveTextContent("2");
    expect(within(panel).getByRole("link", { name: "View all tasks" })).toHaveAttribute("href", "/tasks");
  });

  it("says so plainly when there is no open work", async () => {
    const quiet = {
      overview: { ...populated.overview, tasks: { open: 0, overdue: 0, dueSoon: 0, assignedToMe: 0 } },
    };
    vi.spyOn(globalThis, "fetch").mockImplementation(() => jsonResponse(quiet));
    renderToday();

    const panel = await screen.findByRole("complementary", { name: "Work in progress" });
    expect(within(panel).getByText("No open work on your projects.")).toBeInTheDocument();
  });

  it("leads with what is due, and names the overdue count beside it", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(() => jsonResponse(populated));
    renderToday();

    const summary = await screen.findByRole("group", { name: "Portfolio at a glance" });
    // "What is due" is the question the page is opened to answer, so it belongs
    // in the headline row rather than only in the side panel.
    const due = within(summary).getByText("Due within 14 days");
    expect(due.closest("div")).toHaveTextContent("4");
    expect(within(summary).getByText("2 already overdue")).toBeInTheDocument();
  });

  it("does not claim overdue work when there is none", async () => {
    const onTrack = {
      overview: { ...populated.overview, tasks: { open: 9, overdue: 0, dueSoon: 4, assignedToMe: 3 } },
    };
    vi.spyOn(globalThis, "fetch").mockImplementation(() => jsonResponse(onTrack));
    renderToday();

    const summary = await screen.findByRole("group", { name: "Portfolio at a glance" });
    expect(within(summary).getByText("Due within 14 days")).toBeInTheDocument();
    expect(within(summary).queryByText(/already overdue/u)).not.toBeInTheDocument();
  });
});
