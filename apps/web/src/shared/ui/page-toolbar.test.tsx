/**
 * The toolbar is load-bearing across four pages, so its contract is pinned
 * here rather than rediscovered through each page's tests.
 */
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RectangleI18nProvider, setRectangleLanguage } from "@/shared/i18n";
import { PageToolbar, type ToolbarFilter } from "./page-toolbar";

/** Mirrors how a page uses it: state lives outside, the toolbar reports changes. */
function Harness({ onSearch }: { onSearch?: (value: string) => void } = {}) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [mine, setMine] = useState(false);

  const filters: ToolbarFilter[] = [
    {
      id: "status",
      type: "select",
      label: "Status",
      anyLabel: "All statuses",
      value: status,
      options: [
        { value: "active", label: "Active" },
        { value: "closed", label: "Closed" },
      ],
      onChange: setStatus,
    },
    { id: "mine", type: "toggle", label: "My items", value: mine, onChange: setMine },
  ];

  return (
    <PageToolbar
      search={{
        value: search,
        onChange: (value) => { setSearch(value); onSearch?.(value); },
        label: "Search items",
      }}
      filters={filters}
      onClearFilters={() => { setSearch(""); setStatus(""); setMine(false); }}
    />
  );
}

function renderToolbar(props: Parameters<typeof Harness>[0] = {}) {
  return render(
    <RectangleI18nProvider>
      <Harness {...props} />
    </RectangleI18nProvider>,
  );
}

describe("PageToolbar", () => {
  beforeEach(async () => {
    await setRectangleLanguage("en");
  });

  it("keeps search on the bar rather than behind the filter button", () => {
    renderToolbar();
    // It is the most-used control here; a click to reach it is a click too many.
    expect(screen.getByLabelText("Search items")).toBeInTheDocument();
  });

  it("has no submit button, because the list filters as you type", async () => {
    const onSearch = vi.fn();
    const user = userEvent.setup();
    renderToolbar({ onSearch });

    await user.type(screen.getByLabelText("Search items"), "metro");

    expect(onSearch).toHaveBeenLastCalledWith("metro");
    expect(screen.queryByRole("button", { name: /^Search$/u })).not.toBeInTheDocument();
  });

  it("opens the filters in a window", async () => {
    const user = userEvent.setup();
    renderToolbar();

    await user.click(screen.getByRole("button", { name: /Filters/u }));
    const dialog = await screen.findByRole("dialog", { name: "Filters" });

    expect(within(dialog).getByLabelText("Status")).toBeInTheDocument();
    expect(within(dialog).getByRole("checkbox", { name: "My items" })).toBeInTheDocument();
  });

  it("applies a filter as it is chosen and keeps it after closing", async () => {
    const user = userEvent.setup();
    renderToolbar();

    await user.click(screen.getByRole("button", { name: /Filters/u }));
    const dialog = await screen.findByRole("dialog", { name: "Filters" });
    await user.selectOptions(within(dialog).getByLabelText("Status"), "active");
    await user.click(within(dialog).getByRole("button", { name: "Done" }));

    // Choosing is not a transaction; closing the window must not undo it.
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: /Remove filter: Status: Active/u })).toBeInTheDocument();
  });

  it("counts what is filtered, so the state survives the window closing", async () => {
    const user = userEvent.setup();
    renderToolbar();

    await user.click(screen.getByRole("button", { name: /Filters/u }));
    const dialog = await screen.findByRole("dialog", { name: "Filters" });
    await user.selectOptions(within(dialog).getByLabelText("Status"), "active");
    await user.click(within(dialog).getByRole("checkbox", { name: "My items" }));
    await user.click(within(dialog).getByRole("button", { name: "Done" }));

    // Otherwise a short list looks like missing data.
    const button = await screen.findByRole("button", { name: /Filters/u });
    expect(within(button).getByText("2")).toBeInTheDocument();
  });

  it("shows nothing at all when nothing is filtered", () => {
    renderToolbar();
    // An empty row of chips is furniture.
    expect(screen.queryByLabelText("Applied filters")).not.toBeInTheDocument();
  });

  it("removes a single filter from its chip", async () => {
    const user = userEvent.setup();
    renderToolbar();

    await user.click(screen.getByRole("button", { name: /Filters/u }));
    const dialog = await screen.findByRole("dialog", { name: "Filters" });
    await user.click(within(dialog).getByRole("checkbox", { name: "My items" }));
    await user.click(within(dialog).getByRole("button", { name: "Done" }));

    await user.click(await screen.findByRole("button", { name: /Remove filter: My items/u }));
    expect(screen.queryByLabelText("Applied filters")).not.toBeInTheDocument();
  });

  it("clears everything at once", async () => {
    const user = userEvent.setup();
    renderToolbar();

    await user.click(screen.getByRole("button", { name: /Filters/u }));
    const dialog = await screen.findByRole("dialog", { name: "Filters" });
    await user.selectOptions(within(dialog).getByLabelText("Status"), "closed");
    await user.click(within(dialog).getByRole("checkbox", { name: "My items" }));
    await user.click(within(dialog).getByRole("button", { name: "Done" }));

    await user.click(await screen.findByRole("button", { name: "Clear all" }));
    expect(screen.queryByLabelText("Applied filters")).not.toBeInTheDocument();
  });

  it("renders in Arabic when Arabic is active", async () => {
    await setRectangleLanguage("ar");
    renderToolbar();
    expect(screen.getByRole("button", { name: /التصفية/u })).toBeInTheDocument();
  });
});
