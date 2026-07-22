import { NavLink } from "react-router-dom";
import type { FeatureModule } from "./feature-types";
import { FeatureIcon } from "./icons";
import { cn } from "@/shared/lib/cn";

export function SideNavItem({
  feature,
  collapsed,
}: {
  feature: FeatureModule;
  collapsed: boolean;
}) {
  return (
    <li>
      <NavLink
        to={feature.routePath}
        end={feature.routePath === "/"}
        className={({ isActive }) =>
          cn("rect-nav-item", isActive && "rect-nav-item--active")
        }
        aria-label={feature.title}
        title={collapsed ? feature.title : undefined}
      >
        <span className="rect-nav-item__icon">
          <FeatureIcon name={feature.icon} />
        </span>
        <span className="rect-nav-item__label">{feature.title}</span>
      </NavLink>
    </li>
  );
}
