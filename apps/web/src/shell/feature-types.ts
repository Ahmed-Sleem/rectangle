import type { ComponentType } from "react";

export type NavGroup = "primary" | "footer";

export type FeatureIconName =
  | "overview"
  | "projects"
  | "analytics"
  | "team"
  | "settings"
  | "profile"
  | "logout";

export interface FeatureModule {
  /** Stable id — used in URLs and tests */
  id: string;
  title: string;
  /** Optional; reserved for P1 i18n */
  titleAr?: string;
  icon: FeatureIconName;
  order: number;
  navGroup: NavGroup;
  /** Absolute path from root, e.g. /projects */
  routePath: string;
  enabled: boolean;
  /**
   * Lazy loader for the page component default export.
   * P0: thin empty-state wrappers only.
   */
  load: () => Promise<{ default: ComponentType }>;
}
