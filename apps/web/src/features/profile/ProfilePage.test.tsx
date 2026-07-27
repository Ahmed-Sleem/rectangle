/** Tests the self-service profile: identity, renaming, and password change. */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthContext, type AuthContextValue } from "@/shared/auth";
import { RectangleI18nProvider, setRectangleLanguage } from "@/shared/i18n";
import { ToastProvider } from "@/shared/ui";
import ProfilePage from "./ProfilePage";

const auth: AuthContextValue = {
  setupRequired: false,
  loading: false,
  refresh: async () => undefined,
  user: {
    tenantId: "1",
    userId: "2",
    roles: ["member"],
    permissions: [],
    displayName: "Ahmed Sleem",
    email: "ahmed@rectangle.test",
  },
};

const profile = {
  profile: {
    userId: "2",
    tenantId: "1",
    displayName: "Ahmed Sleem",
    email: "ahmed@rectangle.test",
    status: "active",
    roles: ["member"],
    permissions: [],
    userTypes: [{ id: "t1", name: "Viewer", key: "viewer" }],
    passkeyCount: 2,
    createdAt: "2026-01-15T00:00:00.000Z",
  },
};

function jsonResponse(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }),
  );
}

function renderProfile() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <RectangleI18nProvider>
        <ToastProvider>
          <AuthContext.Provider value={auth}>
            <ProfilePage />
          </AuthContext.Provider>
        </ToastProvider>
      </RectangleI18nProvider>
    </QueryClientProvider>,
  );
}

describe("ProfilePage", () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    await setRectangleLanguage("en");
  });

  it("shows the signed-in person's real identity", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(() => jsonResponse(profile));
    renderProfile();

    expect(await screen.findByText("ahmed@rectangle.test")).toBeInTheDocument();
    expect(screen.getAllByText("Ahmed Sleem").length).toBeGreaterThan(0);
  });

  it("prefills the name rather than asking the person to retype it", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(() => jsonResponse(profile));
    renderProfile();

    await waitFor(() => expect(screen.getByLabelText(/Display name/u)).toHaveValue("Ahmed Sleem"));
  });

  it("does not let the sign-in email be edited here", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(() => jsonResponse(profile));
    renderProfile();

    // Changing it needs a verification flow that does not exist yet, so the
    // field is shown but locked rather than silently accepting a change.
    await waitFor(() => expect(screen.getByLabelText(/Email/u)).toBeDisabled());
  });

  it("saves a new display name", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(() => jsonResponse(profile));
    const user = userEvent.setup();
    renderProfile();

    const field = await screen.findByLabelText(/Display name/u);
    await user.clear(field);
    await user.type(field, "Ahmed M. Sleem");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/v1/profile", expect.objectContaining({ method: "PATCH" })),
    );
  });

  it("refuses to submit when the two new passwords differ", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(() => jsonResponse(profile));
    const user = userEvent.setup();
    renderProfile();

    await user.click(await screen.findByRole("button", { name: /^Password/u }));
    const form = screen.getByRole("button", { name: "Change password" }).closest("form")!;
    await user.type(within(form).getByLabelText(/Current password/u), "CurrentPassword123");
    await user.type(within(form).getByLabelText(/^New password/u), "BrandNewPassword123");
    await user.type(within(form).getByLabelText(/Confirm new password/u), "DifferentPassword123");
    await user.click(screen.getByRole("button", { name: "Change password" }));

    expect(await screen.findByText("Both new passwords must match.")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalledWith("/v1/profile/password", expect.anything());
  });

  it("tells the person when other sessions were signed out", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
      if (String(input).includes("/password")) return jsonResponse({ revokedSessions: 2 });
      if (init?.method === "PATCH") return jsonResponse(profile);
      return jsonResponse(profile);
    });
    const user = userEvent.setup();
    renderProfile();

    await user.click(await screen.findByRole("button", { name: /^Password/u }));
    const form = screen.getByRole("button", { name: "Change password" }).closest("form")!;
    await user.type(within(form).getByLabelText(/Current password/u), "CurrentPassword123");
    await user.type(within(form).getByLabelText(/^New password/u), "BrandNewPassword123");
    await user.type(within(form).getByLabelText(/Confirm new password/u), "BrandNewPassword123");
    await user.click(screen.getByRole("button", { name: "Change password" }));

    expect(
      await screen.findByText("Your password has been changed. 2 other sessions were signed out."),
    ).toBeInTheDocument();
  });

  it("reports a failed load instead of an empty profile", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(() =>
      jsonResponse({ error: { code: "INTERNAL", message: "boom" } }, 500),
    );
    renderProfile();

    expect(await screen.findByText("Your profile could not be loaded")).toBeInTheDocument();
  });

  it("renders in Arabic when Arabic is active", async () => {
    await setRectangleLanguage("ar");
    vi.spyOn(globalThis, "fetch").mockImplementation(() => jsonResponse(profile));
    renderProfile();

    expect(await screen.findByText("الهوية")).toBeInTheDocument();
  });

  it("offers a way to move the account to a different address", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      if (String(input).includes("/v1/profile/email")) return jsonResponse({ requested: true });
      return jsonResponse(profile);
    });
    const user = userEvent.setup();
    renderProfile();

    await user.click(await screen.findByRole("button", { name: /Sign-in email/u }));
    const form = screen.getByRole("button", { name: "Send confirmation" }).closest("form")!;
    await user.type(within(form).getByLabelText(/New email address/u), "ahmed.new@rectangle.test");
    await user.type(within(form).getByLabelText(/Current password/u), "CurrentPassword123");
    await user.click(screen.getByRole("button", { name: "Send confirmation" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/v1/profile/email", expect.objectContaining({ method: "POST" })),
    );
    // Nothing has changed yet: the address moves only once the link is used.
    expect(await screen.findByText("Confirmation sent.")).toBeInTheDocument();
  });
});
