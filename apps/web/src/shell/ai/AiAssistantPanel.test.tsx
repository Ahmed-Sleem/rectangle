/**
 * The panel, tested against the mistake it was built to remove.
 *
 * The old panel showed a disabled box and the words "Model connection pending"
 * whatever was actually wrong, so the four different reasons the assistant might
 * not answer were indistinguishable to the person reading. Four of the tests
 * here assert that each cause now names itself, and that the composer is absent
 * rather than dead — because a box you can type into and then be refused is the
 * same lie in a different shape.
 *
 * The rest defend the two things that carry real risk: that nothing the model
 * proposes can execute without a person pressing a button, and that what the
 * card shows is the argument that will run rather than a sentence about it.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthContext, type AuthContextValue } from "@/shared/auth";
import { RectangleI18nProvider, setRectangleLanguage } from "@/shared/i18n";
import { AiAssistantPanel } from "./AiAssistantPanel";

interface Settings {
  configured: boolean;
  enabled: boolean;
  hasCompanyKey: boolean;
  hasPersonalKey: boolean;
  ready: boolean;
}

const WORKING: Settings = {
  configured: true,
  enabled: true,
  hasCompanyKey: true,
  hasPersonalKey: false,
  ready: true,
};

/** Bodies posted to the chat endpoint, so the request shape can be inspected. */
let asked: string[] = [];
/** Bodies posted to the confirm endpoint. */
let confirmed: string[] = [];

function json(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }),
  );
}

function mockApi(options: {
  settings?: Settings;
  settingsFails?: boolean;
  chat?: unknown;
  conversations?: Array<{ id: string; title: string; projectId: string | null; updatedAt: string }>;
  conversation?: { messages: unknown[] };
}) {
  asked = [];
  confirmed = [];
  return vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
    const url = String(input);

    if (url.includes("/v1/ai/settings")) {
      if (options.settingsFails) return json({ message: "no" }, 500);
      return json({ aiSettings: options.settings ?? WORKING });
    }
    if (url.includes("/v1/ai/chat")) {
      asked.push(String(init?.body));
      return json(options.chat ?? { conversationId: "c1", answer: "Four.", usedTools: [] });
    }
    if (url.includes("/v1/ai/confirm")) {
      confirmed.push(String(init?.body));
      return json({ done: true, tool: "create_task" });
    }
    if (url.match(/\/v1\/ai\/conversations\/.+/)) {
      return json({
        conversation: { id: "old", title: "Older thread", projectId: null, updatedAt: "2026-01-01T00:00:00.000Z" },
        messages: options.conversation?.messages ?? [],
      });
    }
    if (url.includes("/v1/ai/conversations")) {
      return json({ conversations: options.conversations ?? [] });
    }
    return json({});
  });
}

const withAi: AuthContextValue = {
  setupRequired: false,
  loading: false,
  refresh: async () => undefined,
  user: { tenantId: "1", userId: "2", roles: ["none"], permissions: ["ai.use"] },
};

const withAiAndSettings: AuthContextValue = {
  ...withAi,
  user: { tenantId: "1", userId: "2", roles: ["none"], permissions: ["ai.use", "settings.manage"] },
};

const withoutAi: AuthContextValue = {
  ...withAi,
  user: { tenantId: "1", userId: "3", roles: ["none"], permissions: [] },
};

function renderPanel(auth: AuthContextValue = withAi, path = "/") {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const router = createMemoryRouter(
    [
      { path: "/", element: <AiAssistantPanel collapsed={false} onToggle={() => undefined} /> },
      {
        path: "/projects/:projectId",
        element: <AiAssistantPanel collapsed={false} onToggle={() => undefined} />,
      },
      { path: "/settings", element: <p>Settings page</p> },
    ],
    { initialEntries: [path] },
  );

  return render(
    <QueryClientProvider client={queryClient}>
      <RectangleI18nProvider>
        <AuthContext.Provider value={auth}>
          <RouterProvider router={router} />
        </AuthContext.Provider>
      </RectangleI18nProvider>
    </QueryClientProvider>,
  );
}

describe("AiAssistantPanel", () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    await setRectangleLanguage("en");
  });

  it("is absent entirely for somebody without the permission", async () => {
    mockApi({});
    renderPanel(withoutAi);

    await waitFor(() => {
      expect(screen.queryByLabelText("AI Assistant")).not.toBeInTheDocument();
    });
    // Not hidden behind an explanation either: the nav does the same.
    expect(screen.queryByText(/permission/i)).not.toBeInTheDocument();
  });

  it("lets a question be asked and shows the answer with what it read", async () => {
    mockApi({
      chat: { conversationId: "c1", answer: "Four projects are running.", usedTools: ["search_projects"] },
    });
    const user = userEvent.setup();
    renderPanel();

    await screen.findByText("Ready");
    await user.type(screen.getByLabelText("Ask Rectangle AI"), "how many projects");
    await user.click(screen.getByRole("button", { name: /send/i }));

    expect(await screen.findByText("Four projects are running.")).toBeInTheDocument();
    // Naming the source is what makes the answer checkable rather than trusted.
    expect(screen.getByText("Read from: project search")).toBeInTheDocument();
  });

  it("sends one message and a thread id, never the transcript", async () => {
    mockApi({ chat: { conversationId: "c9", answer: "First.", usedTools: [] } });
    const user = userEvent.setup();
    renderPanel();

    await screen.findByText("Ready");
    await user.type(screen.getByLabelText("Ask Rectangle AI"), "first question");
    await user.click(screen.getByRole("button", { name: /send/i }));
    await screen.findByText("First.");

    await user.type(screen.getByLabelText("Ask Rectangle AI"), "second question");
    await user.click(screen.getByRole("button", { name: /send/i }));

    await waitFor(() => expect(asked).toHaveLength(2));
    const second = JSON.parse(asked[1] ?? "{}") as Record<string, unknown>;
    expect(second.message).toBe("second question");
    // The thread it belongs to, returned by the first turn.
    expect(second.conversationId).toBe("c9");
    // The history is the server's. Sending it would let a client rewrite it.
    expect(second).not.toHaveProperty("messages");
  });
});

