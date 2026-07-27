import type { FeatureModule } from "@/shell/feature-types";

export const projectsFeature: FeatureModule = {
  id: "projects",
  title: "Projects",
  titleAr: "المشاريع",
  icon: "projects",
  order: 20,
  navGroup: "primary",
  routePath: "/projects",
  enabled: true,
  requiredPermission: "projects.read",
  load: () => import("./ProjectsPage"),
};
