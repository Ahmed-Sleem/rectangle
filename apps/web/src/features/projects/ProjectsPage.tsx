/**
 * Production-safe Projects shell. It introduces the registry UX without fake
 * project data or local-only CRUD until Rectangle has a real backend, authz,
 * validation, and audit trail.
 */
import { Building2, ClipboardList, Database, LockKeyhole, MapPinned, ShieldCheck, UsersRound } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Badge, Button, Card, DataTable, EmptyState, PageGrid, Toolbar } from "@/shared/ui";
import "./ProjectsPage.css";

interface ReadinessItem {
  id: string;
  title: string;
  description: string;
  icon: ReactNode;
}

interface FieldModelRow {
  id: string;
  field: string;
  rule: string;
  reason: string;
}

export default function ProjectsPage() {
  const { t } = useTranslation();

  const readinessItems: ReadinessItem[] = [
    {
      id: "registry",
      title: t("projects.readiness.registryTitle"),
      description: t("projects.readiness.registryDescription"),
      icon: <ClipboardList size={18} strokeWidth={2} />,
    },
    {
      id: "permissions",
      title: t("projects.readiness.permissionsTitle"),
      description: t("projects.readiness.permissionsDescription"),
      icon: <LockKeyhole size={18} strokeWidth={2} />,
    },
    {
      id: "stakeholders",
      title: t("projects.readiness.stakeholdersTitle"),
      description: t("projects.readiness.stakeholdersDescription"),
      icon: <UsersRound size={18} strokeWidth={2} />,
    },
    {
      id: "controls",
      title: t("projects.readiness.controlsTitle"),
      description: t("projects.readiness.controlsDescription"),
      icon: <ShieldCheck size={18} strokeWidth={2} />,
    },
  ];

  const fieldRows: FieldModelRow[] = [
    {
      id: "name",
      field: t("projects.fields.name"),
      rule: t("projects.fieldRules.name"),
      reason: t("projects.fieldReasons.name"),
    },
    {
      id: "code",
      field: t("projects.fields.code"),
      rule: t("projects.fieldRules.code"),
      reason: t("projects.fieldReasons.code"),
    },
    {
      id: "status",
      field: t("projects.fields.status"),
      rule: t("projects.fieldRules.status"),
      reason: t("projects.fieldReasons.status"),
    },
    {
      id: "dates",
      field: t("projects.fields.dates"),
      rule: t("projects.fieldRules.dates"),
      reason: t("projects.fieldReasons.dates"),
    },
    {
      id: "budget",
      field: t("projects.fields.budget"),
      rule: t("projects.fieldRules.budget"),
      reason: t("projects.fieldReasons.budget"),
    },
  ];

  return (
    <section className="rect-projects-page" aria-labelledby="projects-shell-heading">
      <div className="rect-projects-hero">
        <div className="rect-projects-hero__icon" aria-hidden>
          <Building2 size={22} strokeWidth={1.9} />
        </div>
        <div className="rect-projects-hero__content">
          <div className="rect-projects-hero__meta">
            <Badge tone="info">{t("projects.shellBadge")}</Badge>
            <Badge tone="warning">{t("projects.noFakeDataBadge")}</Badge>
          </div>
          <h2 id="projects-shell-heading">{t("projects.shellTitle")}</h2>
          <p>{t("projects.shellDescription")}</p>
        </div>
        <Toolbar className="rect-projects-hero__actions" aria-label={t("projects.actionsLabel")}>
          <Button variant="primary" disabled title={t("projects.createDisabledReason")}>
            {t("projects.createProject")}
          </Button>
        </Toolbar>
      </div>

      <EmptyState
        title={t("projects.emptyTitle")}
        message={t("projects.emptyMessage")}
        action={<span className="rect-projects-disabled-note">{t("projects.createDisabledReason")}</span>}
      />

      <PageGrid columns={12} className="rect-projects-readiness" aria-label={t("projects.readinessLabel")}>
        {readinessItems.map((item) => (
          <Card key={item.id} as="article" className="rect-projects-readiness-card">
            <span className="rect-projects-readiness-card__icon" aria-hidden>
              {item.icon}
            </span>
            <h3>{item.title}</h3>
            <p>{item.description}</p>
          </Card>
        ))}
      </PageGrid>

      <div className="rect-projects-model">
        <div className="rect-projects-model__intro">
          <span className="rect-projects-model__icon" aria-hidden>
            <Database size={18} strokeWidth={2} />
          </span>
          <div>
            <h3>{t("projects.modelTitle")}</h3>
            <p>{t("projects.modelDescription")}</p>
          </div>
        </div>
        <DataTable
          columns={[
            { id: "field", header: t("projects.table.field"), accessor: (row) => row.field },
            { id: "rule", header: t("projects.table.rule"), accessor: (row) => row.rule },
            { id: "reason", header: t("projects.table.reason"), accessor: (row) => row.reason },
          ]}
          rows={fieldRows}
          getRowKey={(row) => row.id}
          caption={t("projects.modelTitle")}
        />
      </div>

      <Card as="section" className="rect-projects-next">
        <span className="rect-projects-next__icon" aria-hidden>
          <MapPinned size={18} strokeWidth={2} />
        </span>
        <div>
          <h3>{t("projects.nextTitle")}</h3>
          <p>{t("projects.nextDescription")}</p>
        </div>
      </Card>
    </section>
  );
}
