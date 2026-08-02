/** Tests the activity trail page: scoping, grouping, filters and paging. */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthContext, type AuthContextValue } from "@/shared/auth";
import { RectangleI18nProvider, setRectangleLanguage } from "@/shared/i18n";
import ActivityPage from "./ActivityPage";
import activityCss from "./ActivityPage.css?raw";
import projectsCss from "@/features/projects/ProjectsPage.css?raw";

const viewerAuth: AuthContextValue = {
  setupRequired: false,
  loading: false,
  refresh: async () => undefined,
  user: { tenantId: "1", userId: "2", roles: ["none"], permissions: ["projects.read"] },
};

const adminAuth: AuthContextValue = {
  ...viewerAuth,
  user: { tenantId: "1", userId: "2", roles: ["owner"], permissions: [] },
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
const emptySummary = { total: 0, failures: 0, people: 0, topActors: [], topActions: [], topProjects: [], attention: [] };

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
    mockApi({ entries: [entry], availableScopes: ["self"], summary: { total: 1, failures: 0, people: 1, topActors: [], topActions: [], topProjects: [], attention: [] } });
    renderActivity();

    expect(await screen.findByText("Mona Adel")).toBeInTheDocument();
    expect(screen.getByText("Updated project details")).toBeInTheDocument();
    // Grouped by day rather than a flat run of timestamps.
    expect(screen.getByRole("region", { name: /February/u })).toBeInTheDocument();
  });

  it("offers no scope control to someone who may only see their own", async () => {
    mockApi({ entries: [entry], availableScopes: ["self"], summary: { total: 1, failures: 0, people: 1, topActors: [], topActions: [], topProjects: [], attention: [] } });
    renderActivity();

    await screen.findByText("Mona Adel");
    // A control with one option is a control that cannot do anything, and
    // showing "Everyone" to someone refused it would be a lie.
    expect(screen.queryByRole("radiogroup", { name: "Whose activity" })).not.toBeInTheDocument();
  });

  it("offers every scope the server says the viewer may ask for", async () => {
    mockApi({ entries: [entry], availableScopes: ["self", "team", "all"], summary: { total: 1, failures: 0, people: 1, topActors: [], topActions: [], topProjects: [], attention: [] } });
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
      summary: { total: 1, failures: 1, people: 1, topActors: [], topActions: [], topProjects: [], attention: [] },
    });
    renderActivity();

    expect(await screen.findByText("Failed sign-in attempt")).toBeInTheDocument();
    // "Failed" also names a summary card, so the badge is found on the entry
    // rather than anywhere on the page.
    const entryRow = screen.getByText("Failed sign-in attempt").closest("li");
    expect(entryRow).not.toBeNull();
    expect(within(entryRow as HTMLElement).getByText("Failed")).toBeInTheDocument();
  });

  it("says plainly when nothing has happened", async () => {
    mockApi({ entries: [], availableScopes: ["self"], summary: emptySummary });
    renderActivity();

    expect(await screen.findByText("Nothing has happened yet")).toBeInTheDocument();
  });

  it("distinguishes an empty trail from a filter that matched nothing", async () => {
    const user = userEvent.setup();
    mockApi({ entries: [], availableScopes: ["self"], summary: emptySummary }, ["project.update", "task.create"]);
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
    mockApi({ entries: [entry], availableScopes: ["self"], summary: { total: 1, failures: 0, people: 1, topActors: [], topActions: [], topProjects: [], attention: [] } });
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
    mockApi({ entries: [entry], availableScopes: ["self"], summary: { total: 1, failures: 0, people: 1, topActors: [], topActions: [], topProjects: [], attention: [] } });
    renderActivity();

    expect(await screen.findByText("Mona Adel")).toBeInTheDocument();
    expect(screen.getByText("حدّث بيانات المشروع")).toBeInTheDocument();
  });

  it("leads with a date range, because that is what people narrow first", async () => {
    mockApi({ entries: [entry], availableScopes: ["self"], summary: { total: 1, failures: 0, people: 1, topActors: [], topActions: [], topProjects: [], attention: [] } });
    renderActivity();

    await screen.findByText("Mona Adel");
    const range = screen.getByRole("radiogroup", { name: "Date range" });
    expect(within(range).getByRole("radio", { name: "Today" })).toBeInTheDocument();
    expect(within(range).getByRole("radio", { name: "This week" })).toBeInTheDocument();
  });

  it("asks the server for the chosen range rather than filtering locally", async () => {
    const user = userEvent.setup();
    const urls: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const url = String(input);
      urls.push(url);
      if (url.includes("/v1/activity/actions")) return jsonResponse({ actions: [] });
      return jsonResponse({ entries: [entry], availableScopes: ["self"], summary: { total: 1, failures: 0, people: 1, topActors: [], topActions: [], topProjects: [], attention: [] } });
    });
    renderActivity();

    await screen.findByText("Mona Adel");
    await user.click(screen.getByRole("radio", { name: "Today" }));

    // The server decides what "today" means. A browser in another timezone
    // computing its own boundary would disagree with the summary above it.
    await waitFor(() => expect(urls.some((url) => url.includes("preset=today"))).toBe(true));
  });

  it("shows figures for the whole range, not the page that was fetched", async () => {
    mockApi({
      entries: [entry],
      availableScopes: ["self"],
      summary: { total: 412, failures: 7, people: 9, busiestDay: "2026-02-01", busiestDayCount: 88, topActors: [], topActions: [], topProjects: [], attention: [] },
    });
    renderActivity();

    const glance = await screen.findByRole("group", { name: "Activity at a glance" });
    // One entry was returned; the range holds 412. Counting the entries would
    // have reported 1 and been quietly wrong.
    expect(within(glance).getByText("412")).toBeInTheDocument();
    expect(within(glance).getByText("7")).toBeInTheDocument();
    expect(within(glance).getByText("9")).toBeInTheDocument();
    expect(within(glance).getByText("88 events")).toBeInTheDocument();
  });

  it("hides the figures when the range holds nothing", async () => {
    mockApi({ entries: [], availableScopes: ["self"], summary: emptySummary });
    renderActivity();

    await screen.findByText("Nothing has happened yet");
    // A row of zeroes is furniture; the empty state already says it.
    expect(screen.queryByRole("group", { name: "Activity at a glance" })).not.toBeInTheDocument();
  });

  it("labels a day group with a relative word and keeps the date beside it", async () => {
    const today = new Date().toISOString();
    mockApi({
      entries: [{ ...entry, createdAt: today }],
      availableScopes: ["self"],
      summary: { total: 1, failures: 0, people: 1, topActors: [], topActions: [], topProjects: [], attention: [] },
    });
    renderActivity();

    await screen.findByText("Mona Adel");
    // "Today" answers how recent before the eye parses a date; the date stays
    // because the relative word alone is useless out of context.
    expect(screen.getByText("Today", { selector: ".rect-activity-day__relative" })).toBeInTheDocument();
    expect(screen.getByText("1 event")).toBeInTheDocument();
  });

  it("uses the plain date for a day that is neither today nor yesterday", async () => {
    mockApi({ entries: [entry], availableScopes: ["self"], summary: { total: 1, failures: 0, people: 1, topActors: [], topActions: [], topProjects: [], attention: [] } });
    renderActivity();

    await screen.findByText("Mona Adel");
    expect(screen.queryByText("Today", { selector: ".rect-activity-day__relative" })).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: /February/u })).toBeInTheDocument();
  });

  it("searches the server rather than the rows already on screen", async () => {
    const user = userEvent.setup();
    const urls: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const url = String(input);
      urls.push(url);
      if (url.includes("/v1/activity/actions")) return jsonResponse({ actions: [] });
      return jsonResponse({ entries: [entry], availableScopes: ["self"], summary: { total: 1, failures: 0, people: 1, topActors: [], topActions: [], topProjects: [], attention: [] } });
    });
    renderActivity();

    await screen.findByRole("textbox", { name: "Search activity" });
    await user.type(screen.getByRole("textbox", { name: "Search activity" }), "Mona");

    // Filtering the fetched page would silently miss matches further back in
    // the range, which is the same fault the summary avoids.
    /*
     * The final keystroke is what matters: React re-queries per character, so
     * asserting on the complete term proves the whole value reached the server
     * rather than only that some search happened.
     */
    /*
     * The query key includes the term, so the client re-fetches as it settles.
     * Waiting for the complete word proves the whole value reached the server
     * rather than only the first keystroke that happened to be in flight.
     */
    /*
     * The whole term must reach the server. This caught a real fault: changing
     * the search changed the query key, `isLoading` went true, the page was
     * replaced by a spinner, and the field being typed into was unmounted —
     * so only the first character ever survived.
     */
    await waitFor(() => expect(urls.some((url) => url.includes("search=Mona"))).toBe(true));
    expect(screen.getByRole("textbox", { name: "Search activity" })).toHaveValue("Mona");
  });

  it("shows what the range is made of, beside the trail", async () => {
    mockApi({
      entries: [entry],
      availableScopes: ["self"],
      summary: {
        total: 3, failures: 1, people: 1,
        topActors: [{ key: "u1", label: "Mona Adel", count: 3 }],
        topActions: [{ key: "project.update", label: "project.update", count: 2 }],
        topProjects: [{ key: "p1", label: "Cairo Metro", count: 2 }],
        attention: [{ key: "auth.login_failed", label: "auth.login_failed", count: 1 }],
      },
    });
    renderActivity();

    const people = await screen.findByRole("complementary", { name: "Most active" });
    expect(within(people).getByText("Mona Adel")).toBeInTheDocument();
    expect(within(screen.getByRole("complementary", { name: "Busiest projects" })).getByText("Cairo Metro")).toBeInTheDocument();
    // Action keys are rendered as prose, not raw keys.
    expect(within(screen.getByRole("complementary", { name: "Worth a look" })).getByText("Failed sign-in attempt")).toBeInTheDocument();
  });

  it("filters the list from a breakdown row rather than just reporting it", async () => {
    const user = userEvent.setup();
    const urls: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const url = String(input);
      urls.push(url);
      if (url.includes("/v1/activity/actions")) return jsonResponse({ actions: [] });
      return jsonResponse({
        entries: [entry], availableScopes: ["self"],
        summary: {
          total: 3, failures: 0, people: 1,
          topActors: [{ key: "u1", label: "Mona Adel", count: 3 }],
          topActions: [], topProjects: [], attention: [],
        },
      });
    });
    renderActivity();

    const panel = await screen.findByRole("complementary", { name: "Most active" });
    await user.click(within(panel).getByRole("button", { name: /Mona Adel/u }));

    // A panel of numbers you cannot act on is decoration.
    await waitFor(() => expect(urls.some((url) => url.includes("actorUserId=u1"))).toBe(true));
  });

  it("shows the breakdowns the server sent and invents none", async () => {
    // Scoping lives on the server: a member gets a ranking of what they can
    // already reach. The page must not compute its own from the fetched page,
    // which would leak nothing but would disagree with the range.
    mockApi({ entries: [entry], availableScopes: ["self"], summary: emptySummary });
    renderActivity();

    const panel = await screen.findByRole("complementary", { name: "Most active" });
    expect(within(panel).getByText("Nobody has done anything in this range.")).toBeInTheDocument();
  });


  /*
   * The owner could not tell which row the pointer was on. The trail tinted the
   * background and nothing else, and against a surface this close to the canvas
   * that is nearly invisible — while every card and row elsewhere in the
   * product moves a border as well.
   *
   * Asserted against the projects page rather than against a hard-coded pair of
   * properties, so "consistent with the rest of the interface" stays true if
   * the rest of the interface changes, instead of quietly becoming a copy of
   * what it looked like today.
   */
  describe("hover states match the rest of the product", () => {
    function hoverBlock(css: string, selector: string): string {
      const start = css.indexOf(selector);
      return css.slice(start, css.indexOf("}", start));
    }

    it("moves a border and not only the background, on rows and on tallies", () => {
      const reference = hoverBlock(projectsCss, ".rect-project-card:hover");
      expect(reference).toContain("--rect-border-active");
      expect(reference).toContain("--rect-surface-bg-hover");

      for (const selector of [".rect-activity-item:hover", ".rect-tally__row:hover"]) {
        const block = hoverBlock(activityCss, selector);
        expect(block).toContain("--rect-surface-bg-hover");
        expect(block).toContain("--rect-border-active");
      }
    });

    it("reserves the border in the resting state so hovering never shifts a row", () => {
      // Adding a border on hover rather than colouring one already there moves
      // every row by a pixel, and the whole trail twitches under the pointer.
      const resting = hoverBlock(activityCss, ".rect-activity-item {");
      expect(resting).toMatch(/border:\s*1px solid transparent/u);
    });

    it("gives a keyboard reader the same landmark as a pointer", () => {
      expect(activityCss).toMatch(/\.rect-activity-item:focus-visible/u);
      expect(activityCss).toMatch(/\.rect-tally__row:focus-visible/u);
    });
  });
});

