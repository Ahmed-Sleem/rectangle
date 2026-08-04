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
      /*
       * Before the separation-rules branch, and before the catch-all: the
       * summary on the closed headers reads both endpoints, and a mock that
       * answered this one with an email payload would make the count silently
       * absent rather than wrong — which looks like the feature not working.
       */
      if (String(input).includes("/permissions")) {
        return Promise.resolve(new Response(JSON.stringify({ permissions: [{ key: "projects.read", label: "View projects", group: "projects" }, { key: "tasks.read", label: "View tasks", group: "tasks" }] }), { status: 200, headers: { "Content-Type": "application/json" } }));
      }
      if (String(input).includes("separation-rules")) {
        return Promise.resolve(new Response(JSON.stringify({ rules: [] }), { status: 200, headers: { "Content-Type": "application/json" } }));
      }
      return Promise.resolve(new Response(JSON.stringify({ emailSettings: { configured: false, enabled: false, hasPassword: false } }), { status: 200, headers: { "Content-Type": "application/json" } }));
    });
    await setRectangleLanguage("en");
  });

  /*
   * Both sections are audit artefacts — a permission matrix and a duties matrix
   * are what an auditor is shown — so they are consulted at a review rather
   * than read day to day. They were already collapsed, so length was never the
   * fault; the fault was that a closed header said nothing at all. The count
   * answers what most visits are actually asking without opening anything.
   */
  it("says how much is inside the access sections before they are opened", async () => {
    renderSettingsPage();

    // The section header, not every button whose label contains the word.
    const permissions = await screen.findByRole("button", { name: /^Permissions/ });
    await waitFor(() => expect(permissions).toHaveTextContent("2 permissions"));
    // Still closed: the summary is instead of opening it, not as well as.
    expect(permissions).toHaveAttribute("aria-expanded", "false");

    const separation = screen.getByRole("button", { name: /^Separation of duties/ });
    expect(separation).toHaveTextContent("No rules");
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
