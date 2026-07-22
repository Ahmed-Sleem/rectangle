import type { FeatureModule } from "@/shell/feature-types";

export const analyticsFeature: FeatureModule = {
  id: "analytics",
  title: "Analytics",
  titleAr: "التحليلات",
  icon: "analytics",
  order: 30,
  navGroup: "primary",
  routePath: "/analytics",
  enabled: true,
  load: () => import("./AnalyticsEmpty"),
};
