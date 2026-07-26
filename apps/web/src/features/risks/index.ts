import type { FeatureModule } from "@/shell/feature-types";

export const risksFeature: FeatureModule = {
  id: "risks",
  title: "Risks",
  titleAr: "المخاطر",
  icon: "risks",
  order: 34,
  navGroup: "primary",
  routePath: "/risks",
  enabled: true,
  load: () => import("./RisksPage"),
};
