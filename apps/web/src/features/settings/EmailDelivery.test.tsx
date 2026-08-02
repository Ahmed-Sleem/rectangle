/**
 * Mail delivery: what the section shows, and what the wizard guarantees.
 *
 * Every assertion here was a guarantee of the previous inline form and had to
 * survive the rearrangement — saving the right payload, not re-validating the
 * whole form when sending a test, keeping the secure choice with the server it
 * describes, and using a switch rather than a checkbox for the on/off. The
 * wizard adds two of its own: a step that is not valid cannot be left, and
 * going back does not throw away what was typed.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RectangleI18nProvider, setRectangleLanguage } from "@/shared/i18n";
import { EmailDelivery } from "./EmailDelivery";

/** Bodies sent to the save endpoint, so a rearrangement cannot drop a field. */
let saved: string[] = [];
/** Addresses a test send was asked for. */
let tested: string[] = [];

function json(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }),
  );
}

interface EmailState {
  configured: boolean;
  enabled?: boolean;
  hasPassword?: boolean;
  host?: string;
  port?: number;
  secure?: boolean;
  username?: string;
  fromEmail?: string;
  fromName?: string;
}

function mockApi(state: EmailState) {
  saved = [];
  tested = [];
  return vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
    const url = String(input);
    if (url.includes("/v1/settings/email/test")) {
      tested.push(String(init?.body));
      return json({ sent: true });
    }
    if (url.includes("/v1/settings/email") && init?.method === "PUT") {
      saved.push(String(init.body));
      return json({ emailSettings: { ...state, configured: true } });
    }
    return json({ emailSettings: state });
  });
}

/** Always rendered open: the section's disclosure is tested on the page itself. */
function renderSection() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <RectangleI18nProvider>
        <EmailDelivery open onToggle={() => undefined} />
      </RectangleI18nProvider>
    </QueryClientProvider>,
  );
}

const CONFIGURED: EmailState = {
  configured: true,
  enabled: true,
  hasPassword: true,
  host: "smtp.office365.com",
  port: 587,
  secure: false,
  username: "mailer@example.com",
  fromEmail: "mailer@example.com",
  fromName: "Rectangle",
};

async function completeServerStep(user: ReturnType<typeof userEvent.setup>) {
  const wizard = await screen.findByRole("dialog");
  await user.clear(within(wizard).getByLabelText("Server address"));
  await user.type(within(wizard).getByLabelText("Server address"), "smtp.office365.com");
  await user.clear(within(wizard).getByLabelText("Port"));
  await user.type(within(wizard).getByLabelText("Port"), "587");
  await user.clear(within(wizard).getByLabelText("Username"));
  await user.type(within(wizard).getByLabelText("Username"), "mailer@example.com");
  await user.type(within(wizard).getByLabelText("Password"), "smtp-password");
  return wizard;
}

