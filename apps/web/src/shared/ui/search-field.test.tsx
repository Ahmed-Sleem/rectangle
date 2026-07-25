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
    // The width lives on the form, which is the toolbar's flex item.
    const block = uiCss.slice(
      uiCss.indexOf("\n.rect-search {"),
      uiCss.indexOf("\n.rect-search:focus-within"),
    );
    // Amazon-style: a search box that spans the full width loses its shape and
    // stops reading as a discrete control. `max-width: 100%` is the opposite —
    // a cap that stops it exceeding the row — so only a set width is forbidden.
    expect(block).toContain("var(--rect-field-width-search)");
    expect(block).not.toMatch(/(?<!max-)width:\s*100%/);
    expect(block).toContain("max-width: 100%");
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

describe("search focus behaviour", () => {
  it("expands on focus from the element the toolbar actually sizes", () => {
    const form = uiCss.slice(uiCss.indexOf("\n.rect-search {"), uiCss.indexOf("\n.rect-search:focus-within"));

    // The <form> is the toolbar's flex item. Animating a nested child instead
    // leaves the form fixed at its old content width, so nothing moves — which
    // is exactly why the first attempt at this had no visible effect.
    expect(form).toContain("flex-basis: var(--rect-search-width");
    expect(form).toContain("transition: flex-basis");

    const focused = uiCss.slice(
      uiCss.indexOf("\n.rect-search:focus-within {"),
      uiCss.indexOf("\n.rect-search__field {"),
    );
    expect(focused).toContain("--rect-search-width: var(--rect-field-width-search-focus)");

    // The inner field simply fills whatever width the form was given, so there
    // is only ever one animation running.
    const field = uiCss.slice(uiCss.indexOf("\n.rect-search__field {"), uiCss.indexOf("\n.rect-search__icon {"));
    expect(field).toContain("flex: 1 1 auto");
    expect(field).not.toContain("transition");
  });

  it("animates back at the same speed it opened", () => {
    // One transition on one property covers both directions, so returning to
    // rest is as smooth as expanding.
    const form = uiCss.slice(uiCss.indexOf("\n.rect-search {"), uiCss.indexOf("\n.rect-search:focus-within"));
    expect(form).toContain("var(--rect-duration-search)");
    expect(tokensCss).toMatch(/--rect-duration-search:\s*\d+ms/);
  });

  it("draws focus indicators inside the control so containers cannot clip them", () => {
    const tokens = tokensCss;
    // An outward ring is sliced by any ancestor with overflow hidden or clip.
    expect(tokens).toContain("--rect-shadow-focus: inset 0 0 0");
    expect(tokens).not.toMatch(/--rect-shadow-toggle:[^;]*[^t]\s0 0 0 1px/);
  });
});

describe("engaged controls", () => {
  it("darkens the border of an engaged control instead of adding one", () => {
    // A light grey boundary fails WCAG 1.4.11 against the card surface, and it
    // also reads as "nothing happened". The chrome's own near-black does not.
    expect(tokensCss).toContain("--rect-border-active: var(--rect-color-ink-strong)");
    expect(tokensCss).toContain("--rect-toggle-border-hover: var(--rect-border-active)");
    expect(tokensCss).not.toContain("--rect-toggle-border-hover: var(--rect-color-faint)");
  });

  it("uses one token for every engaged surface", () => {
    // Section open, emphasised stat, focused input all share the same border so
    // a theme change moves them together.
    for (const selector of [".rect-section--open", ".rect-stat--emphasis"]) {
      const block = uiCss.slice(uiCss.indexOf(`${selector} {`), uiCss.indexOf(`${selector} {`) + 120);
      expect(block, `${selector} must use the shared active border`).toContain("var(--rect-border-active)");
    }
  });
});
