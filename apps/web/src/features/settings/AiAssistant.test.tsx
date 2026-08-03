/**
 * The assistant's settings: what each audience is shown, and what leaves.
 *
 * Two things are being defended here. The first is that a key never appears on
 * the screen and an unchanged key is never resent — a form that posted an empty
 * string would erase a working credential, and one that echoed the saved key
 * would put it in the DOM. The second is that a person without
 * `settings.manage` is not offered the company provider at all: absent, not
 * disabled, because the two look different to somebody who cannot tell whether
 * they are waiting for something.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthContext, type AuthContextValue } from "@/shared/auth";
import { RectangleI18nProvider, setRectangleLanguage } from "@/shared/i18n";
import { AiAssistant } from "./AiAssistant";
import type { AiSettingsView } from "./ai-api";

/** Bodies sent to the settings endpoint, so the payload can be inspected. */
let saved: string[] = [];
/** Bodies sent to the personal-key endpoint. */
let keyed: string[] = [];
/** Methods used against the personal-key endpoint. */
let keyMethods: string[] = [];

function json(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }),
  );
}

function mockApi(state: AiSettingsView) {
  saved = [];
  keyed = [];
  keyMethods = [];
  return vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
    const url = String(input);
    if (url.includes("/v1/ai/me")) {
      keyMethods.push(String(init?.method));
      if (init?.method === "PUT") {
        keyed.push(String(init.body));
        return json({ aiSettings: { ...state, personal: { ...state.personal, configured: true, hasKey: true } } });
      }
      return json({ aiSettings: { ...state, personal: NO_PROVIDER } });
    }
    if (url.includes("/v1/ai/settings") && init?.method === "PUT") {
      saved.push(String(init.body));
      return json({ aiSettings: { ...state, company: { ...state.company, configured: true } } });
    }
    return json({ aiSettings: state });
  });
}

const manager: AuthContextValue = {
  setupRequired: false,
  loading: false,
  refresh: async () => undefined,
  user: { tenantId: "1", userId: "2", roles: ["none"], permissions: ["ai.use", "settings.manage"] },
};

const ordinary: AuthContextValue = {
  ...manager,
  user: { tenantId: "1", userId: "3", roles: ["none"], permissions: ["ai.use"] },
};

function renderSection(auth: AuthContextValue = manager) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <RectangleI18nProvider>
        <AuthContext.Provider value={auth}>
          <AiAssistant open onToggle={() => undefined} />
        </AuthContext.Provider>
      </RectangleI18nProvider>
    </QueryClientProvider>,
  );
}

const NO_PROVIDER = {
  configured: false,
  hasKey: false,
  maxCycles: 10,
  maxOutputTokens: 2048,
};

const COMPANY_PROVIDER = {
  configured: true,
  baseUrl: "https://api.openai.com/v1",
  model: "gpt-4o-mini",
  hasKey: true,
  maxCycles: 10,
  maxOutputTokens: 2048,
};

const CONFIGURED: AiSettingsView = {
  company: COMPANY_PROVIDER,
  enabled: true,
  personal: NO_PROVIDER,
  active: "company",
  canChoose: false,
  ready: true,
};

const UNCONFIGURED: AiSettingsView = {
  company: NO_PROVIDER,
  enabled: false,
  personal: NO_PROVIDER,
  active: "none",
  canChoose: false,
  ready: false,
};

