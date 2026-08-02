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

/** One JSON reply, so each mock reads as a list of routes rather than plumbing. */
function jsonResponse(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }),
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
    await user.click(screen.getByRole("button", { name: /Email delivery/i }));
    await user.type(screen.getByLabelText("Server address"), "smtp.office365.com");
    await user.clear(screen.getByLabelText("Port"));
    await user.type(screen.getByLabelText("Port"), "587");
    await user.type(screen.getByLabelText("Username"), "mailer@example.com");
    await user.type(screen.getByLabelText("Password"), "smtp-password");
    await user.type(screen.getByLabelText("From address"), "mailer@example.com");
    await user.clear(screen.getByLabelText("From name"));
    await user.type(screen.getByLabelText("From name"), "Rectangle");
    await user.click(screen.getByRole("button", { name: "Save email settings" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/v1/settings/email", expect.objectContaining({ method: "PUT" })));
  });

  it("keeps the test-email action unavailable until the server is configured", async () => {
    const user = userEvent.setup();
    renderSettingsPage();

    await user.click(screen.getByRole("button", { name: /Email delivery/i }));

    // Sending a test before saving credentials would fail, so the action is disabled
    // and the reason is stated in plain language instead of failing silently.
    expect(screen.getByRole("button", { name: "Send test" })).toBeDisabled();
    expect(screen.getByText("Save your mail server details before sending a test.")).toBeInTheDocument();
  });

  it("sends a test to the address given, without re-validating the whole form", async () => {
    /*
     * The test form ran `emailForm.handleSubmit`, which validates every field
     * on the page. A company whose mail server is already saved has those
     * fields populated from the server, but a person who clears one — or whose
     * saved record predates a stricter rule — could type a perfectly good
     * address and have nothing happen at all, with the failure reported on a
     * field they were not editing. Sending a test is its own action and
     * validates only its own input.
     */
    const user = userEvent.setup();
    const posted: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
      const url = String(input);
      if (url.includes("passkeys")) return jsonResponse({ passkeys: [] });
      if (url.includes("permission-reference")) {
        return jsonResponse({ permissions: [], projectRoles: [], standings: [], deletionRule: { requiresProjectAdmin: true, manageAllInsufficient: true } });
      }
      if (url.includes("separation-rules")) return jsonResponse({ rules: [] });
      if (url.includes("/test")) {
        posted.push(String(init?.body));
        return jsonResponse({ ok: true });
      }
      return jsonResponse({
        emailSettings: {
          configured: true, enabled: true, hasPassword: true,
          // Saved record with a host the current rules would reject.
          host: "x", port: 587, secure: false, username: "mailer",
          fromEmail: "no-reply@rectangle.test", fromName: "Rectangle",
        },
      });
    });

    renderSettingsPage();
    await user.click(screen.getByRole("button", { name: /Email delivery/i }));

    const recipient = await screen.findByLabelText("Send to");
    await user.type(recipient, "site@rectangle.test");
    await user.click(screen.getByRole("button", { name: "Send test" }));

    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0]).toContain("site@rectangle.test");
  });
});

describe("the email section's arrangement", () => {
  /** Bodies sent to the save endpoint, so a rearrangement cannot drop a field. */
  let saved: string[] = [];

  beforeEach(async () => {
    saved = [];
    window.localStorage.clear();
    vi.restoreAllMocks();
    vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
      const url = String(input);
      if (url.includes("/v1/settings/email") && init?.method === "PUT") {
        saved.push(String(init.body));
        return jsonResponse({
          emailSettings: { configured: true, enabled: true, hasPassword: true },
        });
      }
      if (url.includes("passkeys")) return jsonResponse({ passkeys: [] });
      if (url.includes("permission-reference")) {
        return jsonResponse({
          permissions: [],
          projectRoles: [],
          standings: [],
          deletionRule: { requiresProjectAdmin: true, manageAllInsufficient: true },
        });
      }
      if (url.includes("separation-rules")) return jsonResponse({ rules: [] });
      return jsonResponse({
        emailSettings: { configured: false, enabled: false, hasPassword: false },
      });
    });
    await setRectangleLanguage("en");
  });

  async function openEmail() {
    const user = userEvent.setup();
    renderSettingsPage();
    await user.click(await screen.findByRole("button", { name: /Email delivery/u }));
    return user;
  }

  it("turns sending on with a switch, not a checkbox", async () => {
    /*
     * This enables a capability for the whole company. A checkbox reads as one
     * of several choices inside the form beneath it; a switch reads as the
     * thing being turned on, which is what it is.
     */
    await openEmail();

    const control = await screen.findByRole("switch", { name: "Send email from Rectangle" });
    expect(control).toBeInTheDocument();
    expect(
      screen.queryByRole("checkbox", { name: "Send email from Rectangle" }),
    ).not.toBeInTheDocument();
  });

  it("keeps the secure-connection choice with the server it describes", async () => {
    /*
     * It qualifies the address and port, not the credentials. Sitting after the
     * password it read as a property of the password.
     */
    await openEmail();

    const secure = await screen.findByRole("checkbox", { name: /secure SSL\/TLS/iu });
    const host = screen.getByLabelText("Server address");
    const username = screen.getByLabelText("Username");

    // Document order: host … secure … username.
    expect(host.compareDocumentPosition(secure) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(
      secure.compareDocumentPosition(username) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("still saves everything the form collects", async () => {
    // The rearrangement must not drop a field. Every one the server needs is
    // still sent, which is the part a visual change can silently break.
    const user = await openEmail();

    await user.clear(screen.getByLabelText("Server address"));
    await user.type(screen.getByLabelText("Server address"), "smtp.example.test");
    await user.clear(screen.getByLabelText("Port"));
    await user.type(screen.getByLabelText("Port"), "587");
    await user.clear(screen.getByLabelText("Username"));
    await user.type(screen.getByLabelText("Username"), "mailer");
    await user.clear(screen.getByLabelText("From address"));
    await user.type(screen.getByLabelText("From address"), "site@rectangle.test");
    await user.clear(screen.getByLabelText("From name"));
    await user.type(screen.getByLabelText("From name"), "Rectangle");

    await user.click(screen.getByRole("button", { name: "Save email settings" }));

    await waitFor(() => expect(saved).toHaveLength(1));
    const body = JSON.parse(saved[0]!) as Record<string, unknown>;
    expect(body).toMatchObject({
      host: "smtp.example.test",
      port: 587,
      username: "mailer",
      fromEmail: "site@rectangle.test",
      fromName: "Rectangle",
    });
  });
});
