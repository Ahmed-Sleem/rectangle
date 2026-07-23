/** Tests the user-facing Projects page copy and empty workspace behavior. */
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { RectangleI18nProvider, setRectangleLanguage } from "@/shared/i18n";
import ProjectsPage from "./ProjectsPage";

function renderProjectsPage() {
  return render(
    <RectangleI18nProvider>
      <ProjectsPage />
    </RectangleI18nProvider>,
  );
}

describe("ProjectsPage", () => {
  beforeEach(async () => {
    window.localStorage.clear();
    await setRectangleLanguage("en");
  });

  it("renders clean end-user Projects copy without internal implementation wording", () => {
    renderProjectsPage();

    expect(screen.getByRole("heading", { name: "Organize your projects" })).toBeInTheDocument();
    expect(screen.getByText("No projects yet")).toBeInTheDocument();
    expect(screen.getByText(/team, scope, location, schedule, budget, risks, and progress/i)).toBeInTheDocument();

    expect(screen.queryByText(/UI shell/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/fake data/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/backend/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/audit/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /create project/i })).not.toBeInTheDocument();
  });

  it("shows useful project workspace areas instead of developer contracts", () => {
    renderProjectsPage();

    expect(screen.getByRole("heading", { name: "Portfolio clarity" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Teams and stakeholders" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Scope and locations" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Controls overview" })).toBeInTheDocument();

    expect(screen.queryByRole("table", { name: /data contract/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/validation rule/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/required, 2/i)).not.toBeInTheDocument();
  });

  it("renders Arabic copy for the Projects workspace", async () => {
    await setRectangleLanguage("ar");
    renderProjectsPage();

    expect(screen.getByRole("heading", { name: "تنظيم المشاريع" })).toBeInTheDocument();
    expect(screen.getByText("لا توجد مشاريع بعد")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "وضوح المحفظة" })).toBeInTheDocument();
    expect(screen.queryByText(/واجهة أولية/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/بدون بيانات وهمية/i)).not.toBeInTheDocument();
  });
});
