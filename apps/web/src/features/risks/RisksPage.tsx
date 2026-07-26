/**
 * Risk and issue register.
 *
 * The matrix and the table are two views of one query: selecting a cell filters
 * the register beneath it, so the grid is a control rather than a picture.
 * Everything shown is a stored record — there is no AI banner here, because no
 * model is connected and a recommendation with nothing behind it is a claim.
 */
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LayoutGrid, Rows3 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { Link, useSearchParams } from "react-router-dom";
import { z } from "zod";
import { ApiClientError } from "@/shared/api/client";
import { useOptionalAuth } from "@/shared/auth";
import { getCurrentLanguage } from "@/shared/i18n";
import {
  Badge, BreakdownBar, Button, buttonClassName, CardGrid, ConfirmDialog, DataTable,
  EmptyState, ErrorState, Field, FormDialog, InsightBanner, Input, LoadingState,
  PageToolbar, Select, SidePanel, StatCard, StatRow, Textarea,
} from "@/shared/ui";
import { listProjectMembers, listProjects } from "@/features/projects/project-api";
import { listTasks } from "@/features/tasks/task-api";
import {
  createRisk, deleteRisk, getRiskSummary, listRisks, updateRisk,
  type RiskCategory, type RiskKind, type RiskRecord, type RiskSeverity, type RiskStatus,
} from "./risk-api";
import "./RisksPage.css";

const KINDS: readonly RiskKind[] = ["risk", "issue"];
const STATUSES: readonly RiskStatus[] = ["open", "assessing", "mitigating", "accepted", "closed", "occurred"];
const CATEGORIES: readonly RiskCategory[] = [
  "safety", "quality", "schedule", "cost", "design",
  "procurement", "environmental", "regulatory", "other",
];
const SCALE = [1, 2, 3, 4, 5] as const;

type ViewMode = "cards" | "table";

const VIEW_STORAGE_KEY = "rectangle.risks.view";

/** The chosen layout is a preference, so it survives navigation and reloads. */
function readStoredView(): ViewMode {
  if (typeof window === "undefined") return "table";
  try {
    return window.localStorage.getItem(VIEW_STORAGE_KEY) === "cards" ? "cards" : "table";
  } catch {
    return "table";
  }
}

function storeView(value: ViewMode): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(VIEW_STORAGE_KEY, value);
  } catch {
    /* Private browsing must not break the toggle. */
  }
}

const riskSchema = z.object({
  projectId: z.string().min(1),
  kind: z.enum(KINDS),
  title: z.string().trim().min(2).max(200),
  description: z.string().trim().max(4000).optional(),
  category: z.enum(CATEGORIES),
  probability: z.string().regex(/^[1-5]$/u),
  impact: z.string().regex(/^[1-5]$/u),
  status: z.enum(STATUSES),
  mitigation: z.string().trim().max(4000).optional(),
  ownerUserId: z.string().optional(),
  mitigationTaskId: z.string().optional(),
  dueDate: z.string().optional(),
});

type RiskForm = z.infer<typeof riskSchema>;

/** Matches the severity bands the backend derives, so colour never disagrees. */
function severityTone(severity: RiskSeverity): "danger" | "warning" | "info" | "neutral" {
  if (severity === "critical") return "danger";
  if (severity === "high") return "warning";
  if (severity === "medium") return "info";
  return "neutral";
}

function statusTone(status: RiskStatus): "success" | "warning" | "danger" | "info" | "neutral" {
  if (status === "closed") return "success";
  if (status === "occurred") return "danger";
  if (status === "mitigating") return "warning";
  if (status === "assessing") return "info";
  return "neutral";
}

/** BreakdownBar tones, matching the badge colours a severity already uses. */
function breakdownTone(severity: RiskSeverity): "danger" | "warning" | "info" | "neutral" {
  return severityTone(severity);
}

/** Band for a matrix cell, from the same thresholds the domain applies. */
function cellSeverity(score: number): RiskSeverity {
  if (score >= 15) return "critical";
  if (score >= 10) return "high";
  if (score >= 5) return "medium";
  return "low";
}

