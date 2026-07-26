/** Tests that the signed-in person is visible and their menu leads somewhere. */
import { render, screen, waitFor, within } from "@testing-library/react";
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

    // The panel animates out rather than vanishing, so it is still mounted
    // for the length of the exit before it is removed.
    await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());
    expect(screen.getByTestId("location")).toHaveTextContent("/");
  });

  it("renders nothing when nobody is signed in", () => {
    // A menu for nobody would imply a session that does not exist.
    renderMenu({ ...signedIn, user: null });
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("escapes the header's stacking context so it cannot be covered", async () => {
    const user = userEvent.setup();
    const { container } = renderMenu();

    await user.click(screen.getByRole("button", { name: "Ahmed Sleem" }));

    // Portalled to the body: `.rect-panel` and `.rect-panel__header` both
    // create stacking contexts, so a panel left inside them is painted
    // beneath later page content whatever z-index it carries.
    const panel = screen.getByRole("menu");
    expect(container.contains(panel)).toBe(false);
    expect(document.body.contains(panel)).toBe(true);
  });

  it("gives each person a stable colour rather than a random one", async () => {
    const user = userEvent.setup();
    renderMenu();
    await user.click(screen.getByRole("button", { name: "Ahmed Sleem" }));

    const tints = [...document.querySelectorAll(".rect-avatar")].map((node) =>
      node.getAttribute("data-tint"),
    );
    // The trigger and the panel show the same person, so the same tint.
    expect(new Set(tints).size).toBe(1);
    expect(tints[0]).toMatch(/^[0-7]$/u);
  });

  it("presents the person as a single control rather than loose text", async () => {
    renderMenu();
    const trigger = screen.getByRole("button", { name: "Ahmed Sleem" });

    // Avatar and name belong to one container, so they read as a pair with
    // the search control beside them.
    expect(trigger.querySelector(".rect-avatar")).not.toBeNull();
    expect(trigger.querySelector(".rect-user-menu__name")).not.toBeNull();
  });
});
