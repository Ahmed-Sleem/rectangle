import { getNavFeatures } from "./registry";
import { SideNavItem } from "./SideNavItem";

export function SideNav({
  collapsed,
  navId,
}: {
  collapsed: boolean;
  navId: string;
}) {
  const primary = getNavFeatures("primary");
  const footer = getNavFeatures("footer");

  return (
    <aside className="rect-nav" id={navId} aria-label="Main">
      <div className="rect-logo" aria-hidden={false}>
        <span className="rect-logo__full">rectangle</span>
        <span className="rect-logo__short">R</span>
      </div>

      <nav aria-label="Primary">
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

      <nav className="rect-nav__footer" aria-label="Account">
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
