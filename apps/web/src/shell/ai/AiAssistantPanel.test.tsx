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
    if (url.includes("/v1/ai/chat/stream")) {
      asked.push(String(init?.body));
      /*
       * A real event stream, not a JSON body. The panel reads the response
       * with a reader and parses `data:` frames, so a plain object here would
       * exercise the fallback path instead of the streaming one — and the
       * streaming path is the one that ships.
       */
      const result = options.chat ?? { conversationId: "c1", answer: "Four.", usedTools: [] };
      const frames = [
        { type: "cycle", cycle: 1, total: 10 },
        { type: "answer", result },
      ];
      const body = frames.map((frame) => `data: ${JSON.stringify(frame)}\n\n`).join("");
      return Promise.resolve(
        new Response(body, { status: 200, headers: { "Content-Type": "text/event-stream" } }),
      );
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

  /*
   * The toggle is gone. It attached the current project to every message,
   * which spent tokens on context most questions did not need and could only
   * ever carry a project — so on Tasks or Team the assistant knew nothing.
   * The context now travels with the request and the model reads it only if it
   * calls `current_screen`.
   */
  it("sends where the person is standing, without a toggle", async () => {
    mockApi({});
    const user = userEvent.setup();
    renderPanel(withAi, "/projects/p-77");

    await screen.findByText("Ready");
    await user.type(screen.getByLabelText("Ask Rectangle AI"), "how is it going");
    await user.click(screen.getByRole("button", { name: /send/i }));

    await waitFor(() => expect(asked).toHaveLength(1));
    const body = JSON.parse(asked[0] ?? "{}") as { screen?: Record<string, unknown> };
    expect(body.screen?.projectId).toBe("p-77");
    // The route too, so the assistant can say which page rather than guessing.
    expect(body.screen?.route).toContain("/projects/");
  });

  it("offers nothing to toggle, on a project page or anywhere else", async () => {
    mockApi({});
    renderPanel(withAi, "/projects/p-77");

    await screen.findByText("Ready");
    expect(
      screen.queryByRole("button", { name: /context/i }),
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

describe("AiAssistantPanel: showing the work", () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    await setRectangleLanguage("en");
  });

  /** An event stream that pauses before the answer, so the feed can be read. */
  function mockSlowStream(frames: unknown[]) {
    asked = [];
    let release = () => undefined as void;
    const gate = new Promise<void>((resolve) => {
      release = () => resolve();
    });

    vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
      const url = String(input);
      if (url.includes("/v1/ai/settings")) return json({ aiSettings: WORKING });
      if (url.includes("/v1/ai/conversations")) return json({ conversations: [] });
      if (url.includes("/v1/ai/chat/stream")) {
        asked.push(String(init?.body));
        const encoder = new TextEncoder();
        const body = new ReadableStream({
          async start(controller) {
            for (const frame of frames) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(frame)}\n\n`));
            }
            // Held open so the pending state can be inspected before the
            // answer arrives and the feed is replaced.
            await gate;
            controller.close();
          },
        });
        return Promise.resolve(
          new Response(body, { status: 200, headers: { "Content-Type": "text/event-stream" } }),
        );
      }
      return json({});
    });

    return { release: () => release() };
  }

  it("says which step it is on and what it is using", async () => {
    const { release } = mockSlowStream([
      { type: "cycle", cycle: 2, total: 10 },
      { type: "tool", cycle: 2, tool: "search_risks", arguments: { query: "delay" } },
    ]);
    const user = userEvent.setup();
    renderPanel();

    await screen.findByText("Ready");
    await user.type(screen.getByLabelText("Ask Rectangle AI"), "any delays?");
    await user.click(screen.getByRole("button", { name: /send/i }));

    // The budget, so a slow answer is a fact rather than a worry.
    expect(await screen.findByText("Step 2 of 10")).toBeInTheDocument();
    // And what it is actually doing, named.
    expect(await screen.findByText("Using risk search")).toBeInTheDocument();

    release();
  });

  it("completes a step with what came back rather than adding another line", async () => {
    const { release } = mockSlowStream([
      { type: "cycle", cycle: 1, total: 10 },
      { type: "tool", cycle: 1, tool: "search_risks", arguments: { query: "delay" } },
      { type: "observation", cycle: 1, tool: "search_risks", summary: "3 found" },
    ]);
    const user = userEvent.setup();
    renderPanel();

    await screen.findByText("Ready");
    await user.type(screen.getByLabelText("Ask Rectangle AI"), "any delays?");
    await user.click(screen.getByRole("button", { name: /send/i }));

    expect(await screen.findByText("3 found")).toBeInTheDocument();
    // One step, finished — not two half-steps.
    expect(screen.getAllByText("Using risk search")).toHaveLength(1);

    release();
  });

  /*
   * Running out of steps is an offer, not a dead end — and continuing is never
   * automatic, because another run is more of somebody's money.
   */
  it("offers to keep going when it runs out of steps, and only then", async () => {
    mockApi({
      chat: {
        conversationId: "c1",
        answer: "I ran out of steps before I finished.",
        usedTools: [],
        exhausted: true,
        cyclesUsed: 10,
        cycleLimit: 10,
      },
    });
    const user = userEvent.setup();
    renderPanel();

    await screen.findByText("Ready");
    await user.type(screen.getByLabelText("Ask Rectangle AI"), "something hard");
    await user.click(screen.getByRole("button", { name: /send/i }));

    const keepGoing = await screen.findByRole("button", { name: "Keep going" });

    // Nothing continued on its own: one turn has been asked for, and one sent.
    expect(asked).toHaveLength(1);

    await user.click(keepGoing);

    await waitFor(() => expect(asked).toHaveLength(2));
    expect(JSON.parse(asked[1] ?? "{}")).toMatchObject({ continue: true });
  });

  it("does not offer to continue when it finished normally", async () => {
    mockApi({ chat: { conversationId: "c1", answer: "Done.", usedTools: [] } });
    const user = userEvent.setup();
    renderPanel();

    await screen.findByText("Ready");
    await user.type(screen.getByLabelText("Ask Rectangle AI"), "easy one");
    await user.click(screen.getByRole("button", { name: /send/i }));

    await screen.findByText("Done.");
    expect(screen.queryByRole("button", { name: "Keep going" })).not.toBeInTheDocument();
  });
});
