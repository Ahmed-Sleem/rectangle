/** Tests for the Rectangle i18n foundation and RTL direction helpers. */
import { describe, expect, it } from "vitest";
import { getDirection, isRectangleLanguage } from "./resources";
import { getCurrentDirection, getCurrentLanguage, setRectangleLanguage } from "./i18n";

describe("Rectangle i18n foundation", () => {
  it("validates supported languages", () => {
    expect(isRectangleLanguage("en")).toBe(true);
    expect(isRectangleLanguage("ar")).toBe(true);
    expect(isRectangleLanguage("fr")).toBe(false);
    expect(isRectangleLanguage(null)).toBe(false);
  });

  it("maps Arabic to RTL and English to LTR", () => {
    expect(getDirection("en")).toBe("ltr");
    expect(getDirection("ar")).toBe("rtl");
  });

  it("changes active language through the public setter", async () => {
    await setRectangleLanguage("ar");
    expect(getCurrentLanguage()).toBe("ar");
    expect(getCurrentDirection()).toBe("rtl");

    await setRectangleLanguage("en");
    expect(getCurrentLanguage()).toBe("en");
    expect(getCurrentDirection()).toBe("ltr");
  });
});
