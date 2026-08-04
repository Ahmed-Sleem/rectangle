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
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthContext, type AuthContextValue } from "@/shared/auth";
import { RectangleI18nProvider, setRectangleLanguage } from "@/shared/i18n";
import { AiAssistantPanel } from "./AiAssistantPanel";
import type { AiSettingsView } from "@/features/settings/ai-api";

/*
 * The real response type, imported rather than described again here.
 *
 * This file used to declare its own copy with the fields the API had in an
 * earlier version. When the server split the company and personal providers
 * into two objects, the copy went on describing the old shape — so the fixtures
 * still "passed" while the panel read `configured` off an object that no longer
 * had it and told every user the assistant was not set up. A test that mocks a
 * type it invented cannot catch a type that changed.
 */
type Settings = AiSettingsView;

const NO_PROVIDER = {
  configured: false,
  hasKey: false,
  maxCycles: 10,
  maxOutputTokens: 2048,
};

const WORKING: Settings = {
  company: {
    configured: true,
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4o-mini",
    hasKey: true,
    maxCycles: 10,
    maxOutputTokens: 2048,
  },
  enabled: true,
  personal: NO_PROVIDER,
  active: "company",
  canChoose: false,
  ready: true,
};

/** Bodies posted to the chat endpoint, so the request shape can be inspected. */
let asked: string[] = [];
/** Bodies posted to the confirm endpoint. */
let confirmed: string[] = [];
/** Bodies posted to the auto-approval endpoint. */
let autoApproved: string[] = [];

/**
 * Every IntersectionObserver the component under test created.
 *
 * jsdom implements the constructor but never calls the callback, because it has
 * no layout and so nothing is ever visible. That means an infinite list would
 * pass every test here whether it was wired up or not — the observer simply
 * never fires. Keeping the instances lets a test say "the foot of the list came
 * into view" explicitly, which is the event the code is actually waiting for.
 */
let observers: Array<{ callback: IntersectionObserverCallback; targets: Element[] }> = [];

/** Reports every watched element as visible, as a real scroll to the end would. */
function triggerIntersection() {
  for (const observer of observers) {
    const entries = observer.targets.map(
      (target) => ({ isIntersecting: true, target }) as IntersectionObserverEntry,
    );
    if (entries.length > 0) act(() => observer.callback(entries, {} as IntersectionObserver));
  }
}
/** How many times the conversation LIST was fetched, as opposed to one thread. */
let conversationListReads = 0;

function json(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }),
  );
}

/**
 * A recording stand-in for the browser's observer.
 *
 * Installed for every test rather than only the paging one, because a component
 * that constructs an observer must not throw in the tests that do not care
 * about it.
 */
function stubIntersectionObserver() {
  observers = [];

  class RecordingObserver implements IntersectionObserver {
    readonly root = null;
    readonly rootMargin = "";
    readonly thresholds: ReadonlyArray<number> = [];
    private readonly entry: { callback: IntersectionObserverCallback; targets: Element[] };

    constructor(callback: IntersectionObserverCallback) {
      this.entry = { callback, targets: [] };
      observers.push(this.entry);
    }

    observe(target: Element) {
      this.entry.targets.push(target);
    }

    unobserve(target: Element) {
      this.entry.targets = this.entry.targets.filter((candidate) => candidate !== target);
    }

    disconnect() {
      this.entry.targets = [];
    }

    takeRecords(): IntersectionObserverEntry[] {
      return [];
    }
  }

  vi.stubGlobal("IntersectionObserver", RecordingObserver);
}

