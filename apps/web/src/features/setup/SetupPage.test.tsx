/** Tests first company setup form submits real setup request. */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AuthProvider } from "@/shared/auth";
import SetupPage from "./SetupPage";

function renderSetup() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}><AuthProvider><SetupPage /></AuthProvider></QueryClientProvider>);
}

describe("SetupPage", () => {
  it("submits first company/admin setup", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.spyOn(globalThis, "fetch");
    fetchMock
      .mockImplementationOnce(() => Promise.resolve(new Response(JSON.stringify({ setupRequired: true }), { status: 200, headers: { "Content-Type": "application/json" } })))
      .mockImplementationOnce(() => Promise.resolve(new Response(JSON.stringify({ error: { code: "UNAUTHENTICATED" } }), { status: 401, headers: { "Content-Type": "application/json" } })))
      .mockImplementationOnce((_input, init) => {
        expect(init?.method).toBe("POST");
        expect(JSON.parse(String(init?.body))).toMatchObject({ companySlug: "rectangle-eg", adminEmail: "owner@rectangle.test" });
        return Promise.resolve(new Response(JSON.stringify({ user: { tenantId: "1", userId: "2", roles: ["tenant_owner"] } }), { status: 201, headers: { "Content-Type": "application/json" } }));
      })
      .mockImplementationOnce(() => Promise.resolve(new Response(JSON.stringify({ setupRequired: false }), { status: 200, headers: { "Content-Type": "application/json" } })))
      .mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ user: { tenantId: "1", userId: "2", roles: ["tenant_owner"] } }), { status: 200, headers: { "Content-Type": "application/json" } })));

    renderSetup();
    await user.type(screen.getByLabelText(/Company name/i), "Rectangle Egypt");
    await user.type(screen.getByLabelText(/Company slug/i), "rectangle-eg");
    await user.type(screen.getByLabelText(/Your name/i), "Owner");
    await user.type(screen.getByLabelText(/Email/i), "owner@rectangle.test");
    await user.type(screen.getByLabelText(/Password/i), "VeryStrongPassword123");
    await user.click(screen.getByRole("button", { name: "Create company" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/v1/setup/first-admin", expect.objectContaining({ method: "POST" })));
  });
});
