/**
 * Renders the shell-owned feature menu from the registry, keeping navigation
 * configurable per instance without hardcoding page availability in the shell.
 */
import { useTranslation } from "react-i18next";
import { canOpenFeature, useOptionalAuth } from "@/shared/auth";
import { getNavFeatures } from "./registry";
import { SideNavItem } from "./SideNavItem";

export function SideNav({
  collapsed,
  navId,
}: {
  collapsed: boolean;
  navId: string;
}) {
  const { t } = useTranslation();
  const auth = useOptionalAuth();

  /*
   * A page the viewer cannot open is not offered. Previously every feature was
   * listed for everyone, so someone without `users.read` saw "Team", clicked
   * it, and met an error — a refusal dressed as a fault. Authority is read live
   * from the session, so revoking a permission removes the item on the next
   * request rather than at next sign-in.
   */
  const primary = getNavFeatures("primary").filter((feature) =>
    canOpenFeature(auth?.user, feature.requiredPermission),
  );

  return (
    <aside className="rect-nav" id={navId} aria-label={t("shell.nav.main")}>
      <div className="rect-nav__topbar">
        <div className="rect-logo" aria-hidden={false}>
          <span className="rect-logo__full">rectangle</span>
          <span className="rect-logo__short">R</span>
        </div>
      </div>

      <nav aria-label={t("shell.nav.primary")}>
        <ul className="rect-nav__list">
          {primary.map((feature) => (
            <SideNavItem
              key={feature.id}
              feature={feature}
              collapsed={collapsed}
            />
          ))}
        </ul>
      </nav>

      {/*
        Account items are reached from the profile control in the header, so
        listing them here as well would offer the same two destinations twice.
        They stay registered and routable — the menu links straight to them.
      */}
      <div className="rect-nav__spacer" aria-hidden />
    </aside>
  );
}
