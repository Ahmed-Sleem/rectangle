/**
 * Locks the main canvas presentation contract defined in design/UI_RULES.md.
 * These assertions must keep passing as feature pages are added.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RectangleI18nProvider } from "@/shared/i18n";
import ShellEmptyState from "./ShellEmptyState";

// Raw source imports keep this suite browser-typed (no node:fs) while still
// letting us assert on the shipped CSS/token contract.
import tokensCss from "@/shared/styles/tokens.css?raw";
import uiCss from "@/shared/ui/ui.css?raw";
import shellCss from "./shell.css?raw";
import aiPanelCss from "./ai/ai-panel.css?raw";
import projectsCss from "@/features/projects/ProjectsPage.css?raw";
import teamCss from "@/features/team/TeamPage.css?raw";
import settingsCss from "@/features/settings/SettingsPage.css?raw";
import readyGateCss from "@/app/app-ready-gate.css?raw";
import setupCss from "@/features/setup/setup-page.css?raw";
import mainPanelSource from "./MainPanel.tsx?raw";
import projectsSource from "@/features/projects/ProjectsPage.tsx?raw";
import globalCss from "@/shared/styles/global.css?raw";
import teamSource from "@/features/team/TeamPage.tsx?raw";
import settingsSource from "@/features/settings/SettingsPage.tsx?raw";
import toolbarCss from "@/shared/ui/page-toolbar.css?raw";
import searchInputCss from "@/shared/ui/search-input.css?raw";
import resourcesSource from "@/shared/i18n/resources.ts?raw";

describe("canvas empty state", () => {
  it("shows user-facing copy without internal identifiers or build wording", async () => {
    render(
      <RectangleI18nProvider>
        <ShellEmptyState featureId="overview" title="Overview" />
      </RectangleI18nProvider>,
    );

    expect(
      // The translated feature name is shown, not the English prop fallback.
      await screen.findByRole("heading", { level: 2, name: "Today" }),
    ).toBeInTheDocument();
    expect(screen.getByText("No records to show here yet.")).toBeInTheDocument();

    // The raw feature id must never be rendered to end users.
    expect(screen.queryByText("overview", { exact: true })).not.toBeInTheDocument();
  });
});

describe("user-facing wording", () => {
  const forbidden = [
    "not implemented",
    "ui shell",
    "no fake data",
    "backend pending",
    "audit pending",
    "validation contract",
    "coming soon",
    "todo",
    "tbd",
  ];

  it("keeps developer/internal wording out of translated strings", () => {
    const resources = resourcesSource.toLowerCase();
    for (const phrase of forbidden) {
      expect(resources, `resources.ts contains banned wording "${phrase}"`).not.toContain(phrase);
    }
  });
});

describe("canvas layout contract", () => {
  it("keeps the page title in sentence case for Arabic correctness", () => {
    const start = shellCss.indexOf(".rect-panel__title {");
    const titleBlock = shellCss.slice(start, start + 320);
    expect(titleBlock).not.toContain("text-transform: uppercase");
    expect(titleBlock).toContain("var(--rect-text-page)");
  });

  it("scrolls the canvas body while keeping scrollbars hidden", () => {
    const bodyBlock = shellCss.slice(
      shellCss.indexOf(".rect-panel__body {"),
      shellCss.indexOf(".rect-panel__content {"),
    );
    expect(bodyBlock).toContain("overflow-y: auto");
    /*
     * Hidden scrollbars require a visible overflow affordance instead. It used
     * to be a mask on this element, which also faded anything sticky inside it
     * — including the pinned toolbar. It is now a pair of overlay layers, so
     * both can be true at once.
     */
    expect(bodyBlock).not.toContain("mask-image");

    // The fade must be driven by scroll position, so a page that fits on screen
    // is never dimmed at an edge that has nothing beyond it.
    // Only the bottom edge fades here now; the toolbar owns the top one, and
    // the attribute that drives it still has to be published.
    expect(bodyBlock).toContain("--rect-fade-bottom: 0px");
    // The switch lives outside the base block, so it is matched on the sheet.
    expect(shellCss).toContain('[data-scroll-bottom="false"]');
    expect(mainPanelSource).toContain("data-scroll-top");
    expect(mainPanelSource).toContain("data-scroll-bottom");
  });

  it("renders feature content inside the shared content column", () => {
    expect(mainPanelSource).toContain("rect-panel__content");
    expect(shellCss).toContain("--rect-canvas-content-max");
  });
});

