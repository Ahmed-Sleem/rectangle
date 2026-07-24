import type { FeatureModule } from "@/shell/feature-types";

export const teamFeature: FeatureModule = {
  id: "team",
  title: "Team",
  titleAr: "الفريق",
  icon: "team",
  order: 40,
  navGroup: "primary",
  routePath: "/team",
  enabled: true,
  load: () => import("./TeamPage"),
};