export default function RisksPage() {
  const { t } = useTranslation();
  const language = getCurrentLanguage();
  const auth = useOptionalAuth();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  // Arriving from a project workspace or from search pre-selects that project.
  const [search, setSearch] = useState("");
  const [view, setView] = useState<ViewMode>(() => readStoredView());
  const [projectFilter, setProjectFilter] = useState(() => searchParams.get("projectId") ?? "");
  const [kindFilter, setKindFilter] = useState<RiskKind | "">("");
  const [statusFilter, setStatusFilter] = useState<RiskStatus | "">("");
  const [categoryFilter, setCategoryFilter] = useState<RiskCategory | "">("");
  const [mineOnly, setMineOnly] = useState(false);
  const [openOnly, setOpenOnly] = useState(false);
  const [cell, setCell] = useState<{ probability: number; impact: number } | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<RiskRecord | null>(null);
  const [pendingDelete, setPendingDelete] = useState<RiskRecord | null>(null);

  const canManage =
    auth?.user?.roles.some((role) =>
      ["tenant_owner", "tenant_admin", "project_admin", "project_manager"].includes(role),
    ) || auth?.user?.permissions.includes("projects.manage") || false;

  const filters = {
    ...(search.trim() ? { search: search.trim() } : {}),
    ...(projectFilter ? { projectId: projectFilter } : {}),
    ...(kindFilter ? { kind: kindFilter } : {}),
    ...(statusFilter ? { status: statusFilter } : {}),
    ...(categoryFilter ? { category: categoryFilter } : {}),
    ...(mineOnly ? { mine: true } : {}),
    ...(openOnly ? { openOnly: true } : {}),
    ...(cell ? { probability: cell.probability, impact: cell.impact } : {}),
  };

  const risksQuery = useQuery({
    queryKey: ["risks", filters],
    queryFn: () => listRisks(filters),
    placeholderData: (previous) => previous,
  });
  // The matrix reflects the project scope but not the cell selection: a grid
  // that emptied when you clicked it could never be clicked twice.
  const summaryQuery = useQuery({
    queryKey: ["risks", "summary", projectFilter],
    queryFn: () => getRiskSummary(projectFilter || undefined),
  });
  const projectsQuery = useQuery({ queryKey: ["projects", {}], queryFn: () => listProjects() });
  const projects = useMemo(() => projectsQuery.data?.projects ?? [], [projectsQuery.data]);

  const form = useForm<RiskForm>({
    resolver: zodResolver(riskSchema),
    defaultValues: {
      projectId: "", kind: "risk", title: "", description: "", category: "other",
      probability: "3", impact: "3", status: "open", mitigation: "",
      ownerUserId: "", mitigationTaskId: "", dueDate: "",
    },
  });

  const selectedProjectId = form.watch("projectId");

  const members = useQuery({
    queryKey: ["project", selectedProjectId, "members"],
    queryFn: () => listProjectMembers(selectedProjectId),
    enabled: Boolean(selectedProjectId),
  });
  const projectTasks = useQuery({
    queryKey: ["tasks", { projectId: selectedProjectId }],
    queryFn: () => listTasks({ projectId: selectedProjectId }),
    enabled: Boolean(selectedProjectId),
  });

  useEffect(() => {
    if (editing) {
      form.reset({
        projectId: editing.projectId,
        kind: editing.kind,
        title: editing.title,
        description: editing.description ?? "",
        category: editing.category,
        probability: String(editing.probability),
        impact: String(editing.impact),
        status: editing.status,
        mitigation: editing.mitigation ?? "",
        ownerUserId: editing.ownerUserId ?? "",
        mitigationTaskId: editing.mitigationTaskId ?? "",
        dueDate: editing.dueDate ?? "",
      });
    }
  }, [editing, form]);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["risks"] });

  const create = useMutation({
    mutationFn: (values: RiskForm) =>
      createRisk(values.projectId, {
        kind: values.kind,
        title: values.title,
        category: values.category,
        probability: Number(values.probability),
        impact: Number(values.impact),
        status: values.status,
        ...(values.description ? { description: values.description } : {}),
        ...(values.mitigation ? { mitigation: values.mitigation } : {}),
        ...(values.ownerUserId ? { ownerUserId: values.ownerUserId } : {}),
        ...(values.mitigationTaskId ? { mitigationTaskId: values.mitigationTaskId } : {}),
        ...(values.dueDate ? { dueDate: values.dueDate } : {}),
      }),
    onSuccess: async () => { await invalidate(); form.reset(); setCreateOpen(false); },
  });

  const save = useMutation({
    mutationFn: ({ riskId, values }: { riskId: string; values: RiskForm }) =>
      updateRisk(riskId, {
        kind: values.kind,
        title: values.title,
        category: values.category,
        probability: Number(values.probability),
        impact: Number(values.impact),
        status: values.status,
        // Empty means cleared, which the API expresses as null.
        description: values.description || null,
        mitigation: values.mitigation || null,
        ownerUserId: values.ownerUserId || null,
        mitigationTaskId: values.mitigationTaskId || null,
        dueDate: values.dueDate || null,
      }),
    onSuccess: async () => { await invalidate(); setEditing(null); },
  });

  const remove = useMutation({
    mutationFn: (riskId: string) => deleteRisk(riskId),
    onSuccess: async () => { await invalidate(); setPendingDelete(null); },
  });

  const messageFor = (error: unknown, fallback: string) =>
    error instanceof ApiClientError ? error.message : error ? fallback : null;

  const rows = useMemo(() => risksQuery.data?.risks ?? [], [risksQuery.data]);
  const summary = summaryQuery.data?.summary;
  const isFiltered = Boolean(
    search.trim() || projectFilter || kindFilter || statusFilter || categoryFilter ||
    mineOnly || openOnly || cell,
  );

  // Indexed for constant-time lookup while drawing twenty-five cells.
  const matrixCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const entry of summary?.matrix ?? []) {
      counts.set(`${entry.probability}:${entry.impact}`, entry.count);
    }
    return counts;
  }, [summary?.matrix]);

  // Denominator for both breakdowns: the bars describe live exposure, so a
  // settled entry must not shrink every bar beside it.
  const liveCount = (summary?.total ?? 0) - (summary?.closed ?? 0);
  const dateFormatter = new Intl.DateTimeFormat(language, { dateStyle: "medium" });

  function clearFilters() {
    setSearch("");
    setProjectFilter(""); setKindFilter(""); setStatusFilter("");
    setCategoryFilter(""); setMineOnly(false); setOpenOnly(false); setCell(null);
    setSearchParams({}, { replace: true });
  }

  if (risksQuery.isError) {
    return (
      <ErrorState
        title={t("risks.errorTitle")}
        message={t("risks.errorMessage")}
        action={<Button variant="secondary" onClick={() => void risksQuery.refetch()}>{t("risks.tryAgain")}</Button>}
      />
    );
  }

  if (risksQuery.isLoading) {
    return <LoadingState title={t("risks.loadingTitle")} message={t("risks.loadingMessage")} />;
  }

  return (
    <section className="rect-risks-page" aria-label={t("risks.pageLabel")}>
      <PageToolbar<ViewMode>
        search={{
          value: search,
          onChange: setSearch,
          label: t("risks.searchLabel"),
          placeholder: t("risks.searchPlaceholder"),
        }}
        view={{
          value: view,
          label: t("risks.cardView"),
          onChange: (next) => { setView(next); storeView(next); },
          options: [
            { value: "cards", label: t("risks.cardView"), icon: <LayoutGrid size={16} strokeWidth={2} aria-hidden /> },
            { value: "table", label: t("risks.tableView"), icon: <Rows3 size={16} strokeWidth={2} aria-hidden /> },
          ],
        }}
        filters={[
          {
            id: "project",
            type: "select",
            label: t("risks.filterProject"),
            anyLabel: t("risks.allProjects"),
            value: projectFilter,
            options: projects.map((project) => ({ value: project.id, label: project.name })),
            onChange: (value) => {
              setProjectFilter(value);
              setSearchParams(value ? { projectId: value } : {}, { replace: true });
            },
          },
          {
            id: "kind",
            type: "select",
            label: t("risks.filterKind"),
            anyLabel: t("risks.allKinds"),
            value: kindFilter,
            options: KINDS.map((value) => ({ value, label: t(`enums.riskKind.${value}`) })),
            onChange: (value) => setKindFilter(value as RiskKind | ""),
          },
          {
            id: "status",
            type: "select",
            label: t("risks.filterStatus"),
            anyLabel: t("risks.allStatuses"),
            value: statusFilter,
            options: STATUSES.map((value) => ({ value, label: t(`enums.riskStatus.${value}`) })),
            onChange: (value) => setStatusFilter(value as RiskStatus | ""),
          },
          {
            id: "category",
            type: "select",
            label: t("risks.filterCategory"),
            anyLabel: t("risks.allCategories"),
            value: categoryFilter,
            options: CATEGORIES.map((value) => ({ value, label: t(`enums.riskCategory.${value}`) })),
            onChange: (value) => setCategoryFilter(value as RiskCategory | ""),
          },
          { id: "mine", type: "toggle", label: t("risks.onlyMine"), value: mineOnly, onChange: setMineOnly },
          { id: "open", type: "toggle", label: t("risks.openOnly"), value: openOnly, onChange: setOpenOnly },
        ]}
        onClearFilters={clearFilters}
        actions={
          canManage ? (
            <Button
              variant="primary"
              onClick={() => { form.reset(); setCreateOpen(true); }}
              disabled={projects.length === 0}
              {...(projects.length === 0 ? { title: t("risks.noProjectsMessage") } : {})}
            >
              {t("risks.create")}
            </Button>
          ) : null
        }
      />

      {/* No model is connected yet, so the banner explains itself rather than
          asserting a finding. The state becomes `ready` with citations the
          moment one is. */}
      <InsightBanner surface="risks" state={{ status: "unavailable" }} />

      {summary && summary.total > 0 ? (
        <StatRow label={t("risks.registerLabel")}>
          <StatCard label={t("risks.kpiTotal")} value={summary.total} />
          <StatCard
            label={t("risks.kpiCriticalHigh")}
            value={summary.criticalOrHigh}
            emphasis={summary.criticalOrHigh > 0}
          />
          <StatCard label={t("risks.kpiUnderReview")} value={summary.underReview} />
          <StatCard label={t("risks.kpiClosed")} value={summary.closed} />
        </StatRow>
      ) : null}

      {projects.length === 0 ? (
        <EmptyState
          title={t("risks.noProjectsTitle")}
          message={t("risks.noProjectsMessage")}
          action={<Link className={buttonClassName("primary")} to="/projects">{t("risks.goToProjects")}</Link>}
        />
      ) : (
        <>
          <div className="rect-risks__columns">
            <div className="rect-risks__main">
              {rows.length === 0 && isFiltered ? (
                <EmptyState
                  title={t("risks.noMatchTitle")}
                  message={t("risks.noMatchMessage")}
                  action={<Button variant="secondary" onClick={clearFilters}>{t("risks.clearFilters")}</Button>}
                />
              ) : rows.length === 0 ? (
                <EmptyState
                  title={t("risks.emptyTitle")}
                  message={canManage ? t("risks.emptyManage") : t("risks.emptyRead")}
                  {...(canManage
                    ? { action: <Button variant="primary" onClick={() => setCreateOpen(true)}>{t("risks.create")}</Button> }
                    : {})}
                />
              ) : view === "cards" ? (
                <CardGrid label={t("risks.registerLabel")}>
                  {rows.map((risk) => (
                    <article key={risk.id} className="rect-risk-card" role="listitem">
                      <header className="rect-risk-card__head">
                        <Badge tone={severityTone(risk.severity)}>
                          {t(`enums.riskSeverity.${risk.severity}`)}
                        </Badge>
                        <Badge tone={risk.kind === "issue" ? "danger" : "neutral"}>
                          {t(`enums.riskKind.${risk.kind}`)}
                        </Badge>
                        <span className="rect-risk-card__score">
                          {t("risks.scoreLabel", { score: risk.score })}
                        </span>
                      </header>

                      {canManage ? (
                        <button type="button" className="rect-risk__link" onClick={() => setEditing(risk)}>
                          {risk.title}
                        </button>
                      ) : (
                        <span className="rect-risk-card__title">{risk.title}</span>
                      )}

                      <dl className="rect-risk-card__facts">
                        <div>
                          <dt>{t("risks.columnProject")}</dt>
                          <dd>{risk.projectCode}</dd>
                        </div>
                        <div>
                          <dt>{t("risks.columnOwner")}</dt>
                          <dd>{risk.ownerName ?? t("risks.unassigned")}</dd>
                        </div>
                        <div>
                          <dt>{t("risks.columnStatus")}</dt>
                          <dd>{t(`enums.riskStatus.${risk.status}`)}</dd>
                        </div>
                        <div>
                          <dt>{t("risks.columnDue")}</dt>
                          <dd>
                            {risk.dueDate
                              ? dateFormatter.format(new Date(`${risk.dueDate}T00:00:00`))
                              : t("common.notAvailable")}
                          </dd>
                        </div>
                      </dl>
                    </article>
                  ))}
                </CardGrid>
              ) : (
                <DataTable
                  caption={t("risks.registerLabel")}
                  rows={rows}
                  getRowKey={(risk) => risk.id}
                  columns={[
                    {
                      id: "title",
                      header: t("risks.columnTitle"),
                      accessor: (risk) => (
                        <span className="rect-risk__title">
                          <Badge tone={risk.kind === "issue" ? "danger" : "neutral"}>
                            {t(`enums.riskKind.${risk.kind}`)}
                          </Badge>
                          {canManage ? (
                            <button type="button" className="rect-risk__link" onClick={() => setEditing(risk)}>
                              {risk.title}
                            </button>
                          ) : (
                            <span>{risk.title}</span>
                          )}
                        </span>
                      ),
                    },
                    { id: "project", header: t("risks.columnProject"), accessor: (risk) => risk.projectCode },
                    {
                      id: "severity",
                      header: t("risks.columnSeverity"),
                      accessor: (risk) => (
                        <Badge tone={severityTone(risk.severity)}>{t(`enums.riskSeverity.${risk.severity}`)}</Badge>
                      ),
                    },
                    {
                      id: "score",
                      header: t("risks.columnScore"),
                      accessor: (risk) => (
                        <span className="rect-risk__score">
                          {t("risks.scoreLabel", { score: risk.score })}
                          {risk.residualScore !== undefined ? (
                            <span className="rect-risk__residual">
                              {t("risks.residualLabel", { score: risk.residualScore })}
                            </span>
                          ) : null}
                        </span>
                      ),
                    },
                    { id: "owner", header: t("risks.columnOwner"), accessor: (risk) => risk.ownerName ?? t("risks.unassigned") },
                    {
                      id: "status",
                      header: t("risks.columnStatus"),
                      accessor: (risk) => <Badge tone={statusTone(risk.status)}>{t(`enums.riskStatus.${risk.status}`)}</Badge>,
                    },
                    {
                      id: "due",
                      header: t("risks.columnDue"),
                      accessor: (risk) =>
                        risk.dueDate
                          ? dateFormatter.format(new Date(`${risk.dueDate}T00:00:00`))
                          : t("common.notAvailable"),
                    },
                    ...(canManage
                      ? [{
                          id: "actions",
                          header: t("common.actions"),
                          accessor: (risk: RiskRecord) => (
                            <Button size="sm" variant="secondary" onClick={() => setPendingDelete(risk)}>
                              {t("risks.delete")}
                            </Button>
                          ),
                        }]
                      : []),
                  ]}
                />
              )}
            </div>

            {/*
              The matrix is the page's breakdown, so it belongs in the side
              panel the skeleton reserves for exactly that. Full width it left
              most of a row empty; here it keeps its natural size and the
              column beside it carries the register people work in.
            */}
            <div className="rect-risks__aside">
              <SidePanel title={t("risks.matrixTitle")}>
                {summary && summary.matrix.length > 0 ? (
                  <>
                    <p className="rect-panel-note">{t("risks.matrixHint")}</p>
                    <div className="rect-matrix__layout">
                      <span className="rect-matrix__axis rect-matrix__axis--y">{t("risks.matrixProbability")}</span>
                      <div className="rect-matrix__grid" role="group" aria-label={t("risks.matrixTitle")}>
                        {/* Highest probability at the top, as a risk matrix is
                            always drawn. */}
                        {[...SCALE].reverse().map((probability) => (
                          SCALE.map((impact) => {
                            const count = matrixCounts.get(`${probability}:${impact}`) ?? 0;
                            const selected = cell?.probability === probability && cell?.impact === impact;
                            return (
                              <button
                                key={`${probability}-${impact}`}
                                type="button"
                                className="rect-matrix__cell"
                                data-severity={cellSeverity(probability * impact)}
                                data-empty={count === 0 ? "true" : "false"}
                                aria-pressed={selected}
                                aria-label={t("risks.matrixCell", {
                                  probability: t(`enums.riskScale.${probability}`),
                                  impact: t(`enums.impactScale.${impact}`),
                                  count,
                                })}
                                onClick={() => setCell(selected ? null : { probability, impact })}
                              >
                                {count > 0 ? count : ""}
                              </button>
                            );
                          })
                        ))}
                      </div>
                      <span className="rect-matrix__axis rect-matrix__axis--x">{t("risks.matrixImpact")}</span>
                    </div>
                    {cell ? (
                      <Button size="sm" variant="secondary" onClick={() => setCell(null)}>
                        {t("risks.matrixClear")}
                      </Button>
                    ) : null}
                  </>
                ) : (
                  <p className="rect-panel-note">{t("risks.matrixEmpty")}</p>
                )}
              </SidePanel>

              <SidePanel title={t("risks.severityTitle")}>
                {(summary?.bySeverity.length ?? 0) === 0 ? (
                  <p className="rect-panel-note">{t("risks.breakdownEmpty")}</p>
                ) : (
                  summary?.bySeverity.map((band) => (
                    <BreakdownBar
                      key={band.severity}
                      label={t(`enums.riskSeverity.${band.severity}`)}
                      value={band.count}
                      total={liveCount}
                      tone={breakdownTone(band.severity)}
                    />
                  ))
                )}
              </SidePanel>

              <SidePanel title={t("risks.categoryTitle")}>
                {(summary?.byCategory.length ?? 0) === 0 ? (
                  <p className="rect-panel-note">{t("risks.breakdownEmpty")}</p>
                ) : (
                  summary?.byCategory.map((entry) => (
                    <BreakdownBar
                      key={entry.category}
                      label={t(`enums.riskCategory.${entry.category}`)}
                      value={entry.count}
                      total={liveCount}
                    />
                  ))
                )}
              </SidePanel>
            </div>
          </div>
        </>
      )}

      <FormDialog
        open={createOpen || editing !== null}
        title={editing ? t("risks.edit") : t("risks.create")}
        description={editing ? t("risks.editDescription") : t("risks.createDescription")}
        size="lg"
        onClose={() => { setCreateOpen(false); setEditing(null); }}
        onSubmit={form.handleSubmit((values) =>
          editing ? save.mutate({ riskId: editing.id, values }) : create.mutate(values),
        )}
        submitLabel={editing ? t("risks.saveChanges") : t("risks.create")}
        pending={create.isPending || save.isPending}
        error={messageFor(editing ? save.error : create.error, t(editing ? "risks.updateFailed" : "risks.createFailed"))}
      >
        <Field label={t("risks.fieldProject")} error={form.formState.errors.projectId?.message} required>
          <Select disabled={editing !== null} {...form.register("projectId")}>
            <option value="">{t("risks.allProjects")}</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>{project.name}</option>
            ))}
          </Select>
        </Field>
        <Field label={t("risks.fieldTitle")} error={form.formState.errors.title?.message} required>
          <Input data-autofocus="true" {...form.register("title")} />
        </Field>

        <div className="rect-risks-form__split">
          <Field label={t("risks.fieldKind")} required>
            <Select {...form.register("kind")}>
              {KINDS.map((value) => (
                <option key={value} value={value}>{t(`enums.riskKind.${value}`)}</option>
              ))}
            </Select>
          </Field>
          <Field label={t("risks.fieldCategory")} required>
            <Select {...form.register("category")}>
              {CATEGORIES.map((value) => (
                <option key={value} value={value}>{t(`enums.riskCategory.${value}`)}</option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="rect-risks-form__split">
          <Field label={t("risks.fieldProbability")} required>
            <Select {...form.register("probability")}>
              {SCALE.map((value) => (
                <option key={value} value={String(value)}>{`${value} — ${t(`enums.riskScale.${value}`)}`}</option>
              ))}
            </Select>
          </Field>
          <Field label={t("risks.fieldImpact")} required>
            <Select {...form.register("impact")}>
              {SCALE.map((value) => (
                <option key={value} value={String(value)}>{`${value} — ${t(`enums.impactScale.${value}`)}`}</option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="rect-risks-form__split">
          <Field label={t("risks.fieldStatus")} required>
            <Select {...form.register("status")}>
              {STATUSES.map((value) => (
                <option key={value} value={value}>{t(`enums.riskStatus.${value}`)}</option>
              ))}
            </Select>
          </Field>
          <Field label={t("risks.fieldDue")} error={form.formState.errors.dueDate?.message}>
            <Input type="date" {...form.register("dueDate")} />
          </Field>
        </div>

        {/* Owner options come from the project's team, because the backend
            refuses anyone else and a form that looks valid but fails is worse
            than one that offers less. */}
        <Field label={t("risks.fieldOwner")} hint={t("risks.ownerHint")}>
          <Select disabled={!selectedProjectId || members.isLoading} {...form.register("ownerUserId")}>
            <option value="">{t("risks.unassigned")}</option>
            {(members.data?.members ?? []).map((member) => (
              <option key={member.userId} value={member.userId}>{member.displayName}</option>
            ))}
          </Select>
        </Field>

        <Field label={t("risks.fieldMitigation")} hint={t("risks.mitigationHint")}>
          <Textarea rows={2} {...form.register("mitigation")} />
        </Field>

        <Field label={t("risks.fieldMitigationTask")} hint={t("risks.mitigationTaskHint")}>
          <Select disabled={!selectedProjectId || projectTasks.isLoading} {...form.register("mitigationTaskId")}>
            <option value="">{t("risks.noMitigationTask")}</option>
            {(projectTasks.data?.tasks ?? []).map((task) => (
              <option key={task.id} value={task.id}>{task.title}</option>
            ))}
          </Select>
        </Field>

        <Field label={t("risks.fieldDescription")} error={form.formState.errors.description?.message}>
          <Textarea rows={3} {...form.register("description")} />
        </Field>
      </FormDialog>

      <ConfirmDialog
        open={pendingDelete !== null}
        title={t("risks.deleteTitle")}
        description={t("risks.deleteMessage", { title: pendingDelete?.title ?? "" })}
        confirmLabel={t("risks.delete")}
        cancelLabel={t("common.cancel")}
        tone="danger"
        pending={remove.isPending}
        onClose={() => setPendingDelete(null)}
        onConfirm={() => { if (pendingDelete) remove.mutate(pendingDelete.id); }}
      />
    </section>
  );
}
