/** Tests the invitation and reset pages people reach from an email link. */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RectangleI18nProvider } from "@/shared/i18n";
import AcceptInvitationPage from "./AcceptInvitationPage";
import PasswordResetPage from "./PasswordResetPage";

function jsonResponse(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }),
  );
}

function renderAt(element: React.ReactElement, route: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <RectangleI18nProvider>
        <MemoryRouter initialEntries={[route]}>
          <Routes>
            <Route path="/invite/accept" element={element} />
            <Route path="/reset" element={element} />
            <Route path="/login" element={<span>sign in page</span>} />
          </Routes>
        </MemoryRouter>
      </RectangleI18nProvider>
    </QueryClientProvider>,
  );
}

const invitation = {
  invitation: { email: "new@rectangle.test", displayName: "New Person", companyName: "Cairo Build Co" },
};

describe("AcceptInvitationPage", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("names the company and address so the link can be trusted", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(() => jsonResponse(invitation));
    renderAt(<AcceptInvitationPage />, "/invite/accept?token=abcdefghijklmnopqrstuvwxyz");

    expect(await screen.findByText("Cairo Build Co")).toBeInTheDocument();
    expect(screen.getByText(/new@rectangle.test/u)).toBeInTheDocument();
  });

  it("explains an expired link instead of showing an empty form", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(() =>
      jsonResponse({ error: { code: "VALIDATION_FAILED", message: "This link is no longer valid." } }, 400),
    );
    renderAt(<AcceptInvitationPage />, "/invite/accept?token=abcdefghijklmnopqrstuvwxyz");

    expect(await screen.findByText("Invitation unavailable")).toBeInTheDocument();
  });

  it("refuses a link with no token at all", () => {
    renderAt(<AcceptInvitationPage />, "/invite/accept");
    expect(screen.getByText("Invitation unavailable")).toBeInTheDocument();
  });

  it("will not submit mismatched passwords", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(() => jsonResponse(invitation));
    const user = userEvent.setup();
    renderAt(<AcceptInvitationPage />, "/invite/accept?token=abcdefghijklmnopqrstuvwxyz");

    await screen.findByText("Cairo Build Co");
    await user.type(screen.getByLabelText(/Your name/u), "New Person");
    await user.type(screen.getByLabelText(/^Password/u), "BrandNewPassword123");
    await user.type(screen.getByLabelText(/Confirm password/u), "DifferentPassword123");
    await user.click(screen.getByRole("button", { name: "Activate account" }));

    expect(await screen.findByText("Both passwords must match.")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalledWith("/v1/auth/invitation/accept", expect.anything());
  });
});

describe("PasswordResetPage", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("gives the same answer whether or not the address is known", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(() => jsonResponse({ requested: true }));
    const user = userEvent.setup();
    renderAt(<PasswordResetPage />, "/reset");

    await user.type(screen.getByLabelText(/Company/u), "cairo");
    await user.type(screen.getByLabelText(/Email/u), "nobody@rectangle.test");
    await user.click(screen.getByRole("button", { name: "Send reset link" }));

    // Confirming an address exists would make this a staff directory.
    expect(await screen.findByText("Check your email")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByText(/If that address belongs to an active account/u)).toBeInTheDocument(),
    );
  });
});
