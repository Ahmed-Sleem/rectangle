/** Tests login form submits real auth request. */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AuthProvider } from "@/shared/auth";
import { MemoryRouter } from "react-router-dom";
import LoginPage from "./LoginPage";

function renderLogin() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  // The page links to password reset, so it needs a router to render.
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <AuthProvider>
          <LoginPage />
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("LoginPage", () => {
  it("submits email and password credentials", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.spyOn(globalThis, "fetch");
    fetchMock
      .mockImplementationOnce(() => Promise.resolve(new Response(JSON.stringify({ setupRequired: false }), { status: 200, headers: { "Content-Type": "application/json" } })))
      .mockImplementationOnce(() => Promise.resolve(new Response(JSON.stringify({ error: { code: "UNAUTHENTICATED" } }), { status: 401, headers: { "Content-Type": "application/json" } })))
      .mockImplementationOnce((_input, init) => {
        expect(init?.method).toBe("POST");
        expect(JSON.parse(String(init?.body))).toMatchObject({ email: "owner@rectangle.test" });
        expect(JSON.parse(String(init?.body))).not.toHaveProperty("tenantSlug");
        return Promise.resolve(new Response(JSON.stringify({ user: { tenantId: "1", userId: "2", roles: ["tenant_admin"] } }), { status: 200, headers: { "Content-Type": "application/json" } }));
      })
      .mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ user: { tenantId: "1", userId: "2", roles: ["tenant_admin"] } }), { status: 200, headers: { "Content-Type": "application/json" } })));

    renderLogin();
    await user.type(screen.getByLabelText(/Email/i), "owner@rectangle.test");
    await user.type(screen.getByLabelText(/Password/i), "VeryStrongPassword123");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/v1/auth/login", expect.objectContaining({ method: "POST" })));
  });

  it("offers a way to recover a forgotten password", () => {
    renderLogin();
    // Without this the reset flow exists but nobody can reach it.
    expect(screen.getByRole("link", { name: "Forgot your password?" })).toHaveAttribute("href", "/reset");
  });
});
