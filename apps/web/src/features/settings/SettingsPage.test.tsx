/** Tests the real Settings page language switch used for live Arabic/RTL QA. */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, beforeEach } from "vitest";
import { RectangleI18nProvider, setRectangleLanguage } from "@/shared/i18n";
import SettingsPage from "./SettingsPage";

function renderSettingsPage() {
  return render(
    <RectangleI18nProvider>
      <SettingsPage />
    </RectangleI18nProvider>,
  );
}

describe("SettingsPage", () => {
  beforeEach(async () => {
    window.localStorage.clear();
    await setRectangleLanguage("en");
  });

  it("switches the shell language to Arabic and updates direction", async () => {
    const user = userEvent.setup();
    renderSettingsPage();

    expect(screen.getByRole("heading", { name: "Language" })).toBeInTheDocument();
    expect(screen.getByText(/Current language: English/i)).toBeInTheDocument();
    expect(document.documentElement).toHaveAttribute("dir", "ltr");

    await user.click(screen.getByRole("button", { name: "Arabic" }));

    expect(await screen.findByRole("heading", { name: "اللغة" })).toBeInTheDocument();
    expect(document.documentElement).toHaveAttribute("lang", "ar");
    expect(document.documentElement).toHaveAttribute("dir", "rtl");
    expect(screen.getByText(/اللغة الحالية/)).toBeInTheDocument();
  });

  it("can switch back to English", async () => {
    const user = userEvent.setup();
    await setRectangleLanguage("ar");
    renderSettingsPage();

    await user.click(screen.getByRole("button", { name: "الإنجليزية" }));

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Language" })).toBeInTheDocument();
    });
    expect(document.documentElement).toHaveAttribute("lang", "en");
    expect(document.documentElement).toHaveAttribute("dir", "ltr");
  });
});
