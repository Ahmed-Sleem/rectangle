/** Project detail page reads one real project record from the API. */
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { Badge, Card, EmptyState, PageGrid } from "@/shared/ui";
import { getProject } from "./project-api";
import "./ProjectsPage.css";

export default function ProjectDetailPage() {
  const { projectId } = useParams();
  const project = useQuery({
    queryKey: ["project", projectId],
    queryFn: () => getProject(projectId ?? ""),
    enabled: Boolean(projectId),
  });

  if (project.isLoading) return <EmptyState title="Loading project" message="Preparing project details…" />;
  if (!project.data?.project) return <EmptyState title="Project not found" message="The project could not be opened." />;

  const item = project.data.project;
  return (
    <section className="rect-project-detail" aria-label={item.name}>
      <Link className="rect-projects-link" to="/projects">← Projects</Link>
      <div className="rect-project-detail__header">
        <div>
          <h2>{item.name}</h2>
          <p>{item.code}</p>
        </div>
        <Badge tone="info">{item.status.replace("_", " ")}</Badge>
      </div>
      <PageGrid columns={12}>
        <Card className="rect-project-detail__card"><h3>Location</h3><p>{item.locationName ?? "—"}</p></Card>
        <Card className="rect-project-detail__card"><h3>Dates</h3><p>{item.plannedStartDate && item.plannedFinishDate ? `${item.plannedStartDate} → ${item.plannedFinishDate}` : "—"}</p></Card>
        <Card className="rect-project-detail__card"><h3>Budget</h3><p>{item.budgetAmount && item.budgetCurrency ? `${item.budgetAmount} ${item.budgetCurrency}` : "—"}</p></Card>
      </PageGrid>
      <Card className="rect-project-detail__summary"><h3>Description</h3><p>{item.description || "No description added."}</p></Card>
    </section>
  );
}
