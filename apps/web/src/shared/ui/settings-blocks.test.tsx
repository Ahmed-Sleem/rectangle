/**
 * Configuration building blocks are shared by every settings-style surface, so
 * their disclosure affordance and selection semantics are pinned here.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { ChoiceGroup, SettingRow, SettingsSection } from "./settings-blocks";
import uiCss from "./ui.css?raw";

function SectionHarness() {
  const [open, setOpen] = useState(false);
  return (
    <SettingsSection
      title="Email delivery"
      description="Company-wide sending."
      open={open}
      onToggle={() => setOpen((value) => !value)}
    >
      <p>Panel content</p>
    </SettingsSection>
  );
}

describe("SettingsSection", () => {
  it("communicates expanded state through the trigger, not just by content position", async () => {
    const user = userEvent.setup();
    render(<SectionHarness />);

    const trigger = screen.getByRole("button", { name: /Email delivery/ });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Panel content")).not.toBeVisible();

    await user.click(trigger);

    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Panel content")).toBeVisible();
  });

  it("links the trigger to the panel it controls", () => {
    render(<SectionHarness />);
    const trigger = screen.getByRole("button", { name: /Email delivery/ });
    const panelId = trigger.getAttribute("aria-controls");

    expect(panelId).toBeTruthy();
    expect(document.getElementById(panelId!)).not.toBeNull();
  });

  it("ships a visible chevron that rotates with state", () => {
    // The native <details> marker is hidden by design; without a replacement
    // there is no way to tell an open section from a closed one.
    expect(uiCss).toContain(".rect-section__chevron");
    expect(uiCss).toContain(".rect-section--open .rect-section__chevron");
    expect(
      uiCss.slice(uiCss.indexOf(".rect-section--open .rect-section__chevron")),
    ).toContain("rotate(180deg)");
  });

  it("keeps the trigger a comfortable target", () => {
    const trigger = uiCss.slice(
      uiCss.indexOf(".rect-section__trigger {"),
      uiCss.indexOf(".rect-section__trigger:hover"),
    );
    expect(trigger).toContain("min-height: var(--rect-control-touch)");
  });
});

describe("ChoiceGroup", () => {
  it("uses radio semantics so exactly one active option is reported", async () => {
    const user = userEvent.setup();
    let current: "en" | "ar" = "en";

    function Harness() {
      const [value, setValue] = useState<"en" | "ar">("en");
      return (
        <ChoiceGroup
          label="Interface language"
          value={value}
          onChange={(next) => {
            current = next;
            setValue(next);
          }}
          options={[
            { value: "en", label: "English", hint: "Left to right" },
            { value: "ar", label: "Arabic", hint: "Right to left" },
          ]}
        />
      );
    }

    render(<Harness />);

    const group = screen.getByRole("radiogroup", { name: "Interface language" });
    expect(group).toBeInTheDocument();

    const english = screen.getByRole("radio", { name: /English/ });
    const arabic = screen.getByRole("radio", { name: /Arabic/ });
    expect(english).toHaveAttribute("aria-checked", "true");
    expect(arabic).toHaveAttribute("aria-checked", "false");

    await user.click(arabic);

    expect(current).toBe("ar");
    expect(arabic).toHaveAttribute("aria-checked", "true");
    expect(english).toHaveAttribute("aria-checked", "false");
  });
});

describe("SettingRow", () => {
  it("wraps its control instead of overflowing when space runs out", () => {
    render(<SettingRow label="Interface language" description="Applies everywhere." control={<button type="button">Change</button>} />);

    expect(screen.getByText("Interface language")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Change" })).toBeInTheDocument();

    const row = uiCss.slice(
      uiCss.indexOf(".rect-setting-row {"),
      uiCss.indexOf(".rect-setting-row__text"),
    );
    // flex-wrap plus a shrinkable text column is what stops the row from
    // pushing past the panel on narrow screens.
    expect(row).toContain("flex-wrap: wrap");
    expect(row).toContain("min-width: 0");
  });
});
