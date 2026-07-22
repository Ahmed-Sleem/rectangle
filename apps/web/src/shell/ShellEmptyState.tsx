export interface ShellEmptyStateProps {
  featureId?: string;
  title?: string;
}

export default function ShellEmptyState({
  featureId = "module",
  title = "Module",
}: ShellEmptyStateProps = {}) {
  return (
    <div className="rect-empty" role="status">
      <div className="rect-empty__card">
        <h2 className="rect-empty__title">{title}</h2>
        <p className="rect-empty__text">
          This module is not implemented yet.
        </p>
        <span className="rect-empty__badge">{featureId}</span>
      </div>
    </div>
  );
}
