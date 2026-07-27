import type { FeatureModule } from "@/shell/feature-types";

export const tasksFeature: FeatureModule = {
  id: "tasks",
  title: "Tasks",
  titleAr: "المهام",
  icon: "tasks",
  order: 30,
  navGroup: "primary",
  routePath: "/tasks",
  enabled: true,
  requiredPermission: "projects.read",
  load: () => import("./TasksPage"),
};
