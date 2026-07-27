/**
 * Today / Command Center.
 *
 * The page answers one question: what in this company's portfolio needs a
 * decision now. Everything it shows is a rollup the backend computed from
 * stored projects, users, and audit events, so a figure here can always be
 * traced to the records behind it — every attention row links to its project.
 */
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { Link } from "react-router";
import { useOptionalAuth, hasPermission } from "@/shared/auth";
import { getCurrentLanguage } from "@/shared/i18n";
import {
  Badge,
  BreakdownBar,
  Button,
  buttonClassName,
  Card,
  EmptyState,
  ErrorState,
  InsightBanner,
  LoadingState,
  SidePanel,
  StatCard,
  StatRow,
} from "@/shared/ui";
import { getOverview, type AttentionProject, type AttentionReason, type ProjectStatus } from "./overview-api";
import "./TodayPage.css";

const REASON_TONE: Record<AttentionReason, "danger" | "warning" | "info"> = {
  overdue: "danger",
  finishing_soon: "warning",
  starting_soon: "info",
};

const REASON_LABEL: Record<AttentionReason, string> = {
  overdue: "overview.reasonOverdue",
  finishing_soon: "overview.reasonFinishingSoon",
  starting_soon: "overview.reasonStartingSoon",
};

/** Status colours match the project register so the same word never changes meaning. */
function statusTone(status: ProjectStatus): "success" | "warning" | "info" | "neutral" {
  if (status === "active") return "success";
  if (status === "on_hold") return "warning";
  if (status === "completed") return "info";
  return "neutral";
}

