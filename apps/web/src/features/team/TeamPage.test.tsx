/** Tests tenant team admin pages for real user types and users. */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";
import TeamPage from "./TeamPage";

function jsonResponse(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));
}

function renderTeam() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}><TeamPage /></QueryClientProvider>);
}

const permissions = { permissions: [
  { key: "projects.read", label: "View projects", description: "Open projects." },
  { key: "users.manage", label: "Manage users", description: "Create users." },
] };
const userTypes = { userTypes: [{ id: "11111111-1111-4111-8111-111111111111", name: "Owner", key: "owner", permissions: ["projects.read", "users.manage"], systemType: true }] };
const users = { users: [{ id: "22222222-2222-4222-8222-222222222222", displayName: "Owner", email: "owner@rectangle.test", status: "active", userTypes: [{ id: "11111111-1111-4111-8111-111111111111", name: "Owner", key: "owner" }] }] };

describe("TeamPage", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("renders user types and users from API", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const url = String(input);
      if (url.includes("permissions")) return jsonResponse(permissions);
      if (url.includes("user-types")) return jsonResponse(userTypes);
      return jsonResponse(users);
    });
    renderTeam();
    expect((await screen.findAllByText("Owner")).length).toBeGreaterThan(0);
    expect(screen.getByText("owner@rectangle.test")).toBeInTheDocument();
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
    await user.click(await screen.findByRole("button", { name: "Create user type" }));
    await user.type(screen.getByLabelText("Name"), "Cost Controller");
    await user.type(screen.getByLabelText("Key"), "cost_controller");
    await user.click(screen.getByRole("checkbox", { name: /View projects/i }));
    await user.click(screen.getByRole("button", { name: "Create" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/v1/admin/user-types", expect.objectContaining({ method: "POST" })));
  });
});
