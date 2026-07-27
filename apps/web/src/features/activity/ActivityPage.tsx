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
import { Link, useSearchParams } from "react-router";
import { useOptionalAuth } from "@/shared/auth";
import {
  Avatar, Badge, Button, EmptyState, ErrorState, LoadingState, PageToolbar, ViewToggle,
} from "@/shared/ui";
import {
  listActivity, listActivityActions,
  type ActivityEntry, type ActivityScope,
} from "./activity-api";
import "./ActivityPage.css";

/** Failures are the entries a reader is scanning for, so they carry a tone. */
function resultTone(entry: ActivityEntry): "danger" | "neutral" {
  return entry.result === "failure" ? "danger" : "neutral";
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

  const [scope, setScope] = useState<ActivityScope>("self");
  const [action, setAction] = useState("");
  const [result, setResult] = useState("");

  const actions = useQuery({ queryKey: ["activity", "actions"], queryFn: listActivityActions });

  const feed = useInfiniteQuery({
    queryKey: ["activity", scope, action, result, projectId],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      listActivity({
        scope,
        ...(action ? { action } : {}),
        ...(result ? { result: result as "success" | "failure" } : {}),
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

  if (feed.isLoading) {
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

  const filtered = action !== "" || result !== "" || projectId !== "";

  return (
    <section className="rect-activity-page" aria-label={t("activity.pageLabel")}>
      <PageToolbar<ActivityScope>
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
        onClearFilters={() => { setAction(""); setResult(""); setProjectId(""); }}
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

      {entries.length === 0 ? (
        <EmptyState
          title={filtered ? t("activity.noMatchTitle") : t("activity.emptyTitle")}
          message={filtered ? t("activity.noMatchMessage") : t("activity.emptyMessage")}
          {...(filtered
            ? {
                action: (
                  <Button variant="secondary" onClick={() => { setAction(""); setResult(""); setProjectId(""); }}>
                    {t("activity.clearFilters")}
                  </Button>
                ),
              }
            : {})}
        />
      ) : (
        <>
          {grouped.map((group) => (
            <section key={group.day} className="rect-activity-day" aria-label={dayFormatter.format(new Date(group.day))}>
              <h2 className="rect-activity-day__heading">{dayFormatter.format(new Date(group.day))}</h2>

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
        </>
      )}
    </section>
  );
}
