/** Tests that the signed-in person is visible and their menu leads somewhere. */
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";
import { AuthContext, type AuthContextValue } from "@/shared/auth";
import { RectangleI18nProvider, setRectangleLanguage } from "@/shared/i18n";
import { UserMenu } from "./UserMenu";

const signedIn: AuthContextValue = {
  setupRequired: false,
  loading: false,
  refresh: async () => undefined,
  user: {
    tenantId: "1",
    userId: "2",
    roles: ["viewer"],
    permissions: [],
    displayName: "Ahmed Sleem",
    email: "ahmed@rectangle.test",
  },
};

function LocationProbe() {
  return <span data-testid="location">{useLocation().pathname}</span>;
}

function renderMenu(auth: AuthContextValue = signedIn) {
  return render(
    <RectangleI18nProvider>
      <AuthContext.Provider value={auth}>
        <MemoryRouter initialEntries={["/"]}>
          <UserMenu />
          <Routes>
            <Route path="*" element={<LocationProbe />} />
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>
    </RectangleI18nProvider>,
  );
}

describe("UserMenu", () => {
  beforeEach(async () => {
    await setRectangleLanguage("en");
  });

  it("shows who is signed in", async () => {
    renderMenu();
    expect(screen.getByRole("button", { name: "Ahmed Sleem" })).toBeInTheDocument();
  });

  it("shows the account's email once opened", async () => {
    const user = userEvent.setup();
    renderMenu();

    await user.click(screen.getByRole("button", { name: "Ahmed Sleem" }));
    const menu = screen.getByRole("menu");
    expect(within(menu).getByText("ahmed@rectangle.test")).toBeInTheDocument();
  });

  it("navigates to the profile", async () => {
    const user = userEvent.setup();
    renderMenu();

    await user.click(screen.getByRole("button", { name: "Ahmed Sleem" }));
    await user.click(screen.getByRole("menuitem", { name: "Profile" }));

    expect(screen.getByTestId("location")).toHaveTextContent("/profile");
  });

  it("closes on Escape without navigating", async () => {
    const user = userEvent.setup();
    renderMenu();

    await user.click(screen.getByRole("button", { name: "Ahmed Sleem" }));
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent("/");
  });

  it("renders nothing when nobody is signed in", () => {
    // A menu for nobody would imply a session that does not exist.
    renderMenu({ ...signedIn, user: null });
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
