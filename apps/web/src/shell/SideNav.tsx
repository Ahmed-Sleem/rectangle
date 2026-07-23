/**
 * Renders the shell-owned feature menu from the registry, keeping navigation
 * configurable per instance without hardcoding page availability in the shell.
 */
import { NavToggle } from "./NavToggle";
import { getNavFeatures } from "./registry";
import { SideNavItem } from "./SideNavItem";

export function SideNav({
  collapsed,
  navId,
  onToggle,
}: {
  collapsed: boolean;
  navId: string;
  onToggle: () => void;
}) {
  const primary = getNavFeatures("primary");
  const footer = getNavFeatures("footer");

  return (
    <aside className="rect-nav" id={navId} aria-label="Main">
      <div className="rect-nav__topbar">
        <div className="rect-logo" aria-hidden={false}>
          <span className="rect-logo__full">rectangle</span>
          <span className="rect-logo__short">R</span>
        </div>
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

      <div className="rect-nav__controls" aria-label="Menu display controls">
        <NavToggle collapsed={collapsed} onToggle={onToggle} navId={navId} />
      </div>

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
