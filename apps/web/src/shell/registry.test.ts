import { describe, expect, it } from "vitest";
import {
  getAllFeatures,
  getEnabledFeatures,
  getFeatureById,
  getFeatureByPath,
  getNavFeatures,
} from "./registry";

describe("feature registry", () => {
  it("returns features sorted by order", () => {
    const all = getAllFeatures();
    const orders = all.map((f) => f.order);
    const sorted = [...orders].sort((a, b) => a - b);
    expect(orders).toEqual(sorted);
  });

  it("excludes disabled and template features from enabled list", () => {
    const enabled = getEnabledFeatures();
    expect(enabled.every((f) => f.enabled)).toBe(true);
    expect(enabled.find((f) => f.id === "_template")).toBeUndefined();
  });

  it("resolves overview at /", () => {
    const feature = getFeatureByPath("/");
    expect(feature?.id).toBe("overview");
  });

  it("resolves projects at /projects", () => {
    const feature = getFeatureByPath("/projects");
    expect(feature?.id).toBe("projects");
  });

  it("splits primary and footer nav groups", () => {
    const primary = getNavFeatures("primary");
    const footer = getNavFeatures("footer");
    expect(primary.length).toBeGreaterThanOrEqual(5);
    expect(footer.map((f) => f.id).sort()).toEqual(["logout", "profile"]);
  });

  it("looks up by id", () => {
    expect(getFeatureById("settings")?.title).toBe("Settings");
  });
});
