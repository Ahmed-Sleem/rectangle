/** Tests for instance-level feature configuration validation and overrides. */
import { describe, expect, it } from "vitest";
import type { ComponentType } from "react";
import type { FeatureModule } from "@/shell/feature-types";
import { applyFeatureConfig, validateFeatureConfig, type FeatureConfig } from "./feature-config";

const load = () => Promise.resolve({ default: (() => null) as ComponentType });

const baseFeatures: FeatureModule[] = [
  { id: "overview", title: "Overview", icon: "overview", order: 10, navGroup: "primary", routePath: "/", enabled: true, load },
  { id: "projects", title: "Projects", titleAr: "المشاريع", icon: "projects", order: 20, navGroup: "primary", routePath: "/projects", enabled: true, load },
  { id: "settings", title: "Settings", icon: "settings", order: 50, navGroup: "primary", routePath: "/settings", enabled: true, load },
];

describe("feature configuration", () => {
  it("applies enabled/order/title/navGroup overrides without mutating discovered features", () => {
    const configured = applyFeatureConfig(baseFeatures, [
      { id: "settings", enabled: false, order: 5, navGroup: "footer", title: "Admin", titleAr: "الإدارة" },
      { id: "projects", order: 30 },
    ] satisfies FeatureConfig);

    expect(configured.map((feature) => feature.id)).toEqual(["settings", "overview", "projects"]);
    expect(configured[0]).toMatchObject({
      id: "settings",
      enabled: false,
      navGroup: "footer",
      title: "Admin",
      titleAr: "الإدارة",
    });
    expect(baseFeatures.find((feature) => feature.id === "settings")?.title).toBe("Settings");
  });

  it("rejects unknown, duplicate, and invalid config entries", () => {
    const availableIds = new Set(baseFeatures.map((feature) => feature.id));
    const issues = validateFeatureConfig([
      { id: "projects", order: -1 },
      { id: "projects" },
      { id: "unknown" },
      { id: "settings", title: "" },
      { id: "overview", titleAr: "" },
    ], availableIds);

    expect(issues).toEqual(expect.arrayContaining([
      "Feature config 'projects' order must be an integer between 0 and 9999.",
      "Feature config id 'projects' is duplicated.",
      "Feature config id 'unknown' does not match a discovered feature.",
      "Feature config 'settings' title must be 1-40 characters.",
      "Feature config 'overview' Arabic title must be 1-40 characters.",
    ]));
  });

  it("throws with detailed validation output before the registry can use bad config", () => {
    expect(() => applyFeatureConfig(baseFeatures, [{ id: "missing" }])).toThrow(
      /Invalid Rectangle feature configuration:/,
    );
  });
});
