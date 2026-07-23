/** Tests the real Projects register and create action UI. */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ProjectsPage from "./ProjectsPage";

function renderProjectsPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ProjectsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function jsonResponse(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));
}

describe("ProjectsPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
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

    expect(await screen.findByRole("link", { name: "Cairo Metro Extension" })).toBeInTheDocument();
    expect(screen.getByText("CME-01")).toBeInTheDocument();
    expect(screen.getByText("active")).toBeInTheDocument();
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
    await user.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
  });
});
