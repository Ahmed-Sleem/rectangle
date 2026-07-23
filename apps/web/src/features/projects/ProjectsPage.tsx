/**
 * Projects workspace landing page. It shows end-user project organization value
 * without exposing internal implementation state or non-working controls.
 */
import { Building2, ClipboardList, MapPinned, TrendingUp, UsersRound } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Card, EmptyState, PageGrid } from "@/shared/ui";
import "./ProjectsPage.css";

interface ProjectArea {
  id: string;
  title: string;
  description: string;
  icon: ReactNode;
}

export default function ProjectsPage() {
  const { t } = useTranslation();

  const projectAreas: ProjectArea[] = [
    {
      id: "portfolio",
      title: t("projects.areas.portfolioTitle"),
      description: t("projects.areas.portfolioDescription"),
      icon: <ClipboardList size={18} strokeWidth={2} />,
    },
    {
      id: "team",
      title: t("projects.areas.teamTitle"),
      description: t("projects.areas.teamDescription"),
      icon: <UsersRound size={18} strokeWidth={2} />,
    },
    {
      id: "locations",
      title: t("projects.areas.locationsTitle"),
      description: t("projects.areas.locationsDescription"),
      icon: <MapPinned size={18} strokeWidth={2} />,
    },
    {
      id: "controls",
      title: t("projects.areas.controlsTitle"),
      description: t("projects.areas.controlsDescription"),
      icon: <TrendingUp size={18} strokeWidth={2} />,
    },
  ];

  return (
    <section className="rect-projects-page" aria-labelledby="projects-page-heading">
      <div className="rect-projects-hero">
        <div className="rect-projects-hero__icon" aria-hidden>
          <Building2 size={22} strokeWidth={1.9} />
        </div>
        <div className="rect-projects-hero__content">
          <h2 id="projects-page-heading">{t("projects.pageTitle")}</h2>
          <p>{t("projects.pageDescription")}</p>
        </div>
      </div>

      <EmptyState
        title={t("projects.emptyTitle")}
        message={t("projects.emptyMessage")}
      />

      <PageGrid columns={12} className="rect-projects-areas" aria-label={t("projects.areasLabel")}>
        {projectAreas.map((area) => (
          <Card key={area.id} as="article" className="rect-projects-area-card">
            <span className="rect-projects-area-card__icon" aria-hidden>
              {area.icon}
            </span>
            <h3>{area.title}</h3>
            <p>{area.description}</p>
          </Card>
        ))}
      </PageGrid>
    </section>
  );
}
