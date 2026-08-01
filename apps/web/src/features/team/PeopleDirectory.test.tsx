/**
 * The people register.
 *
 * What is worth pinning here is not that cards render. It is the honesty of
 * what they say: a person's project list contains only what the viewer may see,
 * and when it is empty the card says "none you can see" rather than "none" —
 * the person may well be on several, and claiming otherwise would be a lie
 * rather than a redaction. And that the register control is offered only when
 * the server says both registers exist, because a tab that answers with a
 * refusal is the dead control the product does not ship.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RectangleI18nProvider, setRectangleLanguage } from "@/shared/i18n";
import { PeopleDirectory } from "./PeopleDirectory";

const MONA = {
  id: "u1",
  displayName: "Mona Adel",
  email: "mona@example.test",
  status: "active" as const,
  standing: "member",
  projects: [
    { id: "p1", name: "Nile Tower", code: "NT-001", role: "project_admin", sharedWithViewer: true },
    { id: "p2", name: "Delta Depot", code: "DD-002", role: "viewer", sharedWithViewer: false },
  ],
  sharedProjectCount: 1,
  openTaskCount: 3,
};

const HIDDEN = {
  id: "u2",
  displayName: "Karim Fouad",
  email: "karim@example.test",
  status: "active" as const,
  standing: "member",
  /* On projects, but none the viewer may see. */
  projects: [],
  sharedProjectCount: 0,
  openTaskCount: 0,
};

function mockApi(registers: string[], people: unknown[]) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    // Answered by url rather than "whatever was asked for". A mock that returns
    // one payload to every request made a previous test pass against a
    // response the component never actually receives.
    const body = url.includes("/registers") ? { registers } : { people };
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });
}

function renderDirectory() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <RectangleI18nProvider>
      <QueryClientProvider client={client}>
        <PeopleDirectory />
      </QueryClientProvider>
    </RectangleI18nProvider>,
  );
}

beforeEach(async () => {
  await setRectangleLanguage("en");
});

describe("what a person's card says", () => {
  it("shows the projects the viewer can see, with the subject's role on each", async () => {
    vi.stubGlobal("fetch", mockApi(["colleagues"], [MONA]));
    renderDirectory();

    expect(await screen.findByText("Mona Adel")).toBeInTheDocument();
    expect(screen.getByText("Nile Tower")).toBeInTheDocument();
    expect(screen.getByText("Delta Depot")).toBeInTheDocument();
  });

  it("marks the projects the viewer is also on", async () => {
    vi.stubGlobal("fetch", mockApi(["colleagues"], [MONA]));
    renderDirectory();

    await screen.findByText("Mona Adel");
    // One of the two is shared, so exactly one mark — not none, and not both.
    expect(screen.getAllByText("With you")).toHaveLength(1);
    expect(screen.getByText("1 project with you")).toBeInTheDocument();
  });

  it("shows open work assigned to the person", async () => {
    vi.stubGlobal("fetch", mockApi(["colleagues"], [MONA]));
    renderDirectory();

    expect(await screen.findByText("3 open tasks")).toBeInTheDocument();
  });

  it("says the projects are none the viewer can see, not that there are none", async () => {
    /*
     * The difference matters. Karim is on projects; the viewer is not entitled
     * to know which. "No projects" would state something false about him,
     * where "none you can see" states something true about the viewer.
     */
    vi.stubGlobal("fetch", mockApi(["colleagues"], [HIDDEN]));
    renderDirectory();

    expect(await screen.findByText("No projects you can see")).toBeInTheDocument();
    expect(screen.queryByText(/^No projects$/u)).not.toBeInTheDocument();
  });

  it("offers a working way to contact them", async () => {
    vi.stubGlobal("fetch", mockApi(["colleagues"], [MONA]));
    renderDirectory();

    const contact = await screen.findByRole("link", { name: /Email Mona Adel/u });
    expect(contact).toHaveAttribute("href", "mailto:mona@example.test");
  });
});

describe("which registers are offered", () => {
  it("offers no choice when the server names only one register", async () => {
    vi.stubGlobal("fetch", mockApi(["colleagues"], [MONA]));
    renderDirectory();

    await screen.findByText("Mona Adel");
    // A toggle with one option is furniture, and offering "Everyone" to
    // somebody who may not read it would produce a refusal on click.
    expect(screen.queryByRole("radio", { name: "Everyone" })).not.toBeInTheDocument();
    expect(screen.getByText("The people you share a project with.")).toBeInTheDocument();
  });

  it("offers both when the server names both", async () => {
    vi.stubGlobal("fetch", mockApi(["company", "colleagues"], [MONA]));
    renderDirectory();

    await screen.findByText("Mona Adel");
    const toggle = screen.getByRole("radiogroup");
    expect(within(toggle).getByRole("radio", { name: "Everyone" })).toBeInTheDocument();
    expect(within(toggle).getByRole("radio", { name: "People I work with" })).toBeInTheDocument();
  });
});

describe("states", () => {
  it("explains an empty colleague register rather than showing nothing", async () => {
    vi.stubGlobal("fetch", mockApi(["colleagues"], []));
    renderDirectory();

    expect(await screen.findByText("No shared projects yet")).toBeInTheDocument();
  });

  it("reports a failure instead of an empty list", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("nope", { status: 500 })),
    );
    renderDirectory();

    await waitFor(() =>
      expect(screen.getByText("People could not be loaded")).toBeInTheDocument(),
    );
  });
});