describe("AiAssistant settings", () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    await setRectangleLanguage("en");
  });

  it("offers only the way in when nothing is set up", async () => {
    mockApi(UNCONFIGURED);
    renderSection();

    expect(await screen.findByRole("button", { name: "Set up the assistant" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Assistant")).not.toBeInTheDocument();
  });

  it("states what is standing in the way rather than only that it is off", async () => {
    mockApi({ ...CONFIGURED, company: { ...COMPANY_PROVIDER, hasKey: false }, active: "none", ready: false });
    renderSection();

    expect(await screen.findByText("No key saved")).toBeInTheDocument();
  });

  it("shows the provider and an on/off switch once configured", async () => {
    mockApi(CONFIGURED);
    renderSection();

    expect(await screen.findByText(/Using the company/)).toBeInTheDocument();
    expect(screen.getByText(/gpt-4o-mini/)).toBeInTheDocument();
    expect(screen.getByLabelText("Assistant")).toBeChecked();
  });

  /*
   * The credential must not be reachable from the page. Not merely masked —
   * absent, since the server never sends it.
   */
  it("never renders a key", async () => {
    mockApi({ ...CONFIGURED, personal: { ...COMPANY_PROVIDER, model: "my-model" }, active: "personal", canChoose: true });
    const { container } = renderSection();

    await screen.findByText(/Using (the company|your own)/);

    expect(container.innerHTML).not.toContain("sk-");
    // Named in more than one place — the radio hint and the summary line — so
    // the assertion is that it is shown at all, not that it is shown once.
    expect(screen.getAllByText(/my-model/).length).toBeGreaterThan(0);
  });

  it("keeps the saved key when the box is left empty", async () => {
    mockApi(CONFIGURED);
    const user = userEvent.setup();
    renderSection();

    await user.click(await screen.findByRole("button", { name: "Edit" }));
    const wizard = await screen.findByRole("dialog");

    await user.clear(within(wizard).getByLabelText("Model"));
    await user.type(within(wizard).getByLabelText("Model"), "gpt-4o");
    // Endpoint, key, budget, review: four steps for the company scope.
    await user.click(within(wizard).getByRole("button", { name: /next/i }));
    await user.click(within(wizard).getByRole("button", { name: /next/i }));
    await user.click(within(wizard).getByRole("button", { name: /next/i }));
    await user.click(within(wizard).getByRole("button", { name: "Save and switch on" }));

    await waitFor(() => expect(saved).toHaveLength(1));
    const payload = JSON.parse(saved[0] ?? "{}") as Record<string, unknown>;
    expect(payload.model).toBe("gpt-4o");
    // Absent, not empty: an empty string would wipe the working key.
    expect(payload).not.toHaveProperty("apiKey");
  });

  it("refuses an endpoint that is not https, because the request carries the key", async () => {
    mockApi(UNCONFIGURED);
    const user = userEvent.setup();
    renderSection();

    await user.click(await screen.findByRole("button", { name: "Set up the assistant" }));
    const wizard = await screen.findByRole("dialog");

    await user.type(within(wizard).getByLabelText("Endpoint"), "http://api.example.com/v1");
    await user.type(within(wizard).getByLabelText("Model"), "some-model");

    expect(
      await within(wizard).findByText("Enter a full https address, for example https://api.openai.com/v1"),
    ).toBeInTheDocument();
    expect(within(wizard).getByRole("button", { name: /next/i })).toBeDisabled();
  });

  /*
   * A personal configuration is complete, not a set of overrides. It carries
   * its own endpoint and model, so "who is paying for this" has an answer.
   */
  it("saves a complete personal provider, and nothing to the company endpoint", async () => {
    mockApi(CONFIGURED);
    const user = userEvent.setup();
    renderSection();

    await user.click(await screen.findByRole("button", { name: "Use my own" }));
    const dialog = await screen.findByRole("dialog");

    await user.type(within(dialog).getByLabelText("Endpoint"), "https://mine.test/v1");
    await user.type(within(dialog).getByLabelText("Model"), "my-model");
    await user.click(within(dialog).getByRole("button", { name: /next/i }));
    await user.type(within(dialog).getByLabelText("Your own key"), "sk-personal-secret");
    await user.click(within(dialog).getByRole("button", { name: /next/i }));
    await user.click(within(dialog).getByRole("button", { name: /next/i }));
    await user.click(within(dialog).getByRole("button", { name: "Save my settings" }));

    await waitFor(() => expect(keyed).toHaveLength(1));
    const body = JSON.parse(keyed[0] ?? "{}") as Record<string, unknown>;
    expect(body.baseUrl).toBe("https://mine.test/v1");
    expect(body.model).toBe("my-model");
    expect(body.apiKey).toBe("sk-personal-secret");
    // Nothing went to the company's endpoint.
    expect(saved).toHaveLength(0);
  });

  /*
   * The reported bug, at the interface. Somebody with no company provider must
   * still be able to set up their own — this used to be impossible.
   */
  it("lets a person set up their own model when the company has none", async () => {
    mockApi(UNCONFIGURED);
    const user = userEvent.setup();
    renderSection(ordinary);

    await user.click(await screen.findByRole("button", { name: "Use my own" }));
    const dialog = await screen.findByRole("dialog");

    await user.type(within(dialog).getByLabelText("Endpoint"), "https://mine.test/v1");
    await user.type(within(dialog).getByLabelText("Model"), "my-model");
    await user.click(within(dialog).getByRole("button", { name: /next/i }));
    await user.type(within(dialog).getByLabelText("Your own key"), "sk-mine");
    await user.click(within(dialog).getByRole("button", { name: /next/i }));
    await user.click(within(dialog).getByRole("button", { name: /next/i }));
    await user.click(within(dialog).getByRole("button", { name: "Save my settings" }));

    await waitFor(() => expect(keyed).toHaveLength(1));
  });

  /*
   * A radio group with one option is a control that cannot change anything.
   * It appears only when there are genuinely two usable configurations.
   */
  it("offers the choice only when both models exist", async () => {
    mockApi(CONFIGURED);
    const { unmount } = renderSection();
    await screen.findByText(/Using (the company|your own)/);
    expect(
      screen.queryByRole("radiogroup", { name: "Which model to use" }),
    ).not.toBeInTheDocument();
    unmount();

    mockApi({
      ...CONFIGURED,
      personal: { ...COMPANY_PROVIDER, model: "my-model" },
      active: "personal",
      canChoose: true,
    });
    renderSection();

    expect(
      await screen.findByRole("radiogroup", { name: "Which model to use" }),
    ).toBeInTheDocument();
  });

  it("offers removal only when a personal model exists", async () => {
    mockApi(CONFIGURED);
    const { unmount } = renderSection();
    await screen.findByText(/Using (the company|your own)/);
    expect(screen.queryByRole("button", { name: "Remove mine" })).not.toBeInTheDocument();
    unmount();

    mockApi({ ...CONFIGURED, personal: { ...COMPANY_PROVIDER, model: "my-model" }, active: "personal", canChoose: true });
    const user = userEvent.setup();
    renderSection();

    await user.click(await screen.findByRole("button", { name: "Remove mine" }));
    await waitFor(() => expect(keyMethods).toContain("DELETE"));
  });

  /*
   * The permission rule, and the reason this file mounts the section rather
   * than the page: hidden means absent from the document, which is a thing a
   * query can prove. A disabled control would still be found here.
   */
  it("hides the company provider from somebody who cannot manage settings", async () => {
    mockApi(CONFIGURED);
    renderSection(ordinary);

    await screen.findByText(/Using (the company|your own)/);

    expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Assistant")).not.toBeInTheDocument();
    // Still told whether it works, because that is not a secret from them.
    expect(screen.getByText(/Your company has set up the assistant/)).toBeInTheDocument();
    // And can still manage their own key.
    expect(screen.getByRole("button", { name: "Use my own" })).toBeInTheDocument();
  });

  it("reads in Arabic", async () => {
    await setRectangleLanguage("ar");
    mockApi(CONFIGURED);
    renderSection();

    expect(await screen.findByText("يستخدم نموذج الشركة")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "تعديل" })).toBeInTheDocument();
  });
});
