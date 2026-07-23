/** Tests login form submits real auth request. */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AuthProvider } from "@/shared/auth";
import LoginPage from "./LoginPage";

function renderLogin() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}><AuthProvider><LoginPage /></AuthProvider></QueryClientProvider>);
}

describe("LoginPage", () => {
  it("submits login credentials", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.spyOn(globalThis, "fetch");
    fetchMock
      .mockImplementationOnce(() => Promise.resolve(new Response(JSON.stringify({ setupRequired: false }), { status: 200, headers: { "Content-Type": "application/json" } })))
      .mockImplementationOnce(() => Promise.resolve(new Response(JSON.stringify({ error: { code: "UNAUTHENTICATED" } }), { status: 401, headers: { "Content-Type": "application/json" } })))
      .mockImplementationOnce((_input, init) => {
        expect(init?.method).toBe("POST");
        expect(JSON.parse(String(init?.body))).toMatchObject({ tenantSlug: "rectangle-eg", email: "owner@rectangle.test" });
        return Promise.resolve(new Response(JSON.stringify({ user: { tenantId: "1", userId: "2", roles: ["tenant_admin"] } }), { status: 200, headers: { "Content-Type": "application/json" } }));
      })
      .mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ user: { tenantId: "1", userId: "2", roles: ["tenant_admin"] } }), { status: 200, headers: { "Content-Type": "application/json" } })));

    renderLogin();
    await user.type(screen.getByLabelText(/Company slug/i), "rectangle-eg");
    await user.type(screen.getByLabelText(/Email/i), "owner@rectangle.test");
    await user.type(screen.getByLabelText(/Password/i), "VeryStrongPassword123");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/v1/auth/login", expect.objectContaining({ method: "POST" })));
  });
});
