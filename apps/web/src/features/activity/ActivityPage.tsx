/**
 * Activity: the record of what happened, scoped to what the viewer may see.
 *
 * The server decides the scope and returns which scopes this person may ask
 * for, so the page offers only choices that exist rather than rendering a
 * control that produces a refusal. Entries are grouped by day because "when"
 * is how people actually read a trail — a flat list of timestamps forces the
 * reader to do the grouping themselves.
 */
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { CircleUser, Users, Building2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { Link, useSearchParams } from "react-router";
import { useOptionalAuth } from "@/shared/auth";
import {
  Avatar, Badge, Button, EmptyState, ErrorState, LoadingState, PageToolbar,
  SidePanel, StatCard, StatRow, ViewToggle,
} from "@/shared/ui";
import {
  listActivity, listActivityActions,
  type ActivityEntry, type ActivityPreset, type ActivityScope, type ActivityTally,
} from "./activity-api";
import "./ActivityPage.css";

/** Failures are the entries a reader is scanning for, so they carry a tone. */
function resultTone(entry: ActivityEntry): "danger" | "neutral" {
  return entry.result === "failure" ? "danger" : "neutral";
}

/**
 * "Today" and "Yesterday" rather than a date, where they apply.
 *
 * A reader scanning a trail is looking for how recent something is, and a
 * relative word answers that before the eye has parsed a date. The absolute
 * date stays beside it, because "Yesterday" alone is useless in a screenshot.
 */
function relativeDayLabel(day: string, t: TFunction): string | null {
  const today = new Date();
  const asDay = (date: Date): string => date.toISOString().slice(0, 10);

  if (day === asDay(today)) return t("activity.today");

  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (day === asDay(yesterday)) return t("activity.yesterday");

  return null;
}

/**
 * One side-panel breakdown.
 *
 * Every row is a control, not a statistic: clicking it narrows the list beside
 * it. A panel of numbers you cannot act on is decoration, and decoration in a
 * dense tool is something people learn to ignore.
 */
function TallyList({
  rows,
  activeKey,
  onPick,
  emptyLabel,
  format,
}: {
  rows: ActivityTally[];
  activeKey: string;
  onPick: (key: string) => void;
  emptyLabel: string;
  format?: (row: ActivityTally) => string;
}) {
  if (rows.length === 0) return <p className="rect-panel-note">{emptyLabel}</p>;

  return (
    <ul className="rect-tally">
      {rows.map((row) => (
        <li key={row.key}>
          <button
            type="button"
            className="rect-tally__row"
            aria-pressed={activeKey === row.key}
            onClick={() => onPick(activeKey === row.key ? "" : row.key)}
          >
            <span className="rect-tally__label">{format ? format(row) : row.label}</span>
            <span className="rect-tally__count">{row.count}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/** Groups entries under the day they happened, preserving server order. */
function groupByDay(entries: ActivityEntry[]): Array<{ day: string; entries: ActivityEntry[] }> {
  const groups: Array<{ day: string; entries: ActivityEntry[] }> = [];

  for (const entry of entries) {
    const day = entry.createdAt.slice(0, 10);
    const last = groups[groups.length - 1];
    if (last && last.day === day) last.entries.push(entry);
    else groups.push({ day, entries: [entry] });
  }

  return groups;
}

const SCOPE_ICONS: Record<ActivityScope, React.ReactNode> = {
  self: <CircleUser size={16} strokeWidth={2} aria-hidden />,
  team: <Users size={16} strokeWidth={2} aria-hidden />,
  all: <Building2 size={16} strokeWidth={2} aria-hidden />,
};

export default function ActivityPage() {
  const { t, i18n } = useTranslation();
  const auth = useOptionalAuth();

  /*
   * Arriving from a project workspace preview. Read once as the initial value
   * rather than tracked, so clearing the filter on this page is not immediately
   * undone by the URL it was opened with.
   */
  const [searchParams] = useSearchParams();
  const [projectId, setProjectId] = useState(() => searchParams.get("projectId") ?? "");

  const [search, setSearch] = useState("");
  const [actorUserId, setActorUserId] = useState("");
  const [preset, setPreset] = useState<ActivityPreset>("month");
  const [scope, setScope] = useState<ActivityScope>("self");
  const [action, setAction] = useState("");
  const [result, setResult] = useState("");

  const actions = useQuery({ queryKey: ["activity", "actions"], queryFn: listActivityActions });

  const feed = useInfiniteQuery({
    queryKey: ["activity", scope, preset, search, actorUserId, action, result, projectId],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      listActivity({
        scope,
        preset,
        ...(action ? { action } : {}),
        ...(result ? { result: result as "success" | "failure" } : {}),
        ...(search ? { search } : {}),
        ...(actorUserId ? { actorUserId } : {}),
        ...(projectId ? { projectId } : {}),
        ...(pageParam ? { cursor: pageParam } : {}),
      }),
    getNextPageParam: (last) => last.nextCursor,
  });

  const pages = feed.data?.pages ?? [];
  const entries = useMemo(() => pages.flatMap((page) => page.entries), [pages]);
  const grouped = useMemo(() => groupByDay(entries), [entries]);

  // Offered by the server, so a person is never shown a scope that refuses them.
  const availableScopes = pages[0]?.availableScopes ?? ["self"];
  // Describes the whole range, computed server-side; deriving it from the
  // fetched pages would report the pages instead.
  const summary = pages[0]?.summary;
  const filtered = action !== "" || result !== "" || projectId !== "" || actorUserId !== "" || search !== "";

  const dayFormatter = useMemo(
    () => new Intl.DateTimeFormat(i18n.language, { weekday: "long", day: "numeric", month: "long", year: "numeric" }),
    [i18n.language],
  );
  const timeFormatter = useMemo(
    () => new Intl.DateTimeFormat(i18n.language, { hour: "2-digit", minute: "2-digit" }),
    [i18n.language],
  );

  if (!auth?.user) {
    return <LoadingState title={t("activity.loadingTitle")} message={t("activity.loadingMessage")} />;
  }

  /*
   * Only the very first load replaces the page. Changing a filter changes the
   * query key, so `isLoading` becomes true again on every keystroke — and
   * swapping the whole page for a spinner unmounts the search field the person
   * is typing into, which loses focus and every character after the first.
   * Later loads keep the page and let the list update underneath.
   */
  if (feed.isLoading && pages.length === 0 && !filtered) {
    return <LoadingState title={t("activity.loadingTitle")} message={t("activity.loadingMessage")} />;
  }

  if (feed.isError) {
    return (
      <ErrorState
        title={t("activity.errorTitle")}
        message={t("activity.errorMessage")}
        action={
          <Button variant="secondary" onClick={() => void feed.refetch()}>
            {t("activity.tryAgain")}
          </Button>
        }
      />
    );
  }


  return (
    <section className="rect-activity-page" aria-label={t("activity.pageLabel")}>
      <PageToolbar<ActivityScope>
        refresh={{
          onRefresh: () => {
            void feed.refetch();
          },
          pending: feed.isFetching,
        }}
        /*
         * Dates stay on the row rather than going into the filter window,
         * because narrowing by time is the first thing anybody does with a
         * trail and burying it costs two clicks on every visit. They sit with
         * the view controls at the end of the row, where every page keeps the
         * controls that decide how you are looking at it.
         */
        scope={
          <ViewToggle<ActivityPreset>
            label={t("activity.rangeLabel")}
            value={preset}
            onChange={setPreset}
            showLabels
            options={[
              { value: "today", label: t("activity.rangeToday") },
              { value: "week", label: t("activity.rangeWeek") },
              { value: "month", label: t("activity.rangeMonth") },
            ]}
          />
        }
        search={{
          value: search,
          onChange: setSearch,
          label: t("activity.searchLabel"),
          placeholder: t("activity.searchPlaceholder"),
        }}
        filters={[
          {
            id: "action",
            type: "select" as const,
            label: t("activity.filterAction"),
            anyLabel: t("activity.allActions"),
            value: action,
            options: (actions.data?.actions ?? []).map((key) => ({
              value: key,
              label: t(`enums.activity.${key}`, { defaultValue: key }),
            })),
            onChange: setAction,
          },
          {
            id: "result",
            type: "select" as const,
            label: t("activity.filterResult"),
            anyLabel: t("activity.allResults"),
            value: result,
            options: [
              { value: "success", label: t("activity.resultSuccess") },
              { value: "failure", label: t("activity.resultFailure") },
            ],
            onChange: setResult,
          },
        ]}
        onClearFilters={() => { setAction(""); setResult(""); setProjectId(""); setActorUserId(""); setSearch(""); }}
        /*
         * Scope answers "whose activity", which is a different question from
         * the filters' "which entries", so it sits with the view controls at
         * the end of the row rather than among them.
         */
        {...(availableScopes.length > 1
          ? {
              register: (
                <ViewToggle<ActivityScope>
                  label={t("activity.scopeLabel")}
                  value={scope}
                  onChange={setScope}
                  showLabels
                  options={availableScopes.map((value) => ({
                    value,
                    label: t(`activity.scope_${value}`),
                    icon: SCOPE_ICONS[value],
                  }))}
                />
              ),
            }
          : {})}
      />

      {summary && summary.total > 0 ? (
        <StatRow label={t("activity.summaryLabel")}>
          <StatCard label={t("activity.statTotal")} value={summary.total} />
          <StatCard
            label={t("activity.statFailures")}
            value={summary.failures}
            emphasis={summary.failures > 0}
          />
          <StatCard label={t("activity.statPeople")} value={summary.people} />
          {summary.busiestDay ? (
            <StatCard
              label={t("activity.statBusiest")}
              value={dayFormatter.format(new Date(summary.busiestDay))}
              hint={t("activity.statBusiestHint", { count: summary.busiestDayCount ?? 0 })}
            />
          ) : null}
        </StatRow>
      ) : null}

      {entries.length === 0 ? (
        <EmptyState
          title={filtered ? t("activity.noMatchTitle") : t("activity.emptyTitle")}
          message={filtered ? t("activity.noMatchMessage") : t("activity.emptyMessage")}
          {...(filtered
            ? {
                action: (
                  <Button variant="secondary" onClick={() => { setAction(""); setResult(""); setProjectId(""); setActorUserId(""); setSearch(""); }}>
                    {t("activity.clearFilters")}
                  </Button>
                ),
              }
            : {})}
        />
      ) : (
        <div className="rect-activity-layout">
          <div className="rect-activity-timeline">
          {grouped.map((group) => (
            <section key={group.day} className="rect-activity-day" aria-label={dayFormatter.format(new Date(group.day))}>
              <h2 className="rect-activity-day__heading">
                <span className="rect-activity-day__badge">
                  <span className="rect-activity-day__dot" aria-hidden />
                  {/* Relative first: it answers "how recent" before the eye
                      parses a date. The date stays, because a relative word
                      alone is useless out of context. */}
                  {relativeDayLabel(group.day, t) ? (
                    <span className="rect-activity-day__relative">{relativeDayLabel(group.day, t)}</span>
                  ) : null}
                  <span className="rect-activity-day__date">{dayFormatter.format(new Date(group.day))}</span>
                </span>
                <span className="rect-activity-day__count">
                  {t("activity.dayCount", { count: group.entries.length })}
                </span>
              </h2>

              <ul className="rect-activity-list">
                {group.entries.map((entry) => (
                  <li key={entry.id} className="rect-activity-item">
                    <Avatar
                      name={entry.actorName ?? t("activity.unknownActor")}
                      colorKey={entry.actorUserId ?? entry.id}
                      size="sm"
                    />

                    <span className="rect-activity-item__body">
                      <span className="rect-activity-item__headline">
                        <span className="rect-activity-item__actor">
                          {entry.actorName ?? t("activity.unknownActor")}
                        </span>
                        <span className="rect-activity-item__action">
                          {t(`enums.activity.${entry.action}`, { defaultValue: entry.action })}
                        </span>
                        {entry.result === "failure" ? (
                          <Badge tone={resultTone(entry)}>{t("activity.resultFailure")}</Badge>
                        ) : null}
                      </span>

                      <span className="rect-activity-item__meta">
                        <time dateTime={entry.createdAt}>{timeFormatter.format(new Date(entry.createdAt))}</time>
                        {entry.projectId && entry.projectName ? (
                          <Link className="rect-activity-item__project" to={`/projects/${entry.projectId}`}>
                            {entry.projectName}
                          </Link>
                        ) : null}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}

          {feed.hasNextPage ? (
            <div className="rect-activity-more">
              <Button
                variant="secondary"
                onClick={() => void feed.fetchNextPage()}
                disabled={feed.isFetchingNextPage}
              >
                {feed.isFetchingNextPage ? t("activity.loadingMore") : t("activity.loadMore")}
              </Button>
            </div>
          ) : null}
          </div>

          {/*
            Beside the trail rather than above it, and every row filters the
            list. All four are computed over the caller's own predicate, so a
            member sees a ranking of what they can already reach — never a
            leaderboard of the company.
          */}
          <div className="rect-activity-aside">
            <SidePanel title={t("activity.panelPeople")}>
              <TallyList
                rows={summary?.topActors ?? []}
                activeKey={actorUserId}
                onPick={setActorUserId}
                emptyLabel={t("activity.panelPeopleEmpty")}
              />
            </SidePanel>

            <SidePanel title={t("activity.panelActions")}>
              <TallyList
                rows={summary?.topActions ?? []}
                activeKey={action}
                onPick={setAction}
                emptyLabel={t("activity.panelActionsEmpty")}
                format={(row) => t(`enums.activity.${row.key}`, { defaultValue: row.label })}
              />
            </SidePanel>

            <SidePanel title={t("activity.panelProjects")}>
              <TallyList
                rows={summary?.topProjects ?? []}
                activeKey={projectId}
                onPick={setProjectId}
                emptyLabel={t("activity.panelProjectsEmpty")}
              />
            </SidePanel>

            <SidePanel title={t("activity.panelAttention")}>
              <TallyList
                rows={summary?.attention ?? []}
                activeKey={action}
                onPick={setAction}
                emptyLabel={t("activity.panelAttentionEmpty")}
                format={(row) => t(`enums.activity.${row.key}`, { defaultValue: row.label })}
              />
            </SidePanel>
          </div>
        </div>
      )}
    </section>
  );
}