/** Amounts arrive as exact decimal strings; formatting must not round them away. */
function formatMoney(amount: string, currency: string, language: string): string {
  const value = Number(amount);
  if (!Number.isFinite(value)) return `${amount} ${currency}`;
  try {
    return new Intl.NumberFormat(language, {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    // An unrecognised currency code must still render the real number.
    return `${new Intl.NumberFormat(language).format(value)} ${currency}`;
  }
}


export default function TodayPage() {
  const { t } = useTranslation();
  const language = getCurrentLanguage();
  const auth = useOptionalAuth();

  const canManageProjects =
    hasPermission(auth?.user, "projects.manage");

  const overview = useQuery({ queryKey: ["overview"], queryFn: getOverview });
  const summary = overview.data?.overview;

  const statusTotal = useMemo(
    () => summary?.statusCounts.reduce((sum, entry) => sum + entry.count, 0) ?? 0,
    [summary?.statusCounts],
  );
  const overdueCount = useMemo(
    () => summary?.attention.filter((entry) => entry.reason === "overdue").length ?? 0,
    [summary?.attention],
  );
  const activeCount = summary?.statusCounts.find((entry) => entry.status === "active")?.count ?? 0;

  if (overview.isError) {
    return (
      <ErrorState
        title={t("overview.errorTitle")}
        message={t("overview.errorMessage")}
        action={
          <Button variant="secondary" onClick={() => void overview.refetch()}>
            {t("overview.tryAgain")}
          </Button>
        }
      />
    );
  }

  if (overview.isLoading || !summary) {
    return <LoadingState title={t("overview.loadingTitle")} message={t("overview.loadingMessage")} />;
  }

  if (summary.totalProjects === 0 && summary.tasks.open === 0 && summary.risks.open === 0) {
    return (
      <EmptyState
        title={t("overview.emptyTitle")}
        message={canManageProjects ? t("overview.emptyManage") : t("overview.emptyRead")}
        {...(canManageProjects
          ? {
              action: (
                <Link className={buttonClassName("primary")} to="/projects">
                  {t("overview.createProject")}
                </Link>
              ),
            }
          : {})}
      />
    );
  }

  return (
    <section className="rect-today" aria-label={t("overview.pageLabel")}>
      {/* The daily brief the plan calls for. Until a model is connected it
          says so; it never fills the space with a guess. */}
      <InsightBanner surface="today" state={{ status: "unavailable" }} />

      <StatRow label={t("overview.summaryLabel")}>
        <StatCard label={t("overview.kpiProjects")} value={summary.totalProjects} />
        <StatCard label={t("overview.kpiActive")} value={activeCount} />
        <StatCard
          label={t("overview.kpiAttention")}
          value={summary.attention.length}
          emphasis={summary.attention.length > 0}
          {...(overdueCount > 0 ? { hint: t("overview.kpiAttentionHint", { count: overdueCount }) } : {})}
        />
        {/* Outstanding work belongs in the headline row, not only in the side
            panel: "what is due" is the question the page is opened to answer. */}
        <StatCard
          label={t("overview.kpiDueSoon", { count: summary.horizonDays })}
          value={summary.tasks.dueSoon}
          emphasis={summary.tasks.overdue > 0}
          {...(summary.tasks.overdue > 0
            ? { hint: t("overview.kpiDueSoonHint", { count: summary.tasks.overdue }) }
            : {})}
        />
        <StatCard
          label={t("overview.kpiRisks")}
          value={summary.risks.open}
          emphasis={summary.risks.criticalOrHigh > 0}
          {...(summary.risks.criticalOrHigh > 0
            ? { hint: t("overview.kpiRisksHint", { count: summary.risks.criticalOrHigh }) }
            : {})}
        />
        {summary.team ? (
          <StatCard
            label={t("overview.kpiTeam")}
            value={summary.team.activeUsers}
            {...(summary.team.disabledUsers > 0
              ? { hint: t("overview.kpiTeamHint", { count: summary.team.disabledUsers }) }
              : {})}
          />
        ) : null}
      </StatRow>

      <div className="rect-today__columns">
        <Card className="rect-today__main">
          <header className="rect-today__head">
            <h2 className="rect-today__title">{t("overview.attentionTitle")}</h2>
            <p className="rect-today__subtitle">
              {t("overview.attentionHorizon", { count: summary.horizonDays })}
            </p>
          </header>

          {summary.attention.length === 0 ? (
            <EmptyState
              title={t("overview.attentionEmptyTitle")}
              message={t("overview.attentionEmptyMessage", { count: summary.horizonDays })}
            />
          ) : (
            <ul className="rect-today__list">
              {summary.attention.map((entry) => (
                <li key={entry.id} className="rect-today__item">
                  <Link
                    className="rect-today__link"
                    to={`/projects/${entry.id}`}
                    aria-label={`${entry.name} — ${t(REASON_LABEL[entry.reason])}`}
                  >
                    <span className="rect-today__item-head">
                      <Badge tone={REASON_TONE[entry.reason]}>{t(REASON_LABEL[entry.reason])}</Badge>
                      <span className="rect-today__code">{entry.code}</span>
                    </span>
                    <span className="rect-today__name">{entry.name}</span>
                    <span className="rect-today__meta">
                      <span>{t(`enums.projectStatus.${entry.status}`)}</span>
                      <span>{describeTiming(entry, t)}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}

          <div className="rect-today__foot">
            <Link className={buttonClassName("secondary")} to="/projects">
              {t("overview.viewAllProjects")}
            </Link>
          </div>
        </Card>

        <div className="rect-today__aside">
          <SidePanel title={t("overview.workTitle")}>
            {summary.tasks.open === 0 ? (
              <p className="rect-today__note">{t("overview.workEmpty")}</p>
            ) : (
              <>
                <ul className="rect-today__figures">
                  <li>
                    <span className="rect-today__figure-label">{t("overview.workOpen")}</span>
                    <span className="rect-today__figure-value">{summary.tasks.open}</span>
                  </li>
                  <li>
                    <span className="rect-today__figure-label">{t("overview.workOverdue")}</span>
                    <span
                      className={
                        summary.tasks.overdue > 0
                          ? "rect-today__figure-value rect-today__figure-value--alert"
                          : "rect-today__figure-value"
                      }
                    >
                      {summary.tasks.overdue}
                    </span>
                  </li>
                  <li>
                    <span className="rect-today__figure-label">
                      {t("overview.workDueSoon", { count: summary.horizonDays })}
                    </span>
                    <span className="rect-today__figure-value">{summary.tasks.dueSoon}</span>
                  </li>
                  <li>
                    <span className="rect-today__figure-label">{t("overview.workMine")}</span>
                    <span className="rect-today__figure-value">{summary.tasks.assignedToMe}</span>
                  </li>
                </ul>
                <Link className={buttonClassName("secondary")} to="/tasks">
                  {t("overview.viewAllTasks")}
                </Link>
              </>
            )}
          </SidePanel>

          <SidePanel title={t("overview.statusTitle")}>
            {summary.statusCounts.length === 0 ? (
              <p className="rect-today__note">{t("overview.statusEmpty")}</p>
            ) : (
              summary.statusCounts.map((entry) => (
                <BreakdownBar
                  key={entry.status}
                  label={t(`enums.projectStatus.${entry.status}`)}
                  value={entry.count}
                  total={statusTotal}
                  tone={statusTone(entry.status)}
                />
              ))
            )}
          </SidePanel>

          <SidePanel title={t("overview.budgetTitle")}>
            {summary.budgets.length === 0 ? (
              <p className="rect-today__note">{t("overview.budgetEmpty")}</p>
            ) : (
              <ul className="rect-today__budgets">
                {summary.budgets.map((entry) => (
                  <li key={entry.currency} className="rect-today__budget">
                    <span className="rect-today__budget-amount">
                      {formatMoney(entry.amount, entry.currency, language)}
                    </span>
                    <span className="rect-today__budget-meta">
                      {t("overview.budgetProjects", { count: entry.projectCount })}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </SidePanel>

        </div>
      </div>
    </section>
  );
}

/**
 * Turns the signed day offset into words. The backend counts from the database
 * date, so zero genuinely means today rather than "some time in the next day".
 */
function describeTiming(entry: AttentionProject, t: TFunction): string {
  if (entry.daysFromToday === 0) return t("overview.dueToday");
  if (entry.daysFromToday < 0) return t("overview.overdueBy", { count: Math.abs(entry.daysFromToday) });
  return t("overview.dueIn", { count: entry.daysFromToday });
}