describe("the sticky day heading", () => {
  /*
   * The heading repaints its background so entries do not scroll through it.
   * Which background is the whole question: it used to name the canvas
   * directly, and once the trail was given a card of its own that left a
   * lighter strip behind the date — reported by the owner as a weird
   * background. The heading must paint whatever surface it is actually on.
   */
  it("paints the surface it sits on, not a surface it assumes", () => {
    const heading = activityCss.slice(
      activityCss.indexOf(".rect-activity-day__heading"),
      activityCss.indexOf(".rect-activity-day__badge"),
    );
    expect(heading).toMatch(/background:\s*var\(--rect-surface-current\)/u);
    expect(heading).not.toMatch(/background:\s*var\(--rect-canvas-bg\)/u);
  });

  it("is opaque, so entries cannot read through it while scrolling", () => {
    const heading = activityCss.slice(
      activityCss.indexOf(".rect-activity-day__heading"),
      activityCss.indexOf(".rect-activity-day__badge"),
    );
    expect(heading).toMatch(/position:\s*sticky/u);
    expect(heading).toMatch(/background:/u);
  });

  it("declares its own surface on the container, so children can read it", () => {
    // The other half of the contract: a surface that paints a background must
    // say so, or its sticky children have nothing correct to inherit.
    const timeline = activityCss.slice(activityCss.indexOf(".rect-activity-timeline"));
    expect(timeline).toMatch(/--rect-surface-current:\s*var\(--rect-card-bg\)/u);
  });
});
