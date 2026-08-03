/**
 * The screen that lets a company declare separation-of-duties rules.
 *
 * These are written around what a mistake costs rather than around the happy
 * path. Declaring a pair can take access away from people who already hold
 * both, so the parts worth pinning are the ones that stop that happening by
 * accident: nothing is written before the cost has been shown, the choice of
 * which side to give up is never made for you, and a choice that would leave
 * somebody unable to reach anything is refused rather than applied.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthContext, type AuthContextValue } from "@/shared/auth";
import { RectangleI18nProvider, setRectangleLanguage } from "@/shared/i18n";
import { SeparationRules } from "./SeparationRules";
import { chooseOption } from "@/test/choose";

const permissions = {
  permissions: [
    { key: "users.edit", group: "users", label: "Edit people", description: "Change people." },
    { key: "user_types.create", group: "user_types", label: "Create user types", description: "Define a type." },
    { key: "settings.manage", group: "company", label: "Manage company settings", description: "Company config." },
  ],
};

const RULE = {
  id: "11111111-1111-4111-8111-111111111111",
  a: "user_types.create",
  b: "users.edit",
  reason: "Inventing a role and assigning it must not be one person's job.",
};

function violator(overrides: Record<string, unknown> = {}) {
  return {
    userId: "22222222-2222-4222-8222-222222222222",
    displayName: "Mona Adel",
    email: "mona@example.com",
    ...overrides,
  };
}

function json(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }),
  );
}

/** Routes each endpoint; `rules` and `preview` are what tests vary. */
function mockApi(options: { rules?: unknown[]; preview?: unknown[]; createStatus?: number; createBody?: unknown } = {}) {
  return vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
    const url = String(input);
    if (url.includes("separation-rules/preview")) {
      return json({ violators: options.preview ?? [] });
    }
    if (url.includes("separation-rules") && init?.method === "POST") {
      return json(options.createBody ?? { rule: RULE, strippedFrom: 0 }, options.createStatus ?? 201);
    }
    if (url.includes("separation-rules") && init?.method === "DELETE") {
      return Promise.resolve(new Response(null, { status: 204 }));
    }
    if (url.includes("separation-rules")) return json({ rules: options.rules ?? [] });
    return json(permissions);
  });
}

const settingsAdmin: AuthContextValue = {
  setupRequired: false,
  loading: false,
  refresh: async () => undefined,
  user: { tenantId: "1", userId: "2", roles: ["none"], permissions: ["settings.manage"] },
};

function renderRules(auth: AuthContextValue = settingsAdmin) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <RectangleI18nProvider>
        <AuthContext.Provider value={auth}>
          <SeparationRules />
        </AuthContext.Provider>
      </RectangleI18nProvider>
    </QueryClientProvider>,
  );
}

