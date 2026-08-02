/** Tests Settings disclosure behaviour, language choice, and SMTP configuration. */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
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
        <AuthContext.Provider value={{ setupRequired: false, user: { tenantId: "1", userId: "2", roles: ["owner"], permissions: ["settings.manage"] }, loading: false, refresh: async () => undefined }}>
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
      /*
       * The company sections each call their own endpoint. Answering every URL
       * with the email payload made the permission reference render from a
       * response that had no permissions in it, which threw and took the whole
       * page down — so the mock has to be as specific as the code is.
       */
      if (String(input).includes("permission-reference")) {
        return Promise.resolve(new Response(JSON.stringify({ permissions: [], projectRoles: [], standings: [], deletionRule: { requiresProjectAdmin: true, manageAllInsufficient: true } }), { status: 200, headers: { "Content-Type": "application/json" } }));
      }
      if (String(input).includes("separation-rules")) {
        return Promise.resolve(new Response(JSON.stringify({ rules: [] }), { status: 200, headers: { "Content-Type": "application/json" } }));
      }
      return Promise.resolve(new Response(JSON.stringify({ emailSettings: { configured: false, enabled: false, hasPassword: false } }), { status: 200, headers: { "Content-Type": "application/json" } }));
    });
    await setRectangleLanguage("en");
  });

  it("exposes each section as a labelled disclosure with readable state", async () => {
    const user = userEvent.setup();
    renderSettingsPage();

    const language = screen.getByRole("button", { name: /Language/i });
    const email = screen.getByRole("button", { name: /Email delivery/i });

    // Language opens by default; the others stay closed until asked for.
    expect(language).toHaveAttribute("aria-expanded", "true");
    expect(email).toHaveAttribute("aria-expanded", "false");

    // Every trigger controls the panel it owns, so state is never ambiguous.
    expect(language).toHaveAttribute("aria-controls");
    expect(email).toHaveAttribute("aria-controls");

    await user.click(email);
    expect(email).toHaveAttribute("aria-expanded", "true");
    // Opening one section collapses the previous one.
    expect(language).toHaveAttribute("aria-expanded", "false");

    await user.click(email);
    expect(email).toHaveAttribute("aria-expanded", "false");
  });

  it("switches the shell language to Arabic and updates direction", async () => {
    const user = userEvent.setup();
    renderSettingsPage();

    expect(screen.getByRole("button", { name: /Language/i })).toBeInTheDocument();
    expect(document.documentElement).toHaveAttribute("dir", "ltr");

    const group = screen.getByRole("radiogroup", { name: "Interface language" });
    expect(within(group).getByRole("radio", { name: /English/ })).toHaveAttribute("aria-checked", "true");

    await user.click(within(group).getByRole("radio", { name: /Arabic/ }));

    expect(await screen.findByRole("button", { name: /اللغة/ })).toBeInTheDocument();
    expect(document.documentElement).toHaveAttribute("lang", "ar");
    expect(document.documentElement).toHaveAttribute("dir", "rtl");
  });

  it("can switch back to English", async () => {
    const user = userEvent.setup();
    await setRectangleLanguage("ar");
    renderSettingsPage();

    const group = screen.getByRole("radiogroup", { name: "لغة الواجهة" });
    await user.click(within(group).getByRole("radio", { name: /الإنجليزية/ }));

    await waitFor(() => expect(document.documentElement).toHaveAttribute("lang", "en"));
    expect(document.documentElement).toHaveAttribute("dir", "ltr");
  });

});