describe("the section before anything is configured", () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    await setRectangleLanguage("en");
  });

  it("offers the one thing to do, not a form", async () => {
    /*
     * The fault being fixed: two hundred lines of form arriving at once. A
     * company that has not set this up needs to be told what it is for and
     * given the way in.
     */
    mockApi({ configured: false });
    renderSection();

    expect(await screen.findByRole("button", { name: "Set up email" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Server address")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("From address")).not.toBeInTheDocument();
  });

  it("does not offer a test send, because there is nothing to test with", async () => {
    // Previously offered and disabled. A permission-free impossibility is
    // simply absent rather than presented as a dead control.
    mockApi({ configured: false });
    renderSection();

    await screen.findByRole("button", { name: "Set up email" });
    expect(screen.queryByRole("button", { name: "Send test" })).not.toBeInTheDocument();
  });
});

describe("the wizard", () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    await setRectangleLanguage("en");
  });

  it("refuses to move on from a step that is not yet valid", async () => {
    /*
     * The reason for stepping at all. Discovering on the last screen that
     * something three steps back was wrong is what makes people abandon a form.
     */
    const user = userEvent.setup();
    mockApi({ configured: false });
    renderSection();

    await user.click(await screen.findByRole("button", { name: "Set up email" }));
    const wizard = await screen.findByRole("dialog");

    expect(within(wizard).getByRole("button", { name: "Next" })).toBeDisabled();

    await completeServerStep(user);
    await waitFor(() =>
      expect(within(wizard).getByRole("button", { name: "Next" })).toBeEnabled(),
    );
  });

  it("keeps what was typed when going back", async () => {
    // The other thing that makes people abandon a wizard. Steps stay mounted;
    // only their visibility changes.
    const user = userEvent.setup();
    mockApi({ configured: false });
    renderSection();

    await user.click(await screen.findByRole("button", { name: "Set up email" }));
    const wizard = await completeServerStep(userEvent.setup());

    await user.click(within(wizard).getByRole("button", { name: "Next" }));
    await user.click(within(wizard).getByRole("button", { name: "Back" }));

    expect(within(wizard).getByLabelText("Server address")).toHaveValue("smtp.office365.com");
    expect(within(wizard).getByLabelText("Username")).toHaveValue("mailer@example.com");
  });

  it("only offers to finish on the last step", async () => {
    // Nobody should be able to submit a half-filled form by reflex.
    const user = userEvent.setup();
    mockApi({ configured: false });
    renderSection();

    await user.click(await screen.findByRole("button", { name: "Set up email" }));
    const wizard = await completeServerStep(userEvent.setup());

    expect(
      within(wizard).queryByRole("button", { name: "Save email settings" }),
    ).not.toBeInTheDocument();

    await user.click(within(wizard).getByRole("button", { name: "Next" }));

    /*
     * The sender step is prefilled with a default name but no address, so it
     * is deliberately not yet complete — which is the rule under test one step
     * later. Filling it is what earns the last step.
     */
    await user.type(within(wizard).getByLabelText("From address"), "mailer@example.com");
    await waitFor(() =>
      expect(within(wizard).getByRole("button", { name: "Next" })).toBeEnabled(),
    );
    await user.click(within(wizard).getByRole("button", { name: "Next" }));

    expect(
      within(wizard).getByRole("button", { name: "Save email settings" }),
    ).toBeInTheDocument();
  });

  it("saves every field the server needs", async () => {
    /*
     * The guarantee that a visual change can silently break. Carried over from
     * the inline form unchanged.
     */
    const user = userEvent.setup();
    mockApi({ configured: false });
    renderSection();

    await user.click(await screen.findByRole("button", { name: "Set up email" }));
    const wizard = await completeServerStep(userEvent.setup());
    await user.click(within(wizard).getByRole("button", { name: "Next" }));

    await user.clear(within(wizard).getByLabelText("From address"));
    await user.type(within(wizard).getByLabelText("From address"), "mailer@example.com");
    await user.clear(within(wizard).getByLabelText("From name"));
    await user.type(within(wizard).getByLabelText("From name"), "Rectangle");
    await user.click(within(wizard).getByRole("button", { name: "Next" }));

    await user.click(within(wizard).getByRole("button", { name: "Save email settings" }));

    await waitFor(() => expect(saved).toHaveLength(1));
    expect(JSON.parse(saved[0]!)).toMatchObject({
      host: "smtp.office365.com",
      port: 587,
      username: "mailer@example.com",
      fromEmail: "mailer@example.com",
      fromName: "Rectangle",
    });
  });

  it("keeps the secure-connection choice with the server it describes", async () => {
    // It qualifies the address and port, not the credentials.
    const user = userEvent.setup();
    mockApi({ configured: false });
    renderSection();

    await user.click(await screen.findByRole("button", { name: "Set up email" }));
    const wizard = await screen.findByRole("dialog");

    const host = within(wizard).getByLabelText("Server address");
    const secure = within(wizard).getByRole("checkbox", { name: /secure SSL\/TLS/iu });
    const username = within(wizard).getByLabelText("Username");

    expect(host.compareDocumentPosition(secure) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(
      secure.compareDocumentPosition(username) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});

describe("the section once mail is configured", () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    await setRectangleLanguage("en");
  });

  it("states the situation instead of reprinting the form", async () => {
    mockApi(CONFIGURED);
    renderSection();

    expect(await screen.findByText("Configured")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Edit settings/u })).toBeInTheDocument();
    // The form is not on the page; it is one deliberate click away.
    expect(screen.queryByLabelText("Server address")).not.toBeInTheDocument();
  });

  it("turns sending on and off with a switch, not a checkbox", async () => {
    /*
     * This enables a capability for the whole company. A checkbox reads as one
     * of several choices inside a form; a switch reads as the thing itself.
     */
    mockApi(CONFIGURED);
    renderSection();

    expect(
      await screen.findByRole("switch", { name: "Send email from Rectangle" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("checkbox", { name: "Send email from Rectangle" }),
    ).not.toBeInTheDocument();
  });

  it("pauses sending without walking the whole wizard", async () => {
    // One decision, saved on its own. Making somebody re-confirm a mail server
    // in order to pause outgoing mail would be the opposite of the point.
    const user = userEvent.setup();
    mockApi(CONFIGURED);
    renderSection();

    await user.click(await screen.findByRole("switch", { name: "Send email from Rectangle" }));

    await waitFor(() => expect(saved).toHaveLength(1));
    expect(JSON.parse(saved[0]!)).toMatchObject({ enabled: false });
  });

  it("sends a test to the address given, without re-validating the whole form", async () => {
    /*
     * The test used to run the credentials form's validation, so a company
     * whose saved record no longer satisfies a current rule could type a
     * perfectly good address, press the button, and have nothing happen — the
     * refusal landing on a field they were not editing. It is now its own
     * window with its own single field.
     */
    const user = userEvent.setup();
    mockApi(CONFIGURED);
    renderSection();

    await user.click(await screen.findByRole("button", { name: /Send test/u }));

    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("Send to"), "site@rectangle.test");
    await user.click(within(dialog).getByRole("button", { name: "Send test" }));

    await waitFor(() => expect(tested).toHaveLength(1));
    expect(tested[0]).toContain("site@rectangle.test");
  });
});
