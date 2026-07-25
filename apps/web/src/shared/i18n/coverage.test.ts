/**
 * Translation coverage.
 *
 * i18next falls back to English when a key is missing, so an untranslated screen
 * looks correct in development and ships half-English. These checks turn that
 * silent fallback into a build failure.
 */
import { describe, expect, it } from "vitest";
import { resources } from "./resources";

import projectsSource from "@/features/projects/ProjectsPage.tsx?raw";
import projectDetailSource from "@/features/projects/ProjectDetailPage.tsx?raw";
import projectSettingsSource from "@/features/projects/ProjectSettingsPage.tsx?raw";
import teamSource from "@/features/team/TeamPage.tsx?raw";
import settingsSource from "@/features/settings/SettingsPage.tsx?raw";

type Tree = Record<string, unknown>;

function flatten(tree: Tree, prefix = ""): string[] {
  return Object.entries(tree).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof value === "object" && value !== null
      ? flatten(value as Tree, path)
      : [path];
  });
}

describe("translation completeness", () => {
  const en = flatten(resources.en.translation as unknown as Tree).sort();
  const ar = flatten(resources.ar.translation as unknown as Tree).sort();

  it("defines every English key in Arabic", () => {
    const missing = en.filter((key) => !ar.includes(key));
    expect(missing, `Arabic is missing: ${missing.join(", ")}`).toEqual([]);
  });

  it("defines no Arabic key that English lacks", () => {
    // Arabic has six plural categories against English's two, so extra
    // `_zero`/`_two`/`_few`/`_many` forms are correct rather than stray keys.
    const pluralSuffix = /_(zero|one|two|few|many|other)$/u;
    const base = (key: string) => key.replace(pluralSuffix, "");
    const enBases = new Set(en.map(base));

    const extra = ar.filter((key) => !en.includes(key) && !enBases.has(base(key)));
    expect(extra, `Arabic has keys English lacks: ${extra.join(", ")}`).toEqual([]);
  });

  it("actually translates Arabic values rather than copying English", () => {
    // A handful of values are intentionally identical across languages.
    const sharedByDesign = new Set([
      "app.name",
      "common.notAvailable",
      "enums.deliveryMethod.epc",
    ]);

    function walk(enNode: Tree, arNode: Tree, prefix = ""): string[] {
      return Object.entries(enNode).flatMap(([key, value]) => {
        const path = prefix ? `${prefix}.${key}` : key;
        const other = (arNode as Tree)[key];
        if (typeof value === "object" && value !== null) {
          return walk(value as Tree, other as Tree, path);
        }
        if (sharedByDesign.has(path)) return [];
        // Latin letters in an Arabic value mean the string was never translated.
        return typeof other === "string" && /^[\x20-\x7E]+$/u.test(other) ? [path] : [];
      });
    }

    const untranslated = walk(
      resources.en.translation as unknown as Tree,
      resources.ar.translation as unknown as Tree,
    );
    expect(untranslated, `Still English in Arabic: ${untranslated.join(", ")}`).toEqual([]);
  });
});

describe("feature pages read their copy from translations", () => {
  const pages: Array<[string, string]> = [
    ["ProjectsPage.tsx", projectsSource],
    ["ProjectDetailPage.tsx", projectDetailSource],
    ["ProjectSettingsPage.tsx", projectSettingsSource],
    ["TeamPage.tsx", teamSource],
    ["SettingsPage.tsx", settingsSource],
  ];

  it("uses the translation hook on every page that shows text", () => {
    for (const [name, source] of pages) {
      expect(source, `${name} must translate its copy`).toContain("useTranslation");
    }
  });

  it("leaves no hardcoded user-visible strings in props", () => {
    // Props that end up on screen. A literal here cannot be translated.
    const visibleProps =
      /\s(?:label|title|description|placeholder|caption|header|message|submitLabel|confirmLabel|cancelLabel|emptyMessage|hint|status)="[A-Z][^"]*"/g;

    // Codes and identifiers read the same in every language.
    const languageNeutral = /="(?:EGP|USD|EUR|SAR|AED|EPC)"$/u;

    for (const [name, source] of pages) {
      const literals = [...source.matchAll(visibleProps)]
        .map((match) => match[0].trim())
        .filter((literal) => !languageNeutral.test(literal));
      expect(literals, `${name} has untranslated copy: ${literals.join(" | ")}`).toEqual([]);
    }
  });

  it("renders enum values through the shared enums namespace", () => {
    // Status and role values arrive from the API as machine keys; the interface
    // is the only place they become words, so they must go through `enums`.
    expect(projectsSource).toContain("enums.projectStatus");
    expect(projectDetailSource).toContain("enums.memberRole");
    expect(projectDetailSource).toContain("enums.stakeholderCategory");
    expect(teamSource).toContain("enums.userStatus");
  });
});
