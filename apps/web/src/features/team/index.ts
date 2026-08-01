import type { FeatureModule } from "@/shell/feature-types";

export const teamFeature: FeatureModule = {
  id: "team",
  title: "Team",
  titleAr: "الفريق",
  icon: "team",
  order: 40,
  navGroup: "primary",
  routePath: "/team",
  enabled: true,
  /*
   * Deliberately no `requiredPermission`, and this is a change from gating the
   * whole page on `users.read`.
   *
   * The page now holds three registers with three different answers. The people
   * directory is open to everyone: it shows the colleagues you share a project
   * with, which project membership already discloses — the workspace lists
   * them — so hiding the page would leave a site engineer unable to name the
   * person they are working beside, while protecting nothing. Administering
   * accounts and roles still needs `users.read` and `user_types.read`, and
   * those segments are absent, not disabled, for anybody without them.
   *
   * Gating the route instead would put the open register behind the
   * administrative permission, which is the arrangement this replaces.
   */
  load: () => import("./TeamPage"),
};
