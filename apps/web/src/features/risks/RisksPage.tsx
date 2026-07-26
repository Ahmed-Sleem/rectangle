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
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { Link, useSearchParams } from "react-router-dom";
import { z } from "zod";
import { ApiClientError } from "@/shared/api/client";
import { useOptionalAuth } from "@/shared/auth";
import { getCurrentLanguage } from "@/shared/i18n";
import {
  Badge, Button, buttonClassName, Checkbox, ConfirmDialog, DataTable, EmptyState, ErrorState,
  Field, FilterBar, FilterBarSpacer, FilterSelect, FormDialog, Input, LoadingState,
  Select, StatCard, StatRow, Textarea,
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
    projectFilter || kindFilter || statusFilter || categoryFilter || mineOnly || openOnly || cell,
  );

  // Indexed for constant-time lookup while drawing twenty-five cells.
  const matrixCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const entry of summary?.matrix ?? []) {
      counts.set(`${entry.probability}:${entry.impact}`, entry.count);
    }
    return counts;
  }, [summary?.matrix]);

  const dateFormatter = new Intl.DateTimeFormat(language, { dateStyle: "medium" });

  function clearFilters() {
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
      <FilterBar>
        <FilterSelect
          label={t("risks.filterProject")}
          width="md"
          value={projectFilter}
          onChange={(event) => {
            const next = event.target.value;
            setProjectFilter(next);
            setSearchParams(next ? { projectId: next } : {}, { replace: true });
          }}
        >
          <option value="">{t("risks.allProjects")}</option>
          {projects.map((project) => (
            <option key={project.id} value={project.id}>{project.name}</option>
          ))}
        </FilterSelect>
        <FilterSelect
          label={t("risks.filterKind")}
          width="sm"
          value={kindFilter}
          onChange={(event) => setKindFilter(event.target.value as RiskKind | "")}
        >
          <option value="">{t("risks.allKinds")}</option>
          {KINDS.map((value) => (
            <option key={value} value={value}>{t(`enums.riskKind.${value}`)}</option>
          ))}
        </FilterSelect>
        <FilterSelect
          label={t("risks.filterStatus")}
          width="sm"
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value as RiskStatus | "")}
        >
          <option value="">{t("risks.allStatuses")}</option>
          {STATUSES.map((value) => (
            <option key={value} value={value}>{t(`enums.riskStatus.${value}`)}</option>
          ))}
        </FilterSelect>
        <FilterSelect
          label={t("risks.filterCategory")}
          width="md"
          value={categoryFilter}
          onChange={(event) => setCategoryFilter(event.target.value as RiskCategory | "")}
        >
          <option value="">{t("risks.allCategories")}</option>
          {CATEGORIES.map((value) => (
            <option key={value} value={value}>{t(`enums.riskCategory.${value}`)}</option>
          ))}
        </FilterSelect>

        <Checkbox label={t("risks.onlyMine")} checked={mineOnly} onChange={(event) => setMineOnly(event.target.checked)} />
        <Checkbox label={t("risks.openOnly")} checked={openOnly} onChange={(event) => setOpenOnly(event.target.checked)} />

        <FilterBarSpacer />

        {canManage ? (
          <Button
            variant="primary"
            onClick={() => { form.reset(); setCreateOpen(true); }}
            disabled={projects.length === 0}
            {...(projects.length === 0 ? { title: t("risks.noProjectsMessage") } : {})}
          >
            {t("risks.create")}
          </Button>
        ) : null}
      </FilterBar>

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
          {summary && summary.matrix.length > 0 ? (
            <section className="rect-matrix" aria-label={t("risks.matrixTitle")}>
              <header className="rect-matrix__head">
                <h2 className="rect-matrix__title">{t("risks.matrixTitle")}</h2>
                <p className="rect-matrix__hint">{t("risks.matrixHint")}</p>
              </header>

              <div className="rect-matrix__layout">
                <span className="rect-matrix__axis rect-matrix__axis--y">{t("risks.matrixProbability")}</span>
                <div className="rect-matrix__grid" role="group" aria-label={t("risks.matrixTitle")}>
                  {/* Highest probability at the top, which is how a risk
                      matrix is always drawn. */}
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
                          onClick={() =>
                            setCell(selected ? null : { probability, impact })
                          }
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
            </section>
          ) : null}

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
