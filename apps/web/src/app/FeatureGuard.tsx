/**
 * Refuses a page the signed-in person may not open.
 *
 * The navigation already hides those features, but a bookmark, a shared link
 * or a typed URL reaches the route directly. Without this the page mounts,
 * calls an API that answers 403, and renders a generic error — telling the
 * person the system is broken when it is working exactly as configured.
 *
 * This is presentation. The server refuses the data regardless; the guard only
 * decides which of two honest screens is shown.
 */
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { canOpenFeature, useOptionalAuth } from "@/shared/auth";
import { NoPermissionState } from "@/shared/ui";

export function FeatureGuard({
  requiredPermission,
  children,
}: {
  requiredPermission?: string;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const auth = useOptionalAuth();

  // While authority is still loading, render nothing rather than a refusal
  // that would flash and then correct itself.
  if (auth?.loading) return null;

  if (!canOpenFeature(auth?.user, requiredPermission)) {
    return (
      <NoPermissionState
        title={t("common.noPermissionTitle")}
        message={t("common.noPermissionMessage")}
      />
    );
  }

  return <>{children}</>;
}
