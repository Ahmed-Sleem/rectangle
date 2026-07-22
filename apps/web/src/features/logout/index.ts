import type { FeatureModule } from "@/shell/feature-types";

export const logoutFeature: FeatureModule = {
  id: "logout",
  title: "Logout",
  titleAr: "تسجيل الخروج",
  icon: "logout",
  order: 910,
  navGroup: "footer",
  routePath: "/logout",
  enabled: true,
  load: () => import("./LogoutEmpty"),
};
