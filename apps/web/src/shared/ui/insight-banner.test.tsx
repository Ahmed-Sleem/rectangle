/**
 * The banner's job is to be honest. These tests pin the two properties that
 * make it so: it never asserts a finding it cannot support, and a grounded
 * recommendation always names the records behind it.
 */
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { RectangleI18nProvider, setRectangleLanguage } from "@/shared/i18n";
import { InsightBanner } from "./insight-banner";

function renderBanner(element: React.ReactElement) {
  return render(<RectangleI18nProvider>{element}</RectangleI18nProvider>);
}

describe("InsightBanner", () => {
  beforeEach(async () => {
    await setRectangleLanguage("en");
    window.localStorage.clear();
  });

  it("explains that no model is connected instead of claiming a finding", () => {
    renderBanner(<InsightBanner surface="risks" state={{ status: "unavailable" }} />);

    expect(screen.getByText("AI recommendations are not switched on")).toBeInTheDocument();
    // The feature is visible and honest, which is the point of shipping it now.
    expect(screen.getByText(/always citing the records behind it/u)).toBeInTheDocument();
  });

  it("reports finding nothing, which is itself an answer", () => {
    renderBanner(<InsightBanner surface="risks" state={{ status: "empty" }} />);
    expect(screen.getByText("Nothing needs raising right now")).toBeInTheDocument();
  });

  it("names the records a recommendation came from", () => {
    renderBanner(
      <InsightBanner
        surface="risks"
        state={{
          status: "ready",
          headline: "Three quality risks are unowned",
          sources: [
            { label: "NCT-01", href: "/projects/p1" },
            { label: "Rebar delay", href: "/risks?projectId=p1" },
          ],
        }}
      />,
    );

    const banner = screen.getByRole("complementary", { name: "AI insight" });
    expect(within(banner).getByText("Based on")).toBeInTheDocument();
    // Citations are what separate a finding from an opinion.
    expect(within(banner).getByRole("link", { name: "NCT-01" })).toHaveAttribute("href", "/projects/p1");
    expect(within(banner).getByRole("link", { name: "Rebar delay" })).toBeInTheDocument();
  });

  it("can be dismissed and stays dismissed", async () => {
    const user = userEvent.setup();
    const { unmount } = renderBanner(
      <InsightBanner surface="risks" state={{ status: "unavailable" }} />,
    );

    await user.click(screen.getByRole("button", { name: "Dismiss this insight" }));
    expect(screen.queryByRole("complementary", { name: "AI insight" })).not.toBeInTheDocument();

    // An advisory that returns on every visit becomes furniture.
    unmount();
    renderBanner(<InsightBanner surface="risks" state={{ status: "unavailable" }} />);
    expect(screen.queryByRole("complementary", { name: "AI insight" })).not.toBeInTheDocument();
  });

  it("keeps each surface's dismissal separate", async () => {
    const user = userEvent.setup();
    const { unmount } = renderBanner(
      <InsightBanner surface="risks" state={{ status: "unavailable" }} />,
    );
    await user.click(screen.getByRole("button", { name: "Dismiss this insight" }));
    unmount();

    // Silencing advice about risks says nothing about advice elsewhere.
    renderBanner(<InsightBanner surface="today" state={{ status: "unavailable" }} />);
    expect(screen.getByRole("complementary", { name: "AI insight" })).toBeInTheDocument();
  });

  it("renders in Arabic when Arabic is active", async () => {
    await setRectangleLanguage("ar");
    renderBanner(<InsightBanner surface="risks" state={{ status: "unavailable" }} />);
    expect(screen.getByText("توصيات الذكاء الاصطناعي غير مفعّلة")).toBeInTheDocument();
  });
});
