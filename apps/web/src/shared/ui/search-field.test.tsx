/**
 * Search is the control users most expect to recognise on sight, so its
 * affordances and sizing are pinned here rather than left to each page.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { RectangleI18nProvider } from "@/shared/i18n";
import { FilterBar, FilterSelect, SearchField } from "./search-field";
import uiCss from "./ui.css?raw";
import tokensCss from "@/shared/styles/tokens.css?raw";

function Harness({ onSubmit }: { onSubmit?: () => void } = {}) {
  const [value, setValue] = useState("");
  return (
    <RectangleI18nProvider>
      <SearchField
        label="Search projects"
        placeholder="Name, code, or location"
        value={value}
        onChange={setValue}
        {...(onSubmit ? { onSubmit, submitLabel: "Search" } : {})}
      />
    </RectangleI18nProvider>
  );
}

describe("SearchField", () => {
  it("looks like a search control without needing a written explanation", () => {
    render(<Harness />);

    // A landmark plus the universal magnifier is what makes search recognisable.
    expect(screen.getByRole("search")).toBeInTheDocument();
    const input = screen.getByRole("searchbox", { name: "Search projects" });
    expect(input).toHaveAttribute("type", "search");
    expect(input).toHaveAttribute("placeholder", "Name, code, or location");

    const icon = document.querySelector(".rect-search__icon");
    expect(icon).not.toBeNull();
    // Decorative: the field already carries the accessible name.
    expect(icon).toHaveAttribute("aria-hidden", "true");
  });

  it("offers a way to clear the query only once there is one", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    expect(screen.queryByRole("button", { name: /clear/i })).not.toBeInTheDocument();

    await user.type(screen.getByRole("searchbox"), "metro");
    const clear = screen.getByRole("button", { name: /clear/i });
    await user.click(clear);

    expect(screen.getByRole("searchbox")).toHaveValue("");
  });

  it("submits on Enter and from the button, for users who expect either", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<Harness onSubmit={onSubmit} />);

    await user.type(screen.getByRole("searchbox"), "metro{Enter}");
    expect(onSubmit).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "Search" }));
    expect(onSubmit).toHaveBeenCalledTimes(2);
  });

  it("keeps the search field from stretching across the page", () => {
    const block = uiCss.slice(
      uiCss.indexOf(".rect-search__field {"),
      uiCss.indexOf(".rect-search__icon {"),
    );
    // Amazon-style: a search box that spans the full width loses its shape and
    // stops reading as a discrete control.
    expect(block).toContain("var(--rect-field-width-search)");
    expect(block).not.toContain("width: 100%");
  });
});

describe("FilterSelect", () => {
  it("exposes an accessible name and a capped width", () => {
    render(
      <FilterBar>
        <FilterSelect label="Filter by status" width="sm">
          <option value="">All statuses</option>
        </FilterSelect>
      </FilterBar>,
    );

    expect(screen.getByRole("combobox", { name: "Filter by status" })).toBeInTheDocument();

    // Width should hint at the longest option rather than fill the row.
    for (const size of ["sm", "md", "lg"]) {
      expect(uiCss).toContain(`.rect-filter-select--${size} { width: var(--rect-field-width-${size}); }`);
    }
    expect(uiCss.slice(uiCss.indexOf(".rect-filter-select {"))).toContain("flex: 0 0 auto");
  });

  it("defines the control width tokens it depends on", () => {
    for (const token of [
      "--rect-field-width-sm",
      "--rect-field-width-md",
      "--rect-field-width-lg",
      "--rect-field-width-search",
    ]) {
      expect(tokensCss).toContain(`${token}:`);
    }
  });
});
