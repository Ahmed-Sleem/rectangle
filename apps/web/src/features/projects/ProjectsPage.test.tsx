/** Tests the production-safe Projects UI shell without fake project CRUD. */
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

  it("renders a production-safe shell and keeps create disabled until a real backend exists", () => {
    renderProjectsPage();

    expect(screen.getByRole("heading", { name: "Project registry foundation" })).toBeInTheDocument();
    expect(screen.getByText("No fake data")).toBeInTheDocument();
    expect(screen.getByText("No production project data is connected yet")).toBeInTheDocument();

    const createButton = screen.getByRole("button", { name: "Create project" });
    expect(createButton).toBeDisabled();
    expect(createButton).toHaveAttribute(
      "title",
      "Create is disabled until Rectangle has a real project API, database persistence, object-level permissions, and audit logging.",
    );
  });

  it("shows planned backend validation contract instead of sample project records", () => {
    renderProjectsPage();

    expect(screen.getByRole("table", { name: "First project data contract" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Field" })).toBeInTheDocument();
    expect(screen.getByText("Required, 2–120 characters")).toBeInTheDocument();
    expect(screen.getByText("Required, unique per tenant, safe characters only")).toBeInTheDocument();

    expect(screen.queryByText(/sample project/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/demo project/i)).not.toBeInTheDocument();
  });

  it("renders Arabic copy for the Projects shell", async () => {
    await setRectangleLanguage("ar");
    renderProjectsPage();

    expect(screen.getByRole("heading", { name: "أساس سجل المشاريع" })).toBeInTheDocument();
    expect(screen.getByText("بدون بيانات وهمية")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "إنشاء مشروع" })).toBeDisabled();
    expect(screen.getByRole("columnheader", { name: "الحقل" })).toBeInTheDocument();
  });
});
