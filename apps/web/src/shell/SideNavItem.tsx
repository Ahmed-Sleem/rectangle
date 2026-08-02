import { NavLink } from "react-router";
import type { FeatureModule } from "./feature-types";
import { FeatureIcon } from "./icons";
import { cn } from "@/shared/lib/cn";
import { getLocalizedFeatureTitle, useRectangleI18n } from "@/shared/i18n";

export function SideNavItem({
  feature,
  collapsed,
  onNavigate,
}: {
  feature: FeatureModule;
  collapsed: boolean;
  /** Present only where the rail is a sheet that must close behind the choice. */
  onNavigate?: () => void;
}) {
  const { language } = useRectangleI18n();
  const title = getLocalizedFeatureTitle(feature, language, feature.title);

  return (
    <li>
      <NavLink
        to={feature.routePath}
        end={feature.routePath === "/"}
        className={({ isActive }) =>
          cn("rect-nav-item", isActive && "rect-nav-item--active")
        }
        aria-label={title}
        title={collapsed ? title : undefined}
        {...(onNavigate ? { onClick: onNavigate } : {})}
      >
        <span className="rect-nav-item__icon">
          <FeatureIcon name={feature.icon} />
        </span>
        <span className="rect-nav-item__label">{title}</span>
      </NavLink>
    </li>
  );
}
