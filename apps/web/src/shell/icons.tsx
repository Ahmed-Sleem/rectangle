import {
  BarChart3,
  Folder,
  LayoutGrid,
  LogOut,
  Settings,
  User,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { FeatureIconName } from "./feature-types";

const ICON_MAP: Record<FeatureIconName, LucideIcon> = {
  overview: LayoutGrid,
  projects: Folder,
  analytics: BarChart3,
  team: Users,
  settings: Settings,
  profile: User,
  logout: LogOut,
};

export function FeatureIcon({
  name,
  size = 18,
  strokeWidth = 1.85,
  className,
}: {
  name: FeatureIconName;
  size?: number;
  strokeWidth?: number;
  className?: string;
}) {
  const Icon = ICON_MAP[name];
  return (
    <Icon
      size={size}
      strokeWidth={strokeWidth}
      className={className}
      aria-hidden
    />
  );
}
