/** Tests Settings language and SMTP configuration UI. */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, beforeEach, vi } from "vitest";
import { AuthContext } from "@/shared/auth";
import { RectangleI18nProvider, setRectangleLanguage } from "@/shared/i18n";
import SettingsPage from "./SettingsPage";

function renderSettingsPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <RectangleI18nProvider>
        <AuthContext.Provider value={{ setupRequired: false, user: { tenantId: "1", userId: "2", roles: ["tenant_admin"], permissions: ["settings.manage"] }, loading: false, refresh: async () => undefined }}>
          <SettingsPage />
        </AuthContext.Provider>
      </RectangleI18nProvider>
    </QueryClientProvider>,
  );
}

describe("SettingsPage", () => {
  beforeEach(async () => {
    window.localStorage.clear();
    vi.restoreAllMocks();
    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      if (String(input).includes("passkeys")) return Promise.resolve(new Response(JSON.stringify({ passkeys: [] }), { status: 200, headers: { "Content-Type": "application/json" } }));
      return Promise.resolve(new Response(JSON.stringify({ emailSettings: { configured: false, enabled: false, hasPassword: false } }), { status: 200, headers: { "Content-Type": "application/json" } }));
    });
    await setRectangleLanguage("en");
  });

  it("switches the shell language to Arabic and updates direction", async () => {
    const user = userEvent.setup();
    renderSettingsPage();

    expect(screen.getByRole("heading", { name: "Language" })).toBeInTheDocument();
    expect(screen.getByText(/Current language: English/i)).toBeInTheDocument();
    expect(document.documentElement).toHaveAttribute("dir", "ltr");

    await user.click(screen.getByRole("button", { name: "Arabic" }));

    expect(await screen.findByRole("heading", { name: "اللغة" })).toBeInTheDocument();
    expect(document.documentElement).toHaveAttribute("lang", "ar");
    expect(document.documentElement).toHaveAttribute("dir", "rtl");
    expect(screen.getByText(/اللغة الحالية/)).toBeInTheDocument();
  });

  it("can switch back to English", async () => {
    const user = userEvent.setup();
    await setRectangleLanguage("ar");
    renderSettingsPage();

    await user.click(screen.getByRole("button", { name: "الإنجليزية" }));

    await waitFor(() => expect(screen.getByRole("heading", { name: "Language" })).toBeInTheDocument());
    expect(document.documentElement).toHaveAttribute("lang", "en");
    expect(document.documentElement).toHaveAttribute("dir", "ltr");
  });

  it("saves SMTP settings", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.spyOn(globalThis, "fetch");
    fetchMock.mockImplementation((input, init) => {
      const url = String(input);
      if (url.includes("passkeys")) return Promise.resolve(new Response(JSON.stringify({ passkeys: [] }), { status: 200, headers: { "Content-Type": "application/json" } }));
      if (init?.method === "PUT") {
        expect(JSON.parse(String(init.body))).toMatchObject({ host: "smtp.office365.com", port: 587, username: "mailer@example.com" });
        return Promise.resolve(new Response(JSON.stringify({ emailSettings: { configured: true, enabled: true, hasPassword: true } }), { status: 200, headers: { "Content-Type": "application/json" } }));
      }
      return Promise.resolve(new Response(JSON.stringify({ emailSettings: { configured: false, enabled: false, hasPassword: false } }), { status: 200, headers: { "Content-Type": "application/json" } }));
    });

    renderSettingsPage();
    await user.click(screen.getByRole("heading", { name: "Email delivery" }));
    await user.type(screen.getByLabelText("SMTP host"), "smtp.office365.com");
    await user.clear(screen.getByLabelText("Port"));
    await user.type(screen.getByLabelText("Port"), "587");
    await user.type(screen.getByLabelText("Username"), "mailer@example.com");
    await user.type(screen.getByLabelText("Password"), "smtp-password");
    await user.type(screen.getByLabelText("From email"), "mailer@example.com");
    await user.clear(screen.getByLabelText("From name"));
    await user.type(screen.getByLabelText("From name"), "Rectangle");
    await user.click(screen.getByRole("button", { name: "Save email settings" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/v1/settings/email", expect.objectContaining({ method: "PUT" })));
  });
});
