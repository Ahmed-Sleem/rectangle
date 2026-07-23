/**
 * Feature modules already carry English and Arabic labels. This helper keeps
 * shell navigation and browser/page titles consistent while we transition to a
 * full feature-namespace translation system.
 */
import type { FeatureModule } from "@/shell/feature-types";
import type { RectangleLanguage } from "./resources";

export function getLocalizedFeatureTitle(
  feature: FeatureModule | undefined,
  language: RectangleLanguage,
  fallback: string,
): string {
  if (!feature) return fallback;
  if (language === "ar" && feature.titleAr) return feature.titleAr;
  return feature.title;
}