describe("design token discipline", () => {
  it("defines the mandatory spacing, control, table and type tokens", () => {
    for (const token of [
      "--rect-space-2",
      "--rect-space-4",
      "--rect-control-compact",
      "--rect-control-standard",
      "--rect-control-touch",
      "--rect-table-row-dense",
      "--rect-text-body",
      "--rect-text-page",
      "--rect-weight-bold",
      "--rect-radius-lg",
    ]) {
      expect(tokensCss).toContain(`${token}:`);
    }
  });

  it("only uses Inter weights that are actually loaded", () => {
    const loaded = new Set(["400", "500", "600", "700", "900"]);
    const sources: Array<[string, string]> = [
      ["ui.css", uiCss],
      ["shell.css", shellCss],
      ["ai-panel.css", aiPanelCss],
      ["ProjectsPage.css", projectsCss],
      ["TeamPage.css", teamCss],
      ["SettingsPage.css", settingsCss],
      ["app-ready-gate.css", readyGateCss],
      ["setup-page.css", setupCss],
    ];

    for (const [name, source] of sources) {
      for (const match of source.matchAll(/font-weight:\s*(\d{3})/g)) {
        const weight = match[1] ?? "";
        expect(loaded.has(weight), `${name} uses unloaded font-weight ${weight}`).toBe(true);
      }
    }
  });

  it("has no untokenized font sizes anywhere in the app", () => {
    const sources: Array<[string, string]> = [
      ["ui.css", uiCss],
      ["shell.css", shellCss],
      ["ai-panel.css", aiPanelCss],
      ["ProjectsPage.css", projectsCss],
      ["TeamPage.css", teamCss],
      ["SettingsPage.css", settingsCss],
      ["app-ready-gate.css", readyGateCss],
      ["setup-page.css", setupCss],
    ];

    for (const [name, source] of sources) {
      const raw = [...source.matchAll(/font-size:\s*([0-9.]+(?:rem|px|em))/g)].map((m) => m[1]);
      expect(raw, `${name} has untokenized font-size values: ${raw.join(", ")}`).toEqual([]);
    }
  });

  it("expands controls to a touch target on coarse pointers", () => {
    expect(uiCss).toContain("@media (pointer: coarse)");
    expect(uiCss).toContain("var(--rect-control-touch)");
  });
});

describe("shared building blocks", () => {
  const featureSources: Array<[string, string]> = [
    ["ProjectsPage.tsx", projectsSource],
    ["TeamPage.tsx", teamSource],
    ["SettingsPage.tsx", settingsSource],
  ];

  it("routes every feature window through the shared overlay system", () => {
    for (const [name, source] of featureSources) {
      // A feature that builds its own backdrop or dialog re-introduces the
      // sizing and containment bugs the overlay exists to solve.
      expect(source, `${name} hand-rolls a backdrop`).not.toContain("rect-ui-modal-backdrop");
      expect(source, `${name} hand-rolls a dialog role`).not.toContain('role="dialog"');
      expect(source, `${name} sets its own overlay z-index`).not.toContain("z-index");
    }
  });

  it("builds configuration surfaces from the shared section blocks", () => {
    // <details>/<summary> hides its marker to match the design, which leaves no
    // expand/collapse affordance. Sections must come from SettingsSection.
    expect(settingsSource).not.toContain("<details");
    expect(settingsSource).not.toContain("<summary");
    expect(settingsSource).toContain("SettingsSection");
  });

  it("keeps the removed modal primitive from creeping back", () => {
    expect(uiCss).not.toContain(".rect-ui-modal-backdrop");
    for (const [name, source] of featureSources) {
      expect(source, `${name} imports the retired Modal primitive`).not.toMatch(/\bModal\b/);
    }
  });
});

describe("motion tokens", () => {
  it("never puts a duration-bearing token in an animation shorthand", () => {
    // In `animation`, the second <time> is the delay. A --rect-motion-* token
    // carries its own duration, so it silently becomes a delay and the motion
    // reads as sluggish rather than broken.
    for (const [name, source] of [
      ["ui.css", uiCss],
      ["shell.css", shellCss],
      ["ai-panel.css", aiPanelCss],
      ["app-ready-gate.css", readyGateCss],
    ] as Array<[string, string]>) {
      const offenders = [...source.matchAll(/animation:[^;]*var\(--rect-motion-[^)]*\)[^;]*;/g)].map(
        (match) => match[0].trim(),
      );
      expect(offenders, `${name} uses a duration token inside an animation shorthand`).toEqual([]);
    }
  });

  it("keeps overlay motion fast enough to feel immediate", () => {
    const read = (token: string) => {
      const match = tokensCss.match(new RegExp(`${token}:\\s*(\\d+)ms`));
      return match?.[1] ? Number(match[1]) : Number.NaN;
    };

    // Past roughly 150ms a window reads as waiting: the user has already acted.
    expect(read("--rect-duration-overlay")).toBeLessThanOrEqual(150);
    expect(read("--rect-duration-overlay-scrim")).toBeLessThanOrEqual(150);
  });

  it("never delays an overlay animation", () => {
    const overlayBlock = uiCss.slice(
      uiCss.indexOf(".rect-overlay {"),
      uiCss.indexOf(".rect-overlay__form"),
    );
    expect(overlayBlock).not.toContain("animation-delay");
  });
});

