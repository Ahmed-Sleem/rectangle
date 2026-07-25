import { useTranslation } from "react-i18next";

export interface ShellEmptyStateProps {
  featureId?: string;
  title?: string;
}

/**
 * Neutral, user-facing empty state for a workspace that holds no records yet.
 * Never expose internal identifiers, build status, or implementation wording here.
 */
export default function ShellEmptyState({
  featureId = "module",
  title = "Module",
}: ShellEmptyStateProps = {}) {
  const { t } = useTranslation();

  const localizedTitle = t(`feature.${featureId}`, { defaultValue: title });

  return (
    <div className="rect-empty" role="status">
      <div className="rect-empty__card">
        <h2 className="rect-empty__title">{localizedTitle}</h2>
        <p className="rect-empty__text">{t("common.noRecordsYet")}</p>
      </div>
    </div>
  );
}