describe("AiAssistantPanel: when it cannot answer, it says why", () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    await setRectangleLanguage("en");
  });

  /*
   * The four causes, each distinguishable. Under the old panel all four
   * produced the identical "Model connection pending", which is the defect.
   */
  it("says the assistant is not set up, and points an owner at settings", async () => {
    mockApi({
      settings: { configured: false, enabled: false, hasCompanyKey: false, hasPersonalKey: false, ready: false },
    });
    renderPanel(withAiAndSettings);

    expect(await screen.findByText("The assistant is not set up")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open settings" })).toBeInTheDocument();
  });

  it("tells somebody who cannot configure it who to ask, without a settings link", async () => {
    mockApi({
      settings: { configured: false, enabled: false, hasCompanyKey: false, hasPersonalKey: false, ready: false },
    });
    renderPanel(withAi);

    expect(await screen.findByText("The assistant is not set up")).toBeInTheDocument();
    expect(screen.getByText(/Ask whoever manages your Rectangle settings/)).toBeInTheDocument();
  });

  it("distinguishes switched off from not set up", async () => {
    mockApi({ settings: { ...WORKING, enabled: false, ready: false } });
    renderPanel(withAi);

    expect(await screen.findByText("The assistant is switched off")).toBeInTheDocument();
  });

  it("distinguishes a missing key from both of those", async () => {
    mockApi({ settings: { ...WORKING, hasCompanyKey: false, ready: false } });
    renderPanel(withAi);

    expect(await screen.findByText("No API key saved")).toBeInTheDocument();
    // Anybody may save their own, so this one is always actionable.
    expect(screen.getByRole("link", { name: "Open settings" })).toBeInTheDocument();
  });

  /*
   * The rule, stated as a test: unavailable means no composer at all. A box a
   * person can type into and then be refused is the fault being removed.
   */
  it("offers no composer at all when the assistant is unavailable", async () => {
    mockApi({ settings: { ...WORKING, enabled: false, ready: false } });
    renderPanel(withAi);

    await screen.findByText("The assistant is switched off");
    expect(screen.queryByLabelText("Ask Rectangle AI")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /send/i })).not.toBeInTheDocument();
  });

  it("says so honestly when it cannot even find out", async () => {
    mockApi({ settingsFails: true });
    renderPanel(withAi);

    expect(await screen.findByText("The assistant could not be reached")).toBeInTheDocument();
  });
});

describe("AiAssistantPanel: proposed changes wait for a person", () => {
  const proposalReply = {
    conversationId: "c1",
    answer: "I can add that.",
    usedTools: [],
    proposal: {
      id: "act-1",
      tool: "create_task",
      summary: { title: "Pour the slab", projectId: "p-1" },
    },
  };

  beforeEach(async () => {
    vi.restoreAllMocks();
    await setRectangleLanguage("en");
  });

  it("shows the arguments verbatim rather than a sentence about them", async () => {
    mockApi({ chat: proposalReply });
    const user = userEvent.setup();
    renderPanel();

    await screen.findByText("Ready");
    await user.type(screen.getByLabelText("Ask Rectangle AI"), "add a task");
    await user.click(screen.getByRole("button", { name: /send/i }));

    const card = await screen.findByRole("region", { name: "Waiting for your approval" });
    // The exact values the server will execute, so approval means something.
    expect(within(card).getByText("Pour the slab")).toBeInTheDocument();
    expect(within(card).getByText("p-1")).toBeInTheDocument();
  });

  it("creates nothing until the person approves", async () => {
    mockApi({ chat: proposalReply });
    const user = userEvent.setup();
    renderPanel();

    await screen.findByText("Ready");
    await user.type(screen.getByLabelText("Ask Rectangle AI"), "add a task");
    await user.click(screen.getByRole("button", { name: /send/i }));
    await screen.findByRole("region", { name: "Waiting for your approval" });

    // Shown, and nothing has happened yet.
    expect(confirmed).toHaveLength(0);

    await user.click(screen.getByRole("button", { name: "Approve" }));

    await waitFor(() => expect(confirmed).toHaveLength(1));
    // Only an identifier. The arguments come from the server's own row, so
    // tampering with what is on screen cannot change what runs.
    expect(JSON.parse(confirmed[0] ?? "{}")).toEqual({ actionId: "act-1" });
    expect(await screen.findByText("Done. The task was created.")).toBeInTheDocument();
  });

  it("lets the change be discarded without running it", async () => {
    mockApi({ chat: proposalReply });
    const user = userEvent.setup();
    renderPanel();

    await screen.findByText("Ready");
    await user.type(screen.getByLabelText("Ask Rectangle AI"), "add a task");
    await user.click(screen.getByRole("button", { name: /send/i }));
    await screen.findByRole("region", { name: "Waiting for your approval" });

    await user.click(screen.getByRole("button", { name: "Discard" }));

    await waitFor(() => {
      expect(screen.queryByRole("region", { name: "Waiting for your approval" })).not.toBeInTheDocument();
    });
    expect(confirmed).toHaveLength(0);
  });
});

