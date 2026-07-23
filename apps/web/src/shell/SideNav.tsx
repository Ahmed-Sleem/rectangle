/**
 * Renders the shell-owned feature menu from the registry, keeping navigation
 * configurable per instance without hardcoding page availability in the shell.
 */
import { useTranslation } from "react-i18next";
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
  const primary = getNavFeatures("primary");
  const footer = getNavFeatures("footer");

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

      <div className="rect-nav__spacer" aria-hidden />

      <nav className="rect-nav__footer" aria-label={t("shell.nav.account")}>
        <ul className="rect-nav__list">
          {footer.map((feature) => (
            <SideNavItem
              key={feature.id}
              feature={feature}
              collapsed={collapsed}
            />
          ))}
        </ul>
      </nav>
    </aside>
  );
}
