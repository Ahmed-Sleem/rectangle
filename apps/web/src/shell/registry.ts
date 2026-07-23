import { applyFeatureConfig, rectangleFeatureConfig } from "@/app/feature-config";
import type { FeatureModule, NavGroup } from "./feature-types";

/**
 * Eager glob of feature public APIs.
 * `_template` is excluded from registration.
 */
const featureModules = import.meta.glob("../features/*/index.ts", {
  eager: true,
}) as Record<string, Record<string, unknown>>;

function isFeatureModule(value: unknown): value is FeatureModule {
  if (!value || typeof value !== "object") return false;
  const v = value as Partial<FeatureModule>;
  return (
    typeof v.id === "string" &&
    typeof v.title === "string" &&
    typeof v.routePath === "string" &&
    typeof v.order === "number" &&
    typeof v.enabled === "boolean" &&
    typeof v.load === "function" &&
    (v.navGroup === "primary" || v.navGroup === "footer")
  );
}

function collectFeatures(): FeatureModule[] {
  const list: FeatureModule[] = [];

  for (const [path, mod] of Object.entries(featureModules)) {
    if (path.includes("/_template/")) continue;

    for (const exported of Object.values(mod)) {
      if (isFeatureModule(exported) && exported.id !== "_template") {
        list.push(exported);
      }
    }
  }

  return list.sort((a, b) => a.order - b.order);
}

const ALL_FEATURES = applyFeatureConfig(collectFeatures(), rectangleFeatureConfig);

export function getAllFeatures(): FeatureModule[] {
  return ALL_FEATURES.slice();
}

export function getEnabledFeatures(): FeatureModule[] {
  return ALL_FEATURES.filter((f) => f.enabled);
}

export function getNavFeatures(group: NavGroup): FeatureModule[] {
  return getEnabledFeatures().filter((f) => f.navGroup === group);
}

export function getFeatureById(id: string): FeatureModule | undefined {
  return ALL_FEATURES.find((f) => f.id === id);
}

/**
 * Resolve feature for a pathname.
 * Exact match preferred; `/` only matches overview index.
 */
export function getFeatureByPath(pathname: string): FeatureModule | undefined {
  const normalized =
    pathname.length > 1 && pathname.endsWith("/")
      ? pathname.slice(0, -1)
      : pathname;

  const enabled = getEnabledFeatures();
  const exact = enabled.find((f) => f.routePath === normalized);
  if (exact) return exact;

  return enabled
    .filter((f) => f.routePath !== "/")
    .find((f) => normalized.startsWith(`${f.routePath}/`));
}
