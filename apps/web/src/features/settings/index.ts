import type { FeatureModule } from "@/shell/feature-types";

export const settingsFeature: FeatureModule = {
  id: "settings",
  title: "Settings",
  titleAr: "الإعدادات",
  icon: "settings",
  order: 50,
  navGroup: "primary",
  routePath: "/settings",
  enabled: true,
  load: () => import("./SettingsEmpty"),
};
