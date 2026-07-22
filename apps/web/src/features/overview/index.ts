import type { FeatureModule } from "@/shell/feature-types";

export const overviewFeature: FeatureModule = {
  id: "overview",
  title: "Overview",
  titleAr: "نظرة عامة",
  icon: "overview",
  order: 10,
  navGroup: "primary",
  routePath: "/",
  enabled: true,
  load: () => import("./OverviewEmpty"),
};