describe("SeparationRules", () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    await setRectangleLanguage("en");
  });

  it("refuses somebody who may not manage company settings", async () => {
    /*
     * Asked by the component rather than left to the section hosting it. The
     * host hides it today, but a component that only behaves while its parent
     * remembers to gate it is one refactor away from being reachable.
     */
    const fetchMock = mockApi({ rules: [RULE] });
    renderRules({
      ...settingsAdmin,
      user: { tenantId: "1", userId: "3", roles: ["none"], permissions: ["users.read"] },
    });

    expect(await screen.findByText(/do not have access/iu)).toBeInTheDocument();
    // And it does not ask the server for data it has no business showing.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("explains what the control is for when nothing is declared yet", async () => {
    /*
     * Almost nobody arrives here knowing the term, and a control nobody
     * understands is one nobody switches on. The empty state carries the
     * explanation because that is the moment somebody needs it.
     */
    mockApi();
    renderRules();
    expect(await screen.findByText(/No pairs separated yet/iu)).toBeInTheDocument();
    expect(screen.getByText(/never sit with the same person/iu)).toBeInTheDocument();
  });

  it("lists a declared rule with both permissions and the reason", async () => {
    mockApi({ rules: [RULE] });
    renderRules();

    // Scoped to the list: the same labels appear in the pickers below, and a
    // bare text query would match those instead and prove nothing.
    const list = await screen.findByRole("list", { name: /Separated permission pairs/iu });
    expect(within(list).getByText("Create user types")).toBeInTheDocument();
    expect(within(list).getByText("Edit people")).toBeInTheDocument();
    expect(within(list).getByText(/must not be one person's job/iu)).toBeInTheDocument();
  });

  it("shows a loading state, then an error state that can be retried", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(() => json({ message: "nope" }, 500));
    renderRules();
    expect(await screen.findByText(/could not be loaded/iu)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Try again/iu })).toBeInTheDocument();
  });

  it("never offers the same permission on both sides", async () => {
    // A permission cannot conflict with itself, and offering it invites an
    // error the server would only refuse after the fact.
    const user = userEvent.setup();
    mockApi();
    renderRules();

    await chooseOption(user, await screen.findByLabelText(/First permission/iu), "users.edit");

    /*
     * The list has to be open to be read. The options are no longer inside the
     * closed control: the dropdown renders its rows in a portalled listbox, so
     * asking the trigger what it offers is asking the wrong element. Opening it
     * is also what a person does before they can see the same thing.
     */
    await user.click(screen.getByLabelText(/Second permission/iu));
    const list = await screen.findByRole("listbox");

    expect(within(list).queryByRole("option", { name: "Edit people" })).not.toBeInTheDocument();
    expect(within(list).getByRole("option", { name: "Create user types" })).toBeInTheDocument();
  });

  it("will not save before the cost has been checked", async () => {
    /*
     * The whole point of the flow. Saving straight from the form would mean
     * access disappearing from people the administrator never saw.
     */
    const user = userEvent.setup();
    mockApi();
    renderRules();

    await chooseOption(user, await screen.findByLabelText(/First permission/iu), "users.edit");
    await chooseOption(user, screen.getByLabelText(/Second permission/iu), "user_types.create");
    await user.type(screen.getByLabelText(/Why these must stay apart/iu), "A sufficiently long reason.");

    expect(screen.queryByRole("button", { name: /Add rule/iu })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Check who this affects/iu })).toBeInTheDocument();
  });

  it("says plainly when nobody is affected", async () => {
    const user = userEvent.setup();
    mockApi({ preview: [] });
    renderRules();

    await chooseOption(user, await screen.findByLabelText(/First permission/iu), "users.edit");
    await chooseOption(user, screen.getByLabelText(/Second permission/iu), "user_types.create");
    await user.click(screen.getByRole("button", { name: /Check who this affects/iu }));

    expect(await screen.findByText(/Nobody currently holds both/iu)).toBeInTheDocument();
  });

  it("names who is affected and refuses to guess which side they give up", async () => {
    const user = userEvent.setup();
    mockApi({ preview: [violator()] });
    renderRules();

    await chooseOption(user, await screen.findByLabelText(/First permission/iu), "users.edit");
    await chooseOption(user, screen.getByLabelText(/Second permission/iu), "user_types.create");
    await user.type(screen.getByLabelText(/Why these must stay apart/iu), "A sufficiently long reason.");
    await user.click(screen.getByRole("button", { name: /Check who this affects/iu }));

    expect(await screen.findByText("Mona Adel")).toBeInTheDocument();
    // Which permission a company gives up is the decision this screen exists
    // to make; a preselected default would be answering it for them.
    expect((screen.getByLabelText(/Which permission should they give up/iu) as HTMLSelectElement).value).toBe("");
    expect(screen.getByRole("button", { name: /Add rule/iu })).toBeDisabled();
  });

  it("shows what each person actually loses once a side is chosen", async () => {
    const user = userEvent.setup();
    mockApi({ preview: [violator()] });
    renderRules();

    await chooseOption(user, await screen.findByLabelText(/First permission/iu), "users.edit");
    await chooseOption(user, screen.getByLabelText(/Second permission/iu), "user_types.create");
    await user.type(screen.getByLabelText(/Why these must stay apart/iu), "A sufficiently long reason.");
    await user.click(screen.getByRole("button", { name: /Check who this affects/iu }));

    await chooseOption(user, await screen.findByLabelText(/Which permission should they give up/iu),
      "users.edit",
    );
    // The permission itself is what comes off the person now, so the sentence
    // names it rather than naming a bundle that no longer grants anything.
    expect(screen.getByText(/Loses Edit people/iu)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Add rule/iu })).toBeEnabled();
  });

  it("offers both sides, because neither can strip somebody bare any more", async () => {
    /*
     * A side used to be disabled when giving it up would have taken away
     * somebody's only bundle and left them with an account that reaches
     * nothing. Revoking one permission cannot do that, so the refusal and the
     * disabled option both went with the reason for them.
     */
    const user = userEvent.setup();
    mockApi({ preview: [violator()] });
    renderRules();

    await chooseOption(user, await screen.findByLabelText(/First permission/iu), "users.edit");
    await chooseOption(user, screen.getByLabelText(/Second permission/iu), "user_types.create");
    await user.click(screen.getByRole("button", { name: /Check who this affects/iu }));

    await user.click(await screen.findByLabelText(/Which permission should they give up/iu));
    const list = await screen.findByRole("listbox");

    /*
     * `toBeEnabled` is for form controls; a listbox row is not one, and it
     * would pass on any element that simply has no `disabled` attribute —
     * including one the component had marked unavailable. The dropdown states
     * that with `aria-disabled`, so that is what is asserted, and the check can
     * still fail for the right reason.
     */
    for (const option of within(list).getAllByRole("option")) {
      expect(option).not.toHaveAttribute("aria-disabled", "true");
    }
  });

  it("reads back the server's refusal by name rather than as a raw error", async () => {
    const user = userEvent.setup();
    mockApi({
      preview: [violator()],
      createStatus: 400,
      /* The envelope the API actually sends: everything under `error`. */
      createBody: {
        error: {
          code: "CONFLICT",
          message: "This pair is already separated.",
        },
      },
    });
    renderRules();

    await chooseOption(user, await screen.findByLabelText(/First permission/iu), "users.edit");
    await chooseOption(user, screen.getByLabelText(/Second permission/iu), "user_types.create");
    await user.type(screen.getByLabelText(/Why these must stay apart/iu), "A sufficiently long reason.");
    await user.click(screen.getByRole("button", { name: /Check who this affects/iu }));
    await chooseOption(
      user,
      await screen.findByLabelText(/Which permission should they give up/iu),
      "users.edit",
    );
    await user.click(screen.getByRole("button", { name: /Add rule/iu }));

    /*
     * The server's own sentence, not a generic failure. It used to also send a
     * list of people a rule could not be applied to, because stripping a bundle
     * could leave somebody with nothing; revoking a single permission cannot,
     * so that refusal and the branch that rendered it are both gone.
     */
    expect(await screen.findByRole("alert")).toHaveTextContent(/already separated/iu);
  });

  it("asks before removing a rule, because that removes a control", async () => {
    const user = userEvent.setup();
    const fetchMock = mockApi({ rules: [RULE] });
    renderRules();

    await user.click(await screen.findByRole("button", { name: /Remove the rule separating/iu }));
    expect(await screen.findByRole("dialog", { name: /Remove this rule/iu })).toBeInTheDocument();

    const dialog = screen.getByRole("dialog", { name: /Remove this rule/iu });
    await user.click(within(dialog).getByRole("button", { name: "Remove" }));

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(
          ([, init]) => (init as RequestInit | undefined)?.method === "DELETE",
        ),
      ).toBe(true);
    });
  });

  it("says that removing a rule does not hand back what it took", async () => {
    // Access removed for a reason should be granted back deliberately. The
    // dialog has to say so, or somebody will assume the opposite.
    const user = userEvent.setup();
    mockApi({ rules: [RULE] });
    renderRules();

    await user.click(await screen.findByRole("button", { name: /Remove the rule separating/iu }));
    expect(await screen.findByText(/not given back/iu)).toBeInTheDocument();
  });
});
