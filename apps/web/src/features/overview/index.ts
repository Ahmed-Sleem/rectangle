import type { FeatureModule } from "@/shell/feature-types";

/**
 * The landing surface. Named "Today" rather than "Dashboard" because it answers
 * what needs a decision now, not what happened in general.
 */
export const overviewFeature: FeatureModule = {
  id: "overview",
  title: "Today",
  titleAr: "اليوم",
  icon: "overview",
  order: 10,
  navGroup: "primary",
  routePath: "/",
  enabled: true,
  requiredPermission: "projects.read",
  load: () => import("./TodayPage"),
};