describe("nested spacing", () => {
  function gapOf(css: string, selector: string): string | null {
    const start = css.indexOf(`${selector} {`);
    if (start === -1) return null;
    const block = css.slice(start, css.indexOf("}", start));
    const match = block.match(/gap:\s*([^;]+);/);
    return match?.[1]?.trim() ?? null;
  }

  const step = (token: string | null): number => {
    const match = token?.match(/--rect-space-(\d+)/);
    return match?.[1] ? Number(match[1]) : Number.NaN;
  };

  it("tightens the gap at each level of the settings hierarchy", () => {
    const section = step(gapOf(uiCss, ".rect-section__content"));
    const form = step(gapOf(settingsCss, ".rect-settings-form"));
    const stacked = step(gapOf(uiCss, ".rect-setting-row--stacked"));
    const field = step(gapOf(uiCss, ".rect-ui-field"));

    // Gaps must shrink as they nest. Equal gaps at every level compound into
    // one large void instead of communicating structure.
    expect(section).toBeLessThanOrEqual(3);
    expect(stacked).toBeLessThan(form);
    expect(field).toBeLessThan(stacked);
  });
});

describe("layout containment", () => {
  it("centres the canvas content so side margins stay equal", () => {
    const block = shellCss.slice(
      shellCss.indexOf(".rect-panel__content {"),
      shellCss.indexOf(".rect-panel__content {") + 400,
    );
    // A flex child narrower than its parent aligns to the start, piling all the
    // leftover space onto one side.
    expect(block).toContain("margin-inline: auto");
  });

  it("keeps content off the clipped scroll edge", () => {
    const block = shellCss.slice(
      shellCss.indexOf(".rect-panel__body {"),
      shellCss.indexOf(".rect-panel__content {"),
    );
    // overflow-x clips at the border box, which would slice a focus ring off a
    // control sitting flush against the edge.
    expect(block).toContain("overflow-x: hidden");
    expect(block).toContain("padding-inline:");
  });

  it("never leaves a row flex-basis on a column-direction row", () => {
    // flex-basis resolves along the main axis, so a basis meant as a width
    // silently becomes a height once the container switches to a column.
    const rowText = uiCss.slice(
      uiCss.indexOf(".rect-setting-row__text {"),
      uiCss.indexOf(".rect-setting-row__label {"),
    );
    expect(rowText).toContain("flex: 1 1 220px");

    const stackedText = uiCss.slice(
      uiCss.indexOf(".rect-setting-row--stacked .rect-setting-row__text"),
      uiCss.indexOf(".rect-setting-row--stacked .rect-setting-row__control"),
    );
    expect(stackedText, "stacked rows must reset the row flex-basis").toContain("flex: 0 0 auto");
  });

  it("wraps the toolbar row rather than letting it overflow the canvas", () => {
    const row = toolbarCss.slice(
      toolbarCss.indexOf(".rect-toolbar__row {"),
      toolbarCss.indexOf(".rect-toolbar__spacer"),
    );
    // Controls fall to a second line instead of pushing past the edge.
    expect(row).toContain("flex-wrap: wrap");
  });

  it("keeps the view toggle against the trailing edge", () => {
    const spacer = toolbarCss.slice(
      toolbarCss.indexOf(".rect-toolbar__spacer {"),
      toolbarCss.indexOf(".rect-toolbar__search {"),
    );
    // The spacer is what pins the toggle to the edge on every page at once.
    expect(spacer).toContain("flex: 1 1 auto");
  });
});

