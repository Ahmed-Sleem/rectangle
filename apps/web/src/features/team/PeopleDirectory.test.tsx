/**
 * The people register.
 *
 * What is worth pinning is the honesty of a row and the gating of its actions.
 * A person's project list contains only what the viewer may see, and when it is
 * empty the card says "none you can see" rather than "none" — the person may
 * well be on several, and claiming otherwise would be a false statement about
 * them rather than a redaction for the reader. The administrative actions are
 * absent, never disabled, for somebody who may not perform them.
 */
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RectangleI18nProvider, setRectangleLanguage } from "@/shared/i18n";
import { PeopleDirectory } from "./PeopleDirectory";
import type { DirectoryPerson } from "./directory-api";

const MONA: DirectoryPerson = {
  id: "u1",
  displayName: "Mona Adel",
  email: "mona@example.test",
  status: "active",
  standing: "member",
  projects: [
    { id: "p1", name: "Nile Tower", code: "NT-001", role: "project_admin", sharedWithViewer: true },
    { id: "p2", name: "Delta Depot", code: "DD-002", role: "viewer", sharedWithViewer: false },
  ],
  sharedProjectCount: 1,
  openTaskCount: 3,
  userTypes: [{ id: "t1", name: "Project office", key: "project_manager" }],
};

/** On projects, but none this viewer is entitled to know about. */
const HIDDEN: DirectoryPerson = {
  id: "u2",
  displayName: "Karim Fouad",
  email: "karim@example.test",
  status: "active",
  standing: "member",
  projects: [],
  sharedProjectCount: 0,
  openTaskCount: 0,
  userTypes: [],
};

function renderDirectory(overrides: Partial<Parameters<typeof PeopleDirectory>[0]> = {}) {
  const props = {
    people: [MONA],
    view: "cards" as const,
    canEdit: false,
    canDisable: false,
    onEdit: vi.fn(),
    onDisable: vi.fn(),
    onEnable: vi.fn(),
    roleName: (type: { name: string }) => type.name,
    ...overrides,
  };
  render(
    <RectangleI18nProvider>
      <PeopleDirectory {...props} />
    </RectangleI18nProvider>,
  );
  return props;
}

beforeEach(async () => {
  await setRectangleLanguage("en");
});

describe("what a person's row says", () => {
  it("shows the projects the viewer can see, with the subject's role on each", () => {
    renderDirectory();

    expect(screen.getByText("Mona Adel")).toBeInTheDocument();
    expect(screen.getByText("Nile Tower")).toBeInTheDocument();
    expect(screen.getByText("Delta Depot")).toBeInTheDocument();
  });

  it("marks only the projects the viewer is also on", () => {
    renderDirectory();

    // One of the two is shared, so exactly one mark — not none, and not both.
    expect(screen.getAllByText("With you")).toHaveLength(1);
    expect(screen.getByText("1 project with you")).toBeInTheDocument();
  });

  it("shows open work assigned to the person", () => {
    renderDirectory();

    expect(screen.getByText("3 open tasks")).toBeInTheDocument();
  });

  it("says the projects are none the viewer can see, not that there are none", () => {
    renderDirectory({ people: [HIDDEN] });

    expect(screen.getByText("No projects you can see")).toBeInTheDocument();
    expect(screen.queryByText(/^No projects$/u)).not.toBeInTheDocument();
  });

  it("names the user types a person holds", () => {
    // The administrative half of the row, which used to live in a separate
    // list of the same people.
    renderDirectory();

    expect(screen.getByText("Project office")).toBeInTheDocument();
  });
});

describe("administrative actions", () => {
  it("offers none to somebody who may not administer people", () => {
    renderDirectory();

    expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Disable" })).not.toBeInTheDocument();
  });

  it("offers editing to somebody who may edit", async () => {
    const user = userEvent.setup();
    const props = renderDirectory({ canEdit: true });

    await user.click(screen.getByRole("button", { name: "Edit" }));
    expect(props.onEdit).toHaveBeenCalledWith(MONA);
  });

  it("offers disabling for an active person and enabling for a disabled one", async () => {
    const user = userEvent.setup();
    const props = renderDirectory({ canDisable: true });
    await user.click(screen.getByRole("button", { name: "Disable" }));
    expect(props.onDisable).toHaveBeenCalledWith(MONA);

    const disabled = renderDirectory({
      canDisable: true,
      people: [{ ...MONA, status: "disabled" }],
    });
    await user.click(screen.getAllByRole("button", { name: "Enable" })[0]!);
    expect(disabled.onEnable).toHaveBeenCalled();
  });

  it("offers a working way to contact somebody it offers actions for", () => {
    renderDirectory({ canEdit: true });

    expect(screen.getByRole("link", { name: /Email Mona Adel/u })).toHaveAttribute(
      "href",
      "mailto:mona@example.test",
    );
  });
});

describe("the table view", () => {
  it("carries the same facts as the cards", () => {
    renderDirectory({ view: "table" });

    const table = screen.getByRole("table");
    expect(within(table).getByText("Mona Adel")).toBeInTheDocument();
    expect(within(table).getByText("Project office")).toBeInTheDocument();
    // Projects are shown by code in the table, where space is tighter.
    expect(within(table).getByText(/NT-001/u)).toBeInTheDocument();
  });
});
