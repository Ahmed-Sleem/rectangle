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
import resourcesSource from "@/shared/i18n/resources.ts?raw";
import designTokens from "../../../../design/tokens/shell.tokens.json";

describe("canvas empty state", () => {
  it("shows user-facing copy without internal identifiers or build wording", async () => {
    render(
      <RectangleI18nProvider>
        <ShellEmptyState featureId="overview" title="Overview" />
      </RectangleI18nProvider>,
    );

    expect(
      await screen.findByRole("heading", { level: 2, name: "Overview" }),
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
    // Hidden scrollbars require a visible overflow affordance instead.
    expect(bodyBlock).toContain("mask-image");

    // The fade must be driven by scroll position, so a page that fits on screen
    // is never dimmed at an edge that has nothing beyond it.
    expect(bodyBlock).toContain("--rect-fade-top: 0px");
    expect(bodyBlock).toContain("--rect-fade-bottom: 0px");
    expect(bodyBlock).toContain('[data-scroll-top="false"]');
    expect(bodyBlock).toContain('[data-scroll-bottom="false"]');
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

  it("expands controls to a touch target on coarse pointers", () => {
    expect(uiCss).toContain("@media (pointer: coarse)");
    expect(uiCss).toContain("var(--rect-control-touch)");
  });
});

describe("design token snapshot", () => {
  // design/tokens/shell.tokens.json is the machine-readable mirror of tokens.css.
  // If it drifts, design docs start describing a product that does not exist.
  function cssToken(name: string): string {
    const match = tokensCss.match(new RegExp(`${name}:\\s*([^;]+);`));
    return (match?.[1] ?? "").trim();
  }

  it("advertises only Inter weights that global.css actually imports", () => {
    expect(designTokens.font.weights).toEqual([400, 500, 600, 700, 900]);
  });

  it("matches the shipped spacing scale", () => {
    const space = designTokens.space as Record<string, number>;
    const pairs: Array<[string, number]> = [
      ["--rect-space-1", space.s1!],
      ["--rect-space-2", space.s2!],
      ["--rect-space-3", space.s3!],
      ["--rect-space-4", space.s4!],
      ["--rect-space-6", space.s6!],
      ["--rect-space-8", space.s8!],
    ];
    for (const [token, expected] of pairs) {
      expect(cssToken(token), `${token} drifted from the token snapshot`).toBe(`${expected}px`);
    }
  });

  it("matches the shipped control heights and table densities", () => {
    expect(cssToken("--rect-control-compact")).toBe(`${designTokens.control.compact}px`);
    expect(cssToken("--rect-control-standard")).toBe(`${designTokens.control.standard}px`);
    expect(cssToken("--rect-control-touch")).toBe(`${designTokens.control.touch}px`);
    expect(cssToken("--rect-table-row-dense")).toBe(`${designTokens.tableRow.dense}px`);
  });

  it("matches the shipped canvas contract", () => {
    expect(cssToken("--rect-canvas-content-max")).toBe(`${designTokens.canvas.contentMaxWidth}px`);
    expect(cssToken("--rect-panel-stack-gap")).toBe(`${designTokens.canvas.stackGap}px`);
    expect(cssToken("--rect-panel-padding")).toBe(
      `${designTokens.canvas.paddingY}px ${designTokens.canvas.paddingX}px`,
    );
  });
});