describe("focus indicators", () => {
  it("draws the ring inside the element so containers cannot clip it", () => {
    // Most scroll areas and every window clip their overflow, so an outward ring
    // gets sliced. Drawing it inside is the only placement that always survives.
    expect(tokensCss).toContain("--rect-shadow-focus: inset 0 0 0");
    expect(globalCss).toContain("box-shadow: var(--rect-shadow-focus)");
    expect(globalCss).not.toMatch(/outline-offset:\s*[1-9]/);
  });

  it("keeps a real outline for forced-colours modes", () => {
    // Forced-colours discards box-shadow entirely; an outline is the only
    // indicator those users will see.
    expect(globalCss).toContain("outline: var(--rect-focus-ring-width) solid transparent");
    expect(globalCss).toContain("forced-colors: active");
  });

  it("never uses an outward ring on a control's resting shadow", () => {
    const toggle = tokensCss.match(/--rect-shadow-toggle:[^;]+;/)?.[0] ?? "";
    expect(toggle).toContain("inset 0 0 0 1px");
  });

  it("collapses the header search to its icon until it is wanted", () => {
    const collapsed = shellCss.slice(
      shellCss.indexOf(".rect-panel__search {"),
      shellCss.indexOf(".rect-panel__search:hover"),
    );
    // Anything permanent in the header has to earn its width.
    expect(collapsed).toContain("inline-size: var(--rect-control-compact)");

    const expanded = shellCss.slice(
      shellCss.indexOf(".rect-panel__search:hover"),
      shellCss.indexOf(".rect-panel__search-text {"),
    );
    expect(expanded).toContain("inline-size: var(--rect-field-width-search-collapsed)");
  });

  it("keeps the header search labelled for assistive technology while collapsed", () => {
    const label = shellCss.slice(
      shellCss.indexOf(".rect-panel__search-text {"),
      shellCss.indexOf(".rect-panel__search:hover .rect-panel__search-text"),
    );
    // `display: none` would strip it from the accessible name and the button
    // would announce as unlabelled.
    expect(label).toContain("max-inline-size: 0");
    // Matches a declaration, not the comment that explains avoiding one.
    expect(label).not.toMatch(/^\s*display:\s*none/mu);
  });

  it("hands the focus ring to the container, so no box appears inside a box", () => {
    const field = searchInputCss.slice(
      searchInputCss.indexOf(".rect-search-input__field:focus-visible {"),
      searchInputCss.indexOf(".rect-search-input__field::placeholder"),
    );
    // Focus rings are drawn inset here so scroll containers cannot clip them,
    // which means a bare input inside a bordered control paints a second
    // rectangle within the first. The container shows focus on its behalf.
    expect(field).toContain("box-shadow: none");

    const bar = searchInputCss.slice(
      searchInputCss.indexOf(".rect-search-input--bar:focus-within {"),
      searchInputCss.indexOf(".rect-search-input--panel {"),
    );
    expect(bar).toContain("border-color: var(--rect-border-active)");
  });

  it("does not draw a second box inside the search window", () => {
    const panel = searchInputCss.slice(
      searchInputCss.indexOf(".rect-search-input--panel {"),
      searchInputCss.indexOf(".rect-search-input--panel:focus-within"),
    );
    // The window is already a container; a bordered field inside it repeats
    // that edge a few pixels in.
    expect(panel).not.toMatch(/^\s*border:/mu);
    expect(panel).toContain("border-block-end");
  });

  describe("sticky toolbar", () => {
    it("pins the toolbar to the top of the scroll area", () => {
      expect(toolbarCss).toMatch(/\.rect-toolbar\s*\{[^}]*position:\s*sticky/u);
      expect(toolbarCss).toMatch(/\.rect-toolbar\s*\{[^}]*inset-block-start:\s*0/u);
    });

    it("keeps a solid background at all times, not only once scrolled", () => {
      /*
       * Not blur. The minifier emitted only the -webkit- prefixed
       * backdrop-filter and dropped the standard property, so the glass was
       * plain translucency wherever the unprefixed name was needed — text over
       * text. Solid and always present is the version that cannot half-work.
       */
      expect(toolbarCss).toMatch(/\.rect-toolbar\s*\{[^}]*background:\s*var\(--rect-canvas-bg\)/u);
      expect(toolbarCss).not.toContain("backdrop-filter:");
      expect(toolbarCss).not.toMatch(/background-color:\s*transparent/u);
    });

    it("pins flush against the header, with no padding under it to sit on", () => {
      /*
       * This is the check that three failed attempts at the gap needed.
       *
       * A sticky box takes its insets from the scrollport, and a scroll
       * container's own padding moves where that box comes to rest
       * (csswg-drafts 3352). Any leading padding on the body therefore pushes
       * a toolbar at inset-block-start: 0 that far down the visible area, and
       * rows scroll through the strip it leaves above. The negative margin
       * that used to be asserted here could not close it, because a margin
       * decides where a box is laid out and not where it sticks.
       *
       * So: the scroll container must declare no leading block padding, and
       * the bar must not try to compensate with a negative margin.
       */
      const bodyBlock = shellCss.slice(
        shellCss.indexOf(".rect-panel__body {"),
        shellCss.indexOf(".rect-panel__content {"),
      );
      const paddingBlock = /padding-block:\s*([^;]+);/u.exec(bodyBlock);
      expect(paddingBlock?.[1]).toBeDefined();
      expect(String(paddingBlock?.[1]).trim().split(/\s+/u)[0]).toBe("0");

      const toolbarBlock = toolbarCss.slice(
        toolbarCss.indexOf(".rect-toolbar {"),
        toolbarCss.indexOf(".rect-toolbar::after"),
      );
      expect(toolbarBlock).not.toMatch(/margin-block-start:/u);
      // It pays for its own breathing room instead.
      expect(toolbarBlock).toMatch(/padding-block:\s*var\(--rect-space-3\)/u);
    });

    it("asks the browser for no leading scroll padding, which walks the page", () => {
      /*
       * A leading scroll-padding puts a control inside the pinned bar outside
       * what the browser considers the usable area, so it scrolls the
       * container up to reveal it — on every keystroke in the toolbar's search
       * field (crbug 1178622). Nothing here uses anchor links or
       * scrollIntoView, so only the end edge is asked for.
       */
      const bodyBlock = shellCss.slice(
        shellCss.indexOf(".rect-panel__body {"),
        shellCss.indexOf(".rect-panel__content {"),
      );
      expect(bodyBlock).not.toMatch(/scroll-padding-block:/u);
      expect(bodyBlock).not.toMatch(/scroll-padding-block-start:/u);
      expect(bodyBlock).not.toMatch(/scroll-padding-top:/u);
    });

    it("marks the edge under the bar only when something is hidden above the fold", () => {
      expect(toolbarCss).toMatch(/data-scroll-top="false"\]\s*\.rect-toolbar::after/u);
      expect(toolbarCss).toMatch(/\.rect-toolbar::after\s*\{[^}]*opacity:\s*0/u);
    });

    it("separates itself from the page with the same divider every other surface uses", () => {
      /*
       * This was a 20px gradient and it read as a glow hanging off the bar.
       * Nothing else in the product dissolves one surface into another — the
       * page header directly above this bar uses a single divider line, and so
       * does every stacked surface in the kit. Matching it is what makes the
       * toolbar look attached rather than laid on top.
       */
      const after = toolbarCss.slice(
        toolbarCss.indexOf(".rect-toolbar::after {"),
        toolbarCss.indexOf('.rect-panel__body[data-scroll-top="false"]'),
      );
      expect(after).not.toContain("linear-gradient");
      expect(after).toMatch(/block-size:\s*1px/u);
      expect(after).toMatch(/background:\s*var\(--rect-surface-divider\)/u);
    });

    it("draws no fade above the toolbar, which is what opened the gap", () => {
      /*
       * The scroll container's top fade was a sticky flex child placed before
       * the toolbar in the column, so on scroll it pinned at zero and pushed
       * the bar down by its own height — opening a strip of bare canvas that
       * content showed through. Only the bottom fade remains, and the bar
       * paints its own beneath itself.
       */
      expect(shellCss).not.toMatch(/\.rect-panel__body::before/u);
      expect(shellCss).toMatch(/\.rect-panel__body::after/u);
    });

    it("defines every canvas token it uses", () => {
      /*
       * `--rect-canvas-bg` was referenced by the toolbar and the activity day
       * header but defined nowhere, so both resolved to no background at all
       * and content scrolled straight through them.
       */
      expect(tokensCss).toMatch(/--rect-canvas-bg:/u);
    });

    it("does not mask the scroll container", () => {
      /*
       * A mask applies to the whole element including anything sticky inside
       * it, so the pinned toolbar faded out at exactly the moment it was doing
       * its job. The scroll affordance is drawn by overlay layers instead.
       */
      expect(shellCss).not.toMatch(/mask-image/u);
      expect(shellCss).toMatch(/\.rect-panel__body::after/u);
    });

    it("keeps the fades beneath the toolbar", () => {
      // Both are sticky; whichever has the higher z-index wins, and it must be
      // the toolbar or the fade paints over the controls.
      const fadeLayer = shellCss.slice(shellCss.indexOf(".rect-panel__body::after"));
      expect(fadeLayer).toMatch(/z-index:\s*1/u);
      expect(toolbarCss).toMatch(/\.rect-toolbar\s*\{[^}]*z-index:\s*2/u);
    });

    it("still fades only while content is hidden beyond an edge", () => {
      // A page that fits entirely must never be dimmed.
      expect(shellCss).toMatch(/--rect-fade-bottom:\s*0px/u);
      expect(toolbarCss).toMatch(/data-scroll-top="false"/u);
    });
  });
});
