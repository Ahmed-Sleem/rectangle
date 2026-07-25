/**
 * The project workspace is the hub for team, stakeholders, and history, so its
 * wiring to the backend and its permission behaviour are pinned here.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RectangleI18nProvider } from "@/shared/i18n";
import ProjectDetailPage from "./ProjectDetailPage";

const projectId = "33333333-3333-4333-8333-333333333333";
const teammateId = "44444444-4444-4444-8444-444444444444";

const project = {
  id: projectId,
  tenantId: "1",
  name: "Cairo Metro Extension",
  code: "CME-01",
  status: "active",
  locationName: "Cairo",
  createdAt: "2026-07-25T10:00:00.000Z",
  updatedAt: "2026-07-25T10:00:00.000Z",
};

function json(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }),
  );
}

interface RouteState {
  canManage: boolean;
  members: Array<Record<string, unknown>>;
  stakeholders: Array<Record<string, unknown>>;
  activity: Array<Record<string, unknown>>;
  projectStatus?: number;
}

function mockApi(state: RouteState) {
  const calls: Array<{ url: string; method: string; body?: unknown }> = [];

  vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    calls.push({ url, method, ...(init?.body ? { body: JSON.parse(String(init.body)) } : {}) });

    if (url.endsWith("/access")) return json({ access: { canRead: true, canManage: state.canManage } });
    if (url.endsWith("/members") && method === "GET") return json({ members: state.members });
    if (url.endsWith("/members") && method === "POST") {
      return json({ member: { projectId, userId: teammateId, role: "viewer", displayName: "Mona Adel", email: "mona@example.com", createdAt: "", updatedAt: "" } }, 201);
    }
    if (url.includes("/members/") && method === "DELETE") return Promise.resolve(new Response(null, { status: 204 }));
    if (method === "DELETE" && url.endsWith(projectId)) return Promise.resolve(new Response(null, { status: 204 }));
    if (url.includes("/members/") && method === "PATCH") return json({ member: { ...state.members[0], role: "controls_manager" } });
    if (url.endsWith("/stakeholders") && method === "GET") return json({ stakeholders: state.stakeholders });
    if (url.endsWith("/stakeholders") && method === "POST") return json({ stakeholder: { id: "s1", projectId, name: "Authority", category: "authority", influence: "high", interest: "high", createdAt: "", updatedAt: "" } }, 201);
    if (url.endsWith("/activity")) return json({ activity: state.activity });
    if (url.includes("/v1/admin/users")) {
      return json({ users: [{ id: teammateId, email: "mona@example.com", displayName: "Mona Adel", status: "active", userTypes: [] }] });
    }
    if (url.includes(projectId)) {
      if (state.projectStatus && state.projectStatus !== 200) {
        return json({ error: { code: "NOT_FOUND", message: "Project was not found." } }, state.projectStatus);
      }
      return json({ project });
    }
    return json({});
  });

  return calls;
}

function renderWorkspace() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <RectangleI18nProvider>
        <MemoryRouter initialEntries={[`/projects/${projectId}`]}>
          <Routes>
            <Route path="/projects/:projectId" element={<ProjectDetailPage />} />
          </Routes>
        </MemoryRouter>
      </RectangleI18nProvider>
    </QueryClientProvider>,
  );
}

const baseState: RouteState = { canManage: true, members: [], stakeholders: [], activity: [] };

describe("ProjectDetailPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("shows real project data with team, stakeholder, and activity panels", async () => {
    mockApi({
      ...baseState,
      members: [{ projectId, userId: teammateId, role: "project_manager", displayName: "Mona Adel", email: "mona@example.com", createdAt: "", updatedAt: "" }],
      stakeholders: [{ id: "s1", projectId, name: "الهيئة القومية للأنفاق", category: "authority", influence: "high", interest: "high", createdAt: "", updatedAt: "" }],
      activity: [{ id: "a1", action: "project.create", entityType: "project", entityId: projectId, result: "success", actorName: "Site Owner", metadata: {}, createdAt: "2026-07-25T10:00:00.000Z" }],
    });

    renderWorkspace();

    expect(await screen.findByRole("heading", { name: "Cairo Metro Extension" })).toBeInTheDocument();
    expect(await screen.findByText("Mona Adel")).toBeInTheDocument();
    // Arabic stakeholder names must render exactly as entered.
    expect(await screen.findByText("الهيئة القومية للأنفاق")).toBeInTheDocument();
    // Audit actions are shown as sentences, never as raw keys.
    expect(await screen.findByText("Created the project")).toBeInTheDocument();
    expect(screen.queryByText("project.create")).not.toBeInTheDocument();
  });

  it("adds a team member through the real endpoint", async () => {
    const user = userEvent.setup();
    const calls = mockApi(baseState);

    renderWorkspace();
    await user.click(await screen.findByRole("button", { name: "Add member" }));

    const dialog = await screen.findByRole("dialog", { name: "Add team member" });
    await user.selectOptions(within(dialog).getByLabelText("Person"), teammateId);
    await user.selectOptions(within(dialog).getByLabelText("Role"), "viewer");
    await user.click(within(dialog).getByRole("button", { name: "Add member" }));

    await waitFor(() => {
      const post = calls.find((call) => call.method === "POST" && call.url.endsWith("/members"));
      expect(post?.body).toMatchObject({ userId: teammateId, role: "viewer" });
    });
  });

  it("confirms before removing a member and calls the delete endpoint", async () => {
    const user = userEvent.setup();
    const calls = mockApi({
      ...baseState,
      members: [{ projectId, userId: teammateId, role: "viewer", displayName: "Mona Adel", email: "mona@example.com", createdAt: "", updatedAt: "" }],
    });

    renderWorkspace();
    await user.click(await screen.findByRole("button", { name: "Remove" }));

    const dialog = await screen.findByRole("dialog", { name: "Remove team member" });
    expect(within(dialog).getByText(/Mona Adel will lose access/)).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "Remove" }));

    await waitFor(() => {
      expect(calls.some((call) => call.method === "DELETE" && call.url.includes(`/members/${teammateId}`))).toBe(true);
    });
  });

  it("saves project edits through the update endpoint", async () => {
    const user = userEvent.setup();
    const calls = mockApi(baseState);

    renderWorkspace();
    await user.click(await screen.findByRole("button", { name: "Edit project" }));

    const dialog = await screen.findByRole("dialog", { name: "Edit project" });
    const nameField = within(dialog).getByLabelText("Project name");
    await user.clear(nameField);
    await user.type(nameField, "Cairo Metro Phase 2");
    await user.click(within(dialog).getByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      const patch = calls.find((call) => call.method === "PATCH" && call.url.endsWith(projectId));
      expect(patch?.body).toMatchObject({ name: "Cairo Metro Phase 2" });
    });
  });

  it("hides every management action from a read-only member", async () => {
    mockApi({
      ...baseState,
      canManage: false,
      members: [{ projectId, userId: teammateId, role: "viewer", displayName: "Mona Adel", email: "mona@example.com", createdAt: "", updatedAt: "" }],
    });

    renderWorkspace();
    await screen.findByRole("heading", { name: "Cairo Metro Extension" });

    // Actions that would be rejected by the API must not be offered at all.
    expect(screen.queryByRole("button", { name: "Edit project" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add member" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add stakeholder" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remove" })).not.toBeInTheDocument();
    // The role is still readable, just not editable.
    expect(await screen.findByText("Viewer")).toBeInTheDocument();
  });

  it("explains an inaccessible project without exposing internals", async () => {
    mockApi({ ...baseState, projectStatus: 404 });

    renderWorkspace();

    expect(await screen.findByText("Project not available")).toBeInTheDocument();
    expect(
      screen.getByText("This project either does not exist or you do not have access to it."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/NOT_FOUND/)).not.toBeInTheDocument();
  });

  it("offers lifecycle moves and archives through the real update endpoint", async () => {
    const user = userEvent.setup();
    const calls = mockApi(baseState);

    renderWorkspace();
    const lifecycle = await screen.findByLabelText("Manage project");

    // Only moves that change something are offered.
    expect(within(lifecycle).queryByRole("option", { name: "Mark as active" })).toBeNull();
    expect(within(lifecycle).getByRole("option", { name: "Archive" })).toBeInTheDocument();

    await user.selectOptions(lifecycle, "archived");

    await waitFor(() => {
      const patch = calls.find((call) => call.method === "PATCH");
      expect(patch?.body).toMatchObject({ status: "archived" });
    });
  });

  it("names the project and warns that deletion cannot be undone", async () => {
    const user = userEvent.setup();
    const calls = mockApi(baseState);

    renderWorkspace();
    await user.selectOptions(await screen.findByLabelText("Manage project"), "delete");

    const dialog = await screen.findByRole("dialog", { name: "Delete this project?" });
    // Confirmation must name the object and state the consequence.
    expect(within(dialog).getByText(/Cairo Metro Extension/)).toBeInTheDocument();
    expect(within(dialog).getByText(/cannot be undone/i)).toBeInTheDocument();
    expect(within(dialog).getByText(/Archive it instead/i)).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "Delete project" }));

    await waitFor(() => {
      expect(calls.some((call) => call.method === "DELETE" && call.url.endsWith(projectId))).toBe(true);
    });
  });

  it("hides lifecycle actions from someone who cannot manage the project", async () => {
    mockApi({ ...baseState, canManage: false });

    renderWorkspace();
    await screen.findByRole("heading", { name: "Cairo Metro Extension" });

    expect(screen.queryByLabelText("Manage project")).not.toBeInTheDocument();
  });
});
