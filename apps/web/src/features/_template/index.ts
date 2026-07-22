/**
 * Template feature — NOT registered in the nav (enabled: false + folder name _template).
 * Copy this folder to add a real feature in P1+.
 */
import type { FeatureModule } from "@/shell/feature-types";

export const templateFeature: FeatureModule = {
  id: "_template",
  title: "Template",
  icon: "overview",
  order: 9999,
  navGroup: "primary",
  routePath: "/_template",
  enabled: false,
  load: () => import("@/shell/ShellEmptyState"),
};
