/**
 * Guards that the menu offers only pages the viewer can actually open.
 *
 * Every feature was previously listed for everyone, so a person without
 * `users.read` saw "Team", clicked it, and met a red error state — a refusal
 * presented as a system fault. Nothing in the product's behaviour breaks when
 * this regresses, so only an assertion keeps it correct.
 */
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, beforeEach } from "vitest";
import { FeatureGuard } from "@/app/FeatureGuard";
import { AuthContext, canOpenFeature, hasPermission, type AuthContextValue } from "@/shared/auth";
import { RectangleI18nProvider, setRectangleLanguage } from "@/shared/i18n";
import { SideNav } from "./SideNav";

const viewer: AuthContextValue = {
  setupRequired: false,
  loading: false,
  refresh: async () => undefined,
  user: { tenantId: "1", userId: "2", roles: ["viewer"], permissions: ["projects.read"] },
};

const admin: AuthContextValue = {
  ...viewer,
  user: { tenantId: "1", userId: "3", roles: ["tenant_admin"], permissions: [] },
};

const outsider: AuthContextValue = {
  ...viewer,
  user: { tenantId: "1", userId: "4", roles: ["external_collaborator"], permissions: [] },
};

function renderNav(auth: AuthContextValue) {
  return render(
    <RectangleI18nProvider>
      <AuthContext.Provider value={auth}>
        <MemoryRouter>
          <SideNav collapsed={false} navId="nav" />
        </MemoryRouter>
      </AuthContext.Provider>
    </RectangleI18nProvider>,
  );
}

describe("authority", () => {
  it("treats owners and admins as holding every permission", () => {
    // Mirrors the server, where those two roles resolve to the full set rather
    // than being granted each key individually.
    expect(hasPermission(admin.user, "users.read")).toBe(true);
    expect(hasPermission(admin.user, "activity.read_all")).toBe(true);
    expect(hasPermission(admin.user, "settings.manage")).toBe(true);
  });

  it("resolves the permissions a plain role implies", () => {
    expect(hasPermission(viewer.user, "projects.read")).toBe(true);
    expect(hasPermission(viewer.user, "users.read")).toBe(false);
  });

  it("grants nothing to a signed-out visitor", () => {
    expect(hasPermission(null, "projects.read")).toBe(false);
    expect(canOpenFeature(null, "projects.read")).toBe(false);
  });

  it("lets anyone open a feature that requires nothing", () => {
    expect(canOpenFeature(outsider.user, undefined)).toBe(true);
  });
});

describe("navigation", () => {
  beforeEach(async () => {
    await setRectangleLanguage("en");
  });

  it("hides Team from someone who may not read users", () => {
    renderNav(viewer);

    const nav = screen.getByRole("navigation", { name: /main|primary/iu });
    expect(within(nav).queryByRole("link", { name: "Team" })).not.toBeInTheDocument();
    // The pages they can open are still offered.
    expect(within(nav).getByRole("link", { name: "Projects" })).toBeInTheDocument();
  });

  it("shows Team to an administrator", () => {
    renderNav(admin);

    const nav = screen.getByRole("navigation", { name: /main|primary/iu });
    expect(within(nav).getByRole("link", { name: "Team" })).toBeInTheDocument();
  });

  it("hides the project registers from someone with no project access", () => {
    renderNav(outsider);

    const nav = screen.getByRole("navigation", { name: /main|primary/iu });
    expect(within(nav).queryByRole("link", { name: "Projects" })).not.toBeInTheDocument();
    expect(within(nav).queryByRole("link", { name: "Tasks" })).not.toBeInTheDocument();
  });

  it("never offers Analytics, which has no backend yet", () => {
    renderNav(admin);

    // Hidden in the feature config rather than left as a placeholder page: a
    // menu item that opens an empty screen is a promise the product breaks.
    const nav = screen.getByRole("navigation", { name: /main|primary/iu });
    expect(within(nav).queryByRole("link", { name: "Analytics" })).not.toBeInTheDocument();
  });

  it("always offers Activity, since everyone may read their own trail", () => {
    renderNav(outsider);

    const nav = screen.getByRole("navigation", { name: /main|primary/iu });
    expect(within(nav).getByRole("link", { name: "Activity" })).toBeInTheDocument();
  });
});

describe("direct navigation to a page you may not open", () => {
  beforeEach(async () => {
    await setRectangleLanguage("en");
  });

  it("explains the refusal instead of reporting a fault", () => {
    render(
      <RectangleI18nProvider>
        <AuthContext.Provider value={viewer}>
          <FeatureGuard requiredPermission="users.read">
            <p>Team register</p>
          </FeatureGuard>
        </AuthContext.Provider>
      </RectangleI18nProvider>,
    );

    expect(screen.getByText("You do not have access to this page")).toBeInTheDocument();
    // Nothing has gone wrong, so nothing may suggest it has.
    expect(screen.queryByText("Team register")).not.toBeInTheDocument();
    expect(screen.queryByText(/could not be loaded|went wrong/iu)).not.toBeInTheDocument();
  });

  it("renders the page for someone who holds the permission", () => {
    render(
      <RectangleI18nProvider>
        <AuthContext.Provider value={admin}>
          <FeatureGuard requiredPermission="users.read">
            <p>Team register</p>
          </FeatureGuard>
        </AuthContext.Provider>
      </RectangleI18nProvider>,
    );

    expect(screen.getByText("Team register")).toBeInTheDocument();
  });

  it("waits rather than flashing a refusal while authority is still loading", () => {
    const { container } = render(
      <RectangleI18nProvider>
        <AuthContext.Provider value={{ ...viewer, loading: true }}>
          <FeatureGuard requiredPermission="users.read">
            <p>Team register</p>
          </FeatureGuard>
        </AuthContext.Provider>
      </RectangleI18nProvider>,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
