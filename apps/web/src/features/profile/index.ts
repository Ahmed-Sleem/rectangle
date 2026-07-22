import type { FeatureModule } from "@/shell/feature-types";

export const profileFeature: FeatureModule = {
  id: "profile",
  title: "Profile",
  titleAr: "الملف الشخصي",
  icon: "profile",
  order: 900,
  navGroup: "footer",
  routePath: "/profile",
  enabled: true,
  load: () => import("./ProfileEmpty"),
};
