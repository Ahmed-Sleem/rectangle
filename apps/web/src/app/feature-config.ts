/**
 * Instance-level feature configuration for Rectangle.
 *
 * This is the first production step toward company-specific installations: the
 * shell still discovers feature modules from code, while this config decides
 * what an installation exposes, how it is ordered, and how labels can be
 * overridden without editing shell components.
 */
import type { FeatureModule, NavGroup } from "@/shell/feature-types";

export interface FeatureConfigEntry {
  id: string;
  enabled?: boolean;
  order?: number;
  navGroup?: NavGroup;
  title?: string;
  titleAr?: string;
}

export type FeatureConfig = readonly FeatureConfigEntry[];

export const rectangleFeatureConfig = [
  { id: "overview", enabled: true, order: 10, title: "Overview", titleAr: "نظرة عامة" },
  { id: "projects", enabled: true, order: 20, title: "Projects", titleAr: "المشاريع" },
  { id: "analytics", enabled: true, order: 30, title: "Analytics", titleAr: "التحليلات" },
  { id: "team", enabled: true, order: 40, title: "Team", titleAr: "الفريق" },
  { id: "settings", enabled: true, order: 50, title: "Settings", titleAr: "الإعدادات" },
  { id: "profile", enabled: true, order: 900, title: "Profile", titleAr: "الملف الشخصي" },
  { id: "logout", enabled: true, order: 910, title: "Logout", titleAr: "تسجيل الخروج" },
] as const satisfies FeatureConfig;

const MIN_ORDER = 0;
const MAX_ORDER = 9999;
const MAX_TITLE_LENGTH = 40;

export function validateFeatureConfig(
  config: FeatureConfig,
  availableFeatureIds: ReadonlySet<string>,
): string[] {
  const issues: string[] = [];
  const seen = new Set<string>();

  for (const entry of config) {
    if (!entry.id.trim()) {
      issues.push("Feature config entry id is required.");
      continue;
    }

    if (seen.has(entry.id)) {
      issues.push(`Feature config id '${entry.id}' is duplicated.`);
    }
    seen.add(entry.id);

    if (!availableFeatureIds.has(entry.id)) {
      issues.push(`Feature config id '${entry.id}' does not match a discovered feature.`);
    }

    if (entry.order !== undefined && (!Number.isInteger(entry.order) || entry.order < MIN_ORDER || entry.order > MAX_ORDER)) {
      issues.push(`Feature config '${entry.id}' order must be an integer between ${MIN_ORDER} and ${MAX_ORDER}.`);
    }

    if (entry.navGroup !== undefined && entry.navGroup !== "primary" && entry.navGroup !== "footer") {
      issues.push(`Feature config '${entry.id}' navGroup must be primary or footer.`);
    }

    if (entry.title !== undefined && (entry.title.trim().length === 0 || entry.title.length > MAX_TITLE_LENGTH)) {
      issues.push(`Feature config '${entry.id}' title must be 1-${MAX_TITLE_LENGTH} characters.`);
    }

    if (entry.titleAr !== undefined && (entry.titleAr.trim().length === 0 || entry.titleAr.length > MAX_TITLE_LENGTH)) {
      issues.push(`Feature config '${entry.id}' Arabic title must be 1-${MAX_TITLE_LENGTH} characters.`);
    }
  }

  return issues;
}

export function applyFeatureConfig(
  features: FeatureModule[],
  config: FeatureConfig,
): FeatureModule[] {
  const availableIds = new Set(features.map((feature) => feature.id));
  const issues = validateFeatureConfig(config, availableIds);
  if (issues.length > 0) {
    throw new Error(`Invalid Rectangle feature configuration:\n${issues.join("\n")}`);
  }

  const configById = new Map(config.map((entry) => [entry.id, entry]));

  return features
    .map((feature) => {
      const override = configById.get(feature.id);
      if (!override) return { ...feature };

      return {
        ...feature,
        enabled: override.enabled ?? feature.enabled,
        order: override.order ?? feature.order,
        navGroup: override.navGroup ?? feature.navGroup,
        title: override.title ?? feature.title,
        titleAr: override.titleAr ?? feature.titleAr,
      };
    })
    .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));
}
