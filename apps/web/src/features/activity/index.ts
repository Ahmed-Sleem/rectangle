import type { FeatureModule } from "@/shell/feature-types";

export const activityFeature: FeatureModule = {
  id: "activity",
  title: "Activity",
  titleAr: "النشاط",
  icon: "activity",
  order: 45,
  navGroup: "primary",
  routePath: "/activity",
  enabled: true,
  load: () => import("./ActivityPage"),
};