describe("AiAssistantPanel: page context and history", () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    await setRectangleLanguage("en");
  });

  it("attaches the project when there is one, and says which", async () => {
    mockApi({});
    const user = userEvent.setup();
    renderPanel(withAi, "/projects/p-77");

    await screen.findByText("Ready");
    expect(screen.getByText("Answering about the project you are looking at.")).toBeInTheDocument();

    await user.type(screen.getByLabelText("Ask Rectangle AI"), "how is it going");
    await user.click(screen.getByRole("button", { name: /send/i }));

    await waitFor(() => expect(asked).toHaveLength(1));
    expect((JSON.parse(asked[0] ?? "{}") as Record<string, unknown>).projectId).toBe("p-77");
  });

  it("stops attaching it when the control is turned off", async () => {
    mockApi({});
    const user = userEvent.setup();
    renderPanel(withAi, "/projects/p-77");

    await screen.findByText("Ready");
    await user.click(screen.getByRole("button", { name: /using this project as context/i }));
    expect(screen.getByText("Answering about your work in general.")).toBeInTheDocument();

    await user.type(screen.getByLabelText("Ask Rectangle AI"), "anything");
    await user.click(screen.getByRole("button", { name: /send/i }));

    await waitFor(() => expect(asked).toHaveLength(1));
    expect(JSON.parse(asked[0] ?? "{}")).not.toHaveProperty("projectId");
  });

  /*
   * The control exists only where there is something for it to do, so it is
   * never a button that cannot act.
   */
  it("offers no context control away from a project", async () => {
    mockApi({});
    renderPanel(withAi, "/");

    await screen.findByText("Ready");
    expect(
      screen.queryByRole("button", { name: /using this project as context/i }),
    ).not.toBeInTheDocument();
  });

  it("opens a past conversation and shows its turns", async () => {
    mockApi({
      conversations: [{ id: "old", title: "Older thread", projectId: null, updatedAt: "2026-01-01T00:00:00.000Z" }],
      conversation: {
        messages: [
          { id: "m1", role: "user", content: "what did I ask", usedTools: [], createdAt: "2026-01-01T00:00:00.000Z" },
          { id: "m2", role: "assistant", content: "This.", usedTools: [], createdAt: "2026-01-01T00:00:01.000Z" },
        ],
      },
    });
    const user = userEvent.setup();
    renderPanel();

    await screen.findByText("Ready");
    await user.click(screen.getByRole("button", { name: "Past conversations" }));

    const dialog = await screen.findByRole("dialog");
    // Selected by the title element rather than the button's accessible name,
    // which also carries a date and so depends on the test machine's locale.
    await user.click(within(dialog).getByText("Older thread"));

    expect(await screen.findByText("what did I ask")).toBeInTheDocument();
    expect(screen.getByText("This.")).toBeInTheDocument();
  });

  it("clears the panel for a new conversation", async () => {
    mockApi({ chat: { conversationId: "c1", answer: "An answer.", usedTools: [] } });
    const user = userEvent.setup();
    renderPanel();

    await screen.findByText("Ready");
    await user.type(screen.getByLabelText("Ask Rectangle AI"), "something");
    await user.click(screen.getByRole("button", { name: /send/i }));
    await screen.findByText("An answer.");

    await user.click(screen.getByRole("button", { name: "New conversation" }));

    expect(screen.queryByText("An answer.")).not.toBeInTheDocument();
    expect(screen.getByText("Ask about your work")).toBeInTheDocument();

    // And the next question starts a thread rather than continuing the old one.
    await user.type(screen.getByLabelText("Ask Rectangle AI"), "fresh");
    await user.click(screen.getByRole("button", { name: /send/i }));
    await waitFor(() => expect(asked).toHaveLength(2));
    expect(JSON.parse(asked[1] ?? "{}")).not.toHaveProperty("conversationId");
  });

  it("reads in Arabic", async () => {
    await setRectangleLanguage("ar");
    mockApi({});
    renderPanel();

    expect(await screen.findByText("جاهز")).toBeInTheDocument();
    expect(screen.getByText("اسأل عن عملك")).toBeInTheDocument();
  });
});