function mockApi(options: {
  settings?: Settings;
  settingsFails?: boolean;
  chat?: unknown;
  conversations?: Array<{ id: string; title: string; projectId: string | null; updatedAt: string }>;
  conversation?: { messages: unknown[] };
  /** Makes approving fail, so ordering around it can be observed. */
  confirmFails?: boolean;
}) {
  asked = [];
  confirmed = [];
  autoApproved = [];
  conversationListReads = 0;
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
    if (url.includes("/v1/ai/auto-approvals")) {
      if (init?.method === "PUT") autoApproved.push(String(init.body));
      return json({ tools: [] });
    }
    if (url.includes("/v1/ai/confirm")) {
      confirmed.push(String(init?.body));
      if (options.confirmFails) return json({ message: "refused" }, 409);
      return json({ done: true, tool: "create_task", results: [{ tool: "create_task", ok: true }] });
    }
    if (url.match(/\/v1\/ai\/conversations\/.+/)) {
      return json({
        conversation: { id: "old", title: "Older thread", projectId: null, updatedAt: "2026-01-01T00:00:00.000Z" },
        messages: options.conversation?.messages ?? [],
      });
    }
    if (url.includes("/v1/ai/conversations")) {
      conversationListReads += 1;
      // The real endpoint pages, so the fixture carries a cursor field too. A
      // mock of the previous shape would let a paging mistake through unseen.
      return json({ conversations: options.conversations ?? [], nextCursor: null });
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
  /*
   * The workspace's real `staleTime` is mirrored here deliberately. Without it
   * every query in this file refetches on demand, which is not how the product
   * behaves — and it is precisely the difference that hid a reported bug: the
   * conversation list was served from a thirty-second cache, so a thread
   * created after the window was last opened was missing from it. A test
   * harness with no cache could not express that fault.
   */
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: 30_000 },
      mutations: { retry: false },
    },
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
    stubIntersectionObserver();
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
    stubIntersectionObserver();
    await setRectangleLanguage("en");
  });

  /*
   * The four causes, each distinguishable. Under the old panel all four
   * produced the identical "Model connection pending", which is the defect.
   */
  it("says the assistant is not set up, and points an owner at settings", async () => {
    mockApi({
      settings: { ...WORKING, company: NO_PROVIDER, enabled: false, active: "none", ready: false },
    });
    renderPanel(withAiAndSettings);

    expect(await screen.findByText("The assistant is not set up")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open settings" })).toBeInTheDocument();
  });

  it("tells somebody who cannot configure it who to ask, without a settings link", async () => {
    mockApi({
      settings: { ...WORKING, company: NO_PROVIDER, enabled: false, active: "none", ready: false },
    });
    renderPanel(withAi);

    expect(await screen.findByText("The assistant is not set up")).toBeInTheDocument();
    expect(screen.getByText(/Ask whoever manages your Rectangle settings/)).toBeInTheDocument();
  });

  it("distinguishes switched off from not set up", async () => {
    mockApi({ settings: { ...WORKING, enabled: false, active: "none", ready: false } });
    renderPanel(withAi);

    expect(await screen.findByText("The assistant is switched off")).toBeInTheDocument();
  });

  it("distinguishes a missing key from both of those", async () => {
    mockApi({
      settings: {
        ...WORKING,
        company: { ...WORKING.company, hasKey: false },
        active: "none",
        ready: false,
      },
    });
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
    mockApi({ settings: { ...WORKING, enabled: false, active: "none", ready: false } });
    renderPanel(withAi);

    await screen.findByText("The assistant is switched off");
    expect(screen.queryByLabelText("Ask Rectangle AI")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /send/i })).not.toBeInTheDocument();
  });

  /*
   * The regression that reached a user. The panel read a field the API had
   * stopped sending, so it decided nothing was configured and said so to
   * everybody, whatever they had set up. `ready` is the server's own answer to
   * "could this person ask a question right now", and the panel must never
   * contradict it.
   */
  it("shows no blocked state whenever the server says it is ready", async () => {
    mockApi({ settings: WORKING });
    renderPanel();

    await screen.findByText("Ready");
    expect(screen.queryByText(/is not set up/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText("Ask Rectangle AI")).toBeEnabled();
  });

  it("is usable on a personal model with no company provider at all", async () => {
    mockApi({
      settings: {
        ...WORKING,
        company: NO_PROVIDER,
        enabled: false,
        personal: {
          configured: true,
          baseUrl: "https://mine.test/v1",
          model: "my-model",
          hasKey: true,
          maxCycles: 10,
          maxOutputTokens: 2048,
        },
        active: "personal",
        ready: true,
      },
    });
    renderPanel();

    await screen.findByText("Ready");
    expect(screen.queryByText(/is not set up/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText("Ask Rectangle AI")).toBeEnabled();
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
    proposals: [
      {
        id: "act-1",
        tool: "create_task",
        summary: { title: "Pour the slab", projectId: "p-1" },
        destructive: false,
      },
    ],
  };

  beforeEach(async () => {
    vi.restoreAllMocks();
    stubIntersectionObserver();
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
    expect(JSON.parse(confirmed[0] ?? "{}")).toEqual({ actionIds: ["act-1"] });
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
    stubIntersectionObserver();
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

  /*
   * Reported: the history was "never updated, always outdated".
   *
   * The invalidation that runs when an answer lands was already correct, and a
   * test built around it passed with the fix removed — so it proved nothing and
   * was replaced by this one, which isolates the part that was genuinely
   * broken. The workspace caches every query for thirty seconds. Anything that
   * changes the list WITHOUT this panel knowing — a thread created in another
   * tab, on a phone, or by a turn whose response never arrived — left the
   * window showing a list it had no reason to believe was stale.
   *
   * So the guarantee is stated as the owner stated it: opening the window reads
   * the list. Counting the reads is what makes the assertion able to fail,
   * because a cached second open is indistinguishable from a fresh one by
   * content alone when nothing happened in between.
   */
  it("re-reads the list every time the window is opened", async () => {
    mockApi({
      conversations: [
        { id: "old", title: "Older thread", projectId: null, updatedAt: "2026-01-01T00:00:00.000Z" },
      ],
    });
    const user = userEvent.setup();
    renderPanel();
    await screen.findByText("Ready");

    await user.click(screen.getByRole("button", { name: "Past conversations" }));
    await screen.findByRole("dialog");
    await waitFor(() => expect(conversationListReads).toBe(1));

    await user.click(screen.getByRole("button", { name: "Close" }));
    await user.click(screen.getByRole("button", { name: "Past conversations" }));
    await screen.findByRole("dialog");

    // Nothing changed in between, which is exactly the case a cache would serve
    // from memory and the case in which the list can silently be wrong.
    await waitFor(() => expect(conversationListReads).toBe(2));
  });

  it("searches the list by title, and says so when nothing matches", async () => {
    const queries: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const url = typeof input === "string" ? input : String(input);

      if (url.includes("/v1/ai/conversations")) {
        const query = new URL(url, "http://x").searchParams.get("query") ?? "";
        queries.push(query);
        const all = [
          { id: "c-1", title: "steel delivery", projectId: null, updatedAt: "2026-01-01T00:00:00.000Z" },
          { id: "c-2", title: "concrete pour", projectId: null, updatedAt: "2026-01-02T00:00:00.000Z" },
        ];
        const conversations = query
          ? all.filter((row) => row.title.includes(query))
          : all;
        return json({ conversations, nextCursor: null });
      }

      return json({ aiSettings: WORKING });
    });

    const user = userEvent.setup();
    renderPanel();
    await screen.findByText("Ready");
    await user.click(screen.getByRole("button", { name: "Past conversations" }));

    const dialog = await screen.findByRole("dialog");
    expect(await within(dialog).findByText("steel delivery")).toBeInTheDocument();

    await user.type(within(dialog).getByLabelText("Search your conversations"), "concrete");

    expect(await within(dialog).findByText("concrete pour")).toBeInTheDocument();
    await waitFor(() => expect(within(dialog).queryByText("steel delivery")).not.toBeInTheDocument());
    // The term reached the server rather than being filtered in the browser,
    // which would silently miss every thread beyond the first page.
    expect(queries).toContain("concrete");

    await user.clear(within(dialog).getByLabelText("Search your conversations"));
    await user.type(within(dialog).getByLabelText("Search your conversations"), "scaffolding");

    // A search that found nothing must not read as "you have no conversations".
    expect(await within(dialog).findByText("Nothing matched")).toBeInTheDocument();
  });

  it("loads an older page when the foot of the list is reached", async () => {
    const cursors: Array<string | null> = [];
    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const url = typeof input === "string" ? input : String(input);

      if (url.includes("/v1/ai/conversations")) {
        const cursor = new URL(url, "http://x").searchParams.get("cursor");
        cursors.push(cursor);
        return cursor
          ? json({
              conversations: [
                { id: "old-1", title: "an older thread", projectId: null, updatedAt: "2025-01-01T00:00:00.000Z" },
              ],
              nextCursor: null,
            })
          : json({
              conversations: [
                { id: "new-1", title: "a recent thread", projectId: null, updatedAt: "2026-01-01T00:00:00.000Z" },
              ],
              nextCursor: "page-two",
            });
      }

      return json({ aiSettings: WORKING });
    });

    const user = userEvent.setup();
    renderPanel();
    await screen.findByText("Ready");
    await user.click(screen.getByRole("button", { name: "Past conversations" }));

    const dialog = await screen.findByRole("dialog");
    expect(await within(dialog).findByText("a recent thread")).toBeInTheDocument();

    /*
     * jsdom has no layout and never fires an IntersectionObserver, so the
     * sentinel is triggered directly through the stub installed in setup. This
     * asserts the wiring — the cursor is carried and the older page is appended
     * — which is the part that can be wrong in a way a person would notice.
     */
    triggerIntersection();

    expect(await within(dialog).findByText("an older thread")).toBeInTheDocument();
    // Still there: pages accumulate rather than replacing one another.
    expect(within(dialog).getByText("a recent thread")).toBeInTheDocument();
    expect(cursors).toEqual([null, "page-two"]);
  });

  it("offers a fresh thread when the conversation outgrows the model", async () => {
    let branched = false;
    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const url = typeof input === "string" ? input : String(input);

      if (url.includes("/branch")) {
        branched = true;
        return json({
          conversation: { id: "fresh", title: "carried over", projectId: null, updatedAt: "2026-01-01T00:00:00.000Z" },
          messages: [
            { id: "m1", role: "user", content: "the tail of it", usedTools: [], createdAt: "2026-01-01T00:00:00.000Z" },
          ],
        });
      }

      if (url.includes("/v1/ai/chat/stream")) {
        const frames = [
          {
            type: "failed",
            message: "This conversation has grown longer than the model can read in one go.",
            code: "CONTEXT_TOO_LONG",
          },
        ];
        return Promise.resolve(
          new Response(frames.map((f) => `data: ${JSON.stringify(f)}\n\n`).join(""), {
            status: 200,
            headers: { "Content-Type": "text/event-stream" },
          }),
        );
      }

      if (url.match(/\/v1\/ai\/conversations\/[^/]+$/)) {
        return json({
          conversation: { id: "long", title: "the long one", projectId: null, updatedAt: "2026-01-01T00:00:00.000Z" },
          messages: [],
        });
      }

      if (url.includes("/v1/ai/conversations")) {
        return json({
          conversations: [
            { id: "long", title: "the long one", projectId: null, updatedAt: "2026-01-01T00:00:00.000Z" },
          ],
          nextCursor: null,
        });
      }

      return json({ aiSettings: WORKING });
    });

    const user = userEvent.setup();
    renderPanel();
    await screen.findByText("Ready");

    /*
     * Opened from the history first, because that is the shape of the real
     * case: a thread long enough to overflow is one that already exists. It
     * also gives the panel the id it needs to branch from — without a thread
     * there is nothing to carry over, and the offer is correctly absent.
     */
    await user.click(screen.getByRole("button", { name: "Past conversations" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByText("the long one"));

    await user.type(await screen.findByLabelText("Ask Rectangle AI"), "one more question");
    await user.click(screen.getByRole("button", { name: /send/i }));

    expect(await screen.findByText("This conversation is too long to continue")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Continue in a new conversation" }));

    await waitFor(() => expect(branched).toBe(true));
    // The tail is carried into the panel, so the person continues rather than
    // starting from nothing.
    expect(await screen.findByText("the tail of it")).toBeInTheDocument();
  });

  /*
   * An ordinary failure must NOT offer the branch, or somebody is sent to a
   * fresh thread that will fail in exactly the same way.
   *
   * A thread is opened first, and that detail is what gives the test its teeth.
   * The banner needs both a too-long code AND a conversation to branch from, so
   * a version of this that never opened one passed even when the code check was
   * removed entirely — the second condition was carrying it. Opening the thread
   * satisfies everything except the code, which isolates the code.
   */
  it("does not offer a fresh thread for an unrelated failure", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const url = typeof input === "string" ? input : String(input);

      if (url.includes("/v1/ai/chat/stream")) {
        const frame = {
          type: "failed",
          message: "Rectangle could not reach the model endpoint.",
          code: "UPSTREAM_UNAVAILABLE",
        };
        return Promise.resolve(
          new Response(`data: ${JSON.stringify(frame)}\n\n`, {
            status: 200,
            headers: { "Content-Type": "text/event-stream" },
          }),
        );
      }

      if (url.match(/\/v1\/ai\/conversations\/[^/]+$/)) {
        return json({
          conversation: { id: "open", title: "an open thread", projectId: null, updatedAt: "2026-01-01T00:00:00.000Z" },
          messages: [],
        });
      }

      if (url.includes("/v1/ai/conversations")) {
        return json({
          conversations: [
            { id: "open", title: "an open thread", projectId: null, updatedAt: "2026-01-01T00:00:00.000Z" },
          ],
          nextCursor: null,
        });
      }

      return json({ aiSettings: WORKING });
    });

    const user = userEvent.setup();
    renderPanel();
    await screen.findByText("Ready");

    await user.click(screen.getByRole("button", { name: "Past conversations" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByText("an open thread"));

    await user.type(await screen.findByLabelText("Ask Rectangle AI"), "anything");
    await user.click(screen.getByRole("button", { name: /send/i }));

    expect(await screen.findByText("Rectangle could not reach the model endpoint.")).toBeInTheDocument();
    expect(screen.queryByText("This conversation is too long to continue")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Continue in a new conversation" }),
    ).not.toBeInTheDocument();
  });

  it("clears the whole history behind an inline confirmation", async () => {
    let cleared = false;
    vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
      const url = typeof input === "string" ? input : String(input);

      if (url.includes("/v1/ai/conversations/all") && init?.method === "DELETE") {
        cleared = true;
        return json({ deleted: 2 });
      }
      if (url.includes("/v1/ai/conversations")) {
        return json({
          conversations: cleared
            ? []
            : [
                { id: "a", title: "steel delivery", projectId: null, updatedAt: "2026-01-01T00:00:00.000Z" },
                { id: "b", title: "concrete pour", projectId: null, updatedAt: "2026-01-02T00:00:00.000Z" },
              ],
          nextCursor: null,
        });
      }
      return json({ aiSettings: WORKING });
    });

    const user = userEvent.setup();
    renderPanel();
    await screen.findByText("Ready");
    await user.click(screen.getByRole("button", { name: "Past conversations" }));

    const dialog = await screen.findByRole("dialog");
    await within(dialog).findByText("steel delivery");

    await user.click(within(dialog).getByRole("button", { name: /Delete all/ }));

    /*
     * Asked in place rather than in a window over the window, and the count is
     * named — "delete all 2" is checkable against what somebody believes they
     * have, where a bare "are you sure" is not.
     */
    const confirm = await within(dialog).findByRole("button", { name: "Delete all 2?" });
    expect(within(dialog).queryByRole("dialog")).not.toBeInTheDocument();

    await user.click(confirm);

    await waitFor(() => expect(cleared).toBe(true));
    expect(await within(dialog).findByText("No conversations yet")).toBeInTheDocument();
  });

  it("gives the row to the field while it is being searched", async () => {
    mockApi({
      conversations: [
        { id: "a", title: "steel delivery", projectId: null, updatedAt: "2026-01-01T00:00:00.000Z" },
      ],
    });
    const user = userEvent.setup();
    renderPanel();
    await screen.findByText("Ready");
    await user.click(screen.getByRole("button", { name: "Past conversations" }));

    const dialog = await screen.findByRole("dialog");
    expect(await within(dialog).findByRole("button", { name: /Delete all/ })).toBeInTheDocument();

    /*
     * The button yields the width rather than being squeezed. A cramped field
     * is the thing being fixed, and nobody is reaching for "delete all" in the
     * moment they are typing a search.
     */
    await user.click(within(dialog).getByLabelText("Search your conversations"));

    await waitFor(() =>
      expect(within(dialog).queryByRole("button", { name: /Delete all/ })).not.toBeInTheDocument(),
    );
  });

  it("offers nothing to delete when there is nothing to delete", async () => {
    mockApi({ conversations: [] });
    const user = userEvent.setup();
    renderPanel();
    await screen.findByText("Ready");
    await user.click(screen.getByRole("button", { name: "Past conversations" }));

    const dialog = await screen.findByRole("dialog");
    await within(dialog).findByText("No conversations yet");
    // A control whose only outcome is "deleted 0" should not be on the screen.
    expect(within(dialog).queryByRole("button", { name: /Delete all/ })).not.toBeInTheDocument();
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
    stubIntersectionObserver();
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

describe("AiAssistantPanel: approving several changes at once", () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    stubIntersectionObserver();
    await setRectangleLanguage("en");
  });

  const three = {
    conversationId: "c1",
    answer: "Three changes are waiting.",
    usedTools: [],
    proposals: [
      { id: "a1", tool: "create_task", summary: { title: "Pour the slab" }, destructive: false },
      { id: "a2", tool: "create_task", summary: { title: "Order rebar" }, destructive: false },
      { id: "a3", tool: "update_task", summary: { taskId: "t-9", status: "done" }, destructive: false },
    ],
  };

  /*
   * One card, three sets of arguments. Batching is about how often somebody is
   * interrupted, never about what they are shown — approving a summary of three
   * things is not approving any of them.
   */
  it("shows every change in one card, each with its own arguments", async () => {
    mockApi({ chat: three });
    const user = userEvent.setup();
    renderPanel();

    await screen.findByText("Ready");
    await user.type(screen.getByLabelText("Ask Rectangle AI"), "do three things");
    await user.click(screen.getByRole("button", { name: /send/i }));

    const card = await screen.findByRole("region", { name: "Waiting for your approval" });
    expect(within(card).getByText("Pour the slab")).toBeInTheDocument();
    expect(within(card).getByText("Order rebar")).toBeInTheDocument();
    expect(within(card).getByText("t-9")).toBeInTheDocument();
    // One approval control for the set, not three.
    expect(within(card).getByRole("button", { name: "Approve all 3" })).toBeInTheDocument();
  });

  it("approves the whole set in one request", async () => {
    mockApi({ chat: three });
    const user = userEvent.setup();
    renderPanel();

    await screen.findByText("Ready");
    await user.type(screen.getByLabelText("Ask Rectangle AI"), "do three things");
    await user.click(screen.getByRole("button", { name: /send/i }));
    await screen.findByRole("region", { name: "Waiting for your approval" });

    expect(confirmed).toHaveLength(0);
    await user.click(screen.getByRole("button", { name: "Approve all 3" }));

    await waitFor(() => expect(confirmed).toHaveLength(1));
    expect(JSON.parse(confirmed[0] ?? "{}")).toEqual({ actionIds: ["a1", "a2", "a3"] });
  });

  /*
   * The rule the tiered design rests on: an irreversible change can never be
   * silenced, so the option is not offered and the reason is stated instead of
   * simply leaving a gap where the tick box was.
   */
  it("offers no way to silence an irreversible change", async () => {
    mockApi({
      chat: {
        conversationId: "c1",
        answer: "One deletion is waiting.",
        usedTools: [],
        proposals: [
          { id: "d1", tool: "delete_task", summary: { taskId: "t-9" }, destructive: true },
        ],
      },
    });
    const user = userEvent.setup();
    renderPanel();

    await screen.findByText("Ready");
    await user.type(screen.getByLabelText("Ask Rectangle AI"), "delete it");
    await user.click(screen.getByRole("button", { name: /send/i }));

    const card = await screen.findByRole("region", { name: "Waiting for your approval" });
    expect(within(card).getByText("This cannot be undone, so it always asks.")).toBeInTheDocument();
    expect(within(card).queryByLabelText(/Do not ask me again/)).not.toBeInTheDocument();
  });

  it("records no preference when the approval itself fails", async () => {
    /*
     * Ordering, tested by making the approval fail. An earlier version of this
     * test ticked the box, approved successfully, and asserted the preference
     * was saved — which passes whether the save happens before or after the
     * approval, so it could not see the bug it was written for. Somebody whose
     * change was refused has agreed to nothing and must not quietly acquire a
     * standing preference from an act that did not happen.
     */
    mockApi({ chat: three, confirmFails: true });
    const user = userEvent.setup();
    renderPanel();

    await screen.findByText("Ready");
    await user.type(screen.getByLabelText("Ask Rectangle AI"), "do three things");
    await user.click(screen.getByRole("button", { name: /send/i }));
    const card = await screen.findByRole("region", { name: "Waiting for your approval" });

    await user.click(within(card).getAllByLabelText(/Do not ask me again/)[0]!);
    expect(autoApproved).toHaveLength(0);

    await user.click(within(card).getByRole("button", { name: "Approve all 3" }));

    await waitFor(() => expect(confirmed).toHaveLength(1));
    expect(autoApproved).toHaveLength(0);
  });

  it("records the preference once the change has been approved", async () => {
    mockApi({ chat: three });
    const user = userEvent.setup();
    renderPanel();

    await screen.findByText("Ready");
    await user.type(screen.getByLabelText("Ask Rectangle AI"), "do three things");
    await user.click(screen.getByRole("button", { name: /send/i }));
    const card = await screen.findByRole("region", { name: "Waiting for your approval" });

    await user.click(within(card).getAllByLabelText(/Do not ask me again/)[0]!);
    await user.click(within(card).getByRole("button", { name: "Approve all 3" }));

    await waitFor(() => expect(autoApproved).toHaveLength(1));
    expect(JSON.parse(autoApproved[0] ?? "{}")).toEqual({ tool: "create_task" });
  });

  /*
   * An auto-approved action that is invisible is indistinguishable from an
   * agent acting on its own, so the transcript has to say it happened.
   */
  it("says when something ran without asking", async () => {
    mockApi({
      chat: {
        conversationId: "c1",
        answer: "Added it.",
        usedTools: [],
        performed: [{ tool: "create_task", summary: { title: "Pour" } }],
      },
    });
    const user = userEvent.setup();
    renderPanel();

    await screen.findByText("Ready");
    await user.type(screen.getByLabelText("Ask Rectangle AI"), "add a task");
    await user.click(screen.getByRole("button", { name: /send/i }));

    expect(await screen.findByText("Added it.")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Waiting for your approval" })).not.toBeInTheDocument();
  });
});
