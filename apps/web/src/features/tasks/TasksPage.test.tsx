/** Tests the task board, list, filters, and permission gating. */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthContext, type AuthContextValue } from "@/shared/auth";
import { RectangleI18nProvider, setRectangleLanguage } from "@/shared/i18n";
import TasksPage from "./TasksPage";

const managerAuth: AuthContextValue = {
  setupRequired: false,
  loading: false,
  refresh: async () => undefined,
  user: { tenantId: "1", userId: "user-1", roles: ["tenant_admin"], permissions: [] },
};

const viewerAuth: AuthContextValue = {
  ...managerAuth,
  user: { tenantId: "1", userId: "user-2", roles: ["viewer"], permissions: [] },
};

function jsonResponse(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }),
  );
}

function renderTasks(auth: AuthContextValue = managerAuth, route = "/tasks") {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <RectangleI18nProvider>
        <AuthContext.Provider value={auth}>
          <MemoryRouter initialEntries={[route]}>
            <TasksPage />
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

/** Yesterday and next week, so overdue and due-soon are real rather than fixed. */
function offsetDate(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

const tasks = {
  tasks: [
    {
      id: "t1", projectId: "p1", projectName: "New Cairo Tower", projectCode: "NCT-01",
      title: "Pour raft foundation", status: "in_progress", priority: "urgent",
      assigneeUserId: "user-1", assigneeName: "Ahmed Sleem",
      dueDate: offsetDate(-2), commentCount: 2, createdAt: "", updatedAt: "",
    },
    {
      id: "t2", projectId: "p1", projectName: "New Cairo Tower", projectCode: "NCT-01",
      title: "Survey the boundary", status: "todo", priority: "low",
      dueDate: offsetDate(3), commentCount: 0, createdAt: "", updatedAt: "",
    },
    {
      id: "t3", projectId: "p1", projectName: "New Cairo Tower", projectCode: "NCT-01",
      title: "Sign off drawings", status: "done", priority: "medium",
      commentCount: 0, createdAt: "", updatedAt: "",
    },
  ],
};

function mockReads() {
  return vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
    const url = String(input);
    if (url.includes("/comments")) return jsonResponse({ comments: [] });
    if (url.includes("/members")) return jsonResponse({ members: [] });
    if (url.includes("/v1/projects")) return jsonResponse(projects);
    return jsonResponse(tasks);
  });
}

describe("TasksPage", () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    await setRectangleLanguage("en");
    window.localStorage.clear();
  });

  it("groups tasks into board columns by status", async () => {
    mockReads();
    renderTasks();

    const inProgress = await screen.findByRole("region", { name: "In progress" });
    expect(within(inProgress).getByText("Pour raft foundation")).toBeInTheDocument();

    const todo = screen.getByRole("region", { name: "To do" });
    expect(within(todo).getByText("Survey the boundary")).toBeInTheDocument();
  });

  it("counts overdue work only while it is still open", async () => {
    mockReads();
    renderTasks();

    await screen.findByText("Pour raft foundation");
    const summary = screen.getByRole("group", { name: "Tasks" });
    // One task is past its due date; the completed one has no due date at all.
    expect(within(summary).getByText("Overdue").parentElement).toHaveTextContent("1");
  });

  it("shows the same records in the list view", async () => {
    const user = userEvent.setup();
    mockReads();
    renderTasks();

    await screen.findByText("Pour raft foundation");
    await user.click(screen.getByRole("radio", { name: "List view" }));

    const table = await screen.findByRole("table");
    expect(within(table).getByText("Pour raft foundation")).toBeInTheDocument();
    expect(within(table).getByText("Survey the boundary")).toBeInTheDocument();
    expect(within(table).getByText("Sign off drawings")).toBeInTheDocument();
  });

  it("asks the backend to filter rather than filtering in the page", async () => {
    const user = userEvent.setup();
    const fetchMock = mockReads();
    renderTasks();

    await screen.findByText("Pour raft foundation");
    await user.click(screen.getByRole("checkbox", { name: "My tasks" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("mine=true"), expect.anything()),
    );
  });

  it("opens a task and offers only the moves the workflow allows", async () => {
    const user = userEvent.setup();
    mockReads();
    renderTasks();

    await user.click(await screen.findByText("Survey the boundary"));

    const dialog = await screen.findByRole("dialog", { name: /Survey the boundary/u });
    // From "to do" work can start, block, or be cancelled — but not be reviewed.
    expect(within(dialog).getByRole("button", { name: "In progress" })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Blocked" })).toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: "In review" })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: "Done" })).not.toBeInTheDocument();
  });

  it("sends the status change when a move is chosen", async () => {
    const user = userEvent.setup();
    const fetchMock = mockReads();
    renderTasks();

    await user.click(await screen.findByText("Survey the boundary"));
    const dialog = await screen.findByRole("dialog", { name: /Survey the boundary/u });
    await user.click(within(dialog).getByRole("button", { name: "In progress" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/v1/tasks/t2", expect.objectContaining({ method: "PATCH" })),
    );
  });

  it("hides creation and deletion from someone who cannot manage projects", async () => {
    const user = userEvent.setup();
    mockReads();
    renderTasks(viewerAuth);

    await screen.findByText("Pour raft foundation");
    expect(screen.queryByRole("button", { name: "Create task" })).not.toBeInTheDocument();

    await user.click(screen.getByText("Survey the boundary"));
    const dialog = await screen.findByRole("dialog", { name: /Survey the boundary/u });
    expect(within(dialog).queryByRole("button", { name: "Delete task" })).not.toBeInTheDocument();
  });

  it("reports a failed load instead of showing an empty board", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      if (String(input).includes("/v1/projects")) return jsonResponse(projects);
      return jsonResponse({ error: { code: "INTERNAL", message: "boom" } }, 500);
    });
    renderTasks();

    expect(await screen.findByText("Tasks could not be loaded")).toBeInTheDocument();
    expect(screen.queryByText("No tasks yet")).not.toBeInTheDocument();
  });

  it("directs the user to projects when there are none to attach work to", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      if (String(input).includes("/v1/projects")) return jsonResponse({ projects: [] });
      return jsonResponse({ tasks: [] });
    });
    renderTasks();

    expect(await screen.findByText("No projects yet")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to projects" })).toHaveAttribute("href", "/projects");
  });

  it("renders in Arabic when Arabic is active", async () => {
    await setRectangleLanguage("ar");
    mockReads();
    renderTasks();

    expect(await screen.findByText("Pour raft foundation")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "قيد التنفيذ" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "للتنفيذ" })).toBeInTheDocument();
  });

  it("pre-selects the project when arriving from a project workspace", async () => {
    const fetchMock = mockReads();
    renderTasks(managerAuth, "/tasks?projectId=p1");

    // The link from a project must land on that project's board, not the
    // whole portfolio.
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("projectId=p1"), expect.anything()),
    );
  });
});
