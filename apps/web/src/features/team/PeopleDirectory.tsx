/**
 * The people register.
 *
 * Two views of one question, because a company directory and the people you
 * actually work with are not the same thing and were previously conflated into
 * a flat list of names with no context at all. Which views exist is decided by
 * the server and asked for before anything is rendered: a tab that answered
 * with a refusal would be exactly the kind of dead control the product does not
 * ship.
 *
 * Nothing here filters for permission. Every row already contains only what the
 * viewer may know — which projects, whose work, how much of it — because that
 * decision belongs to the server and having it in two places is how the two
 * eventually disagree.
 */
import { useQuery } from "@tanstack/react-query";
import { Mail } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { searchRecords } from "@/shared/search/match";
import {
  Avatar,
  Badge,
  Button,
  EmptyState,
  ErrorState,
  LoadingState,
  ViewToggle,
  buttonClassName,
} from "@/shared/ui";
import { directoryApi, type DirectoryPerson, type DirectoryRegister } from "./directory-api";
import "./PeopleDirectory.css";

function PersonCard({ person }: { person: DirectoryPerson }) {
  const { t } = useTranslation();

  return (
    <li className="rect-person">
      <div className="rect-person__head">
        <Avatar name={person.displayName} colorKey={person.id} />
        <div className="rect-person__identity">
          <p className="rect-person__name">{person.displayName}</p>
          <p className="rect-person__email">{person.email}</p>
        </div>
        {/*
          * A real mailto rather than a copy button that reports success into a
          * clipboard nobody checks. It is the one contact action the product
          * can actually complete today.
          */}
        <a
          className={buttonClassName("secondary")}
          href={`mailto:${person.email}`}
          aria-label={`${t("team.directoryEmail")} ${person.displayName}`}
        >
          <Mail size={16} strokeWidth={2} aria-hidden />
        </a>
      </div>

      <div className="rect-person__facts">
        {person.sharedProjectCount > 0 ? (
          <Badge tone="accent">
            {t("team.directorySharedCount", { count: person.sharedProjectCount })}
          </Badge>
        ) : null}
        {person.openTaskCount > 0 ? (
          <Badge tone="neutral">
            {t("team.directoryOpenTasks", { count: person.openTaskCount })}
          </Badge>
        ) : null}
      </div>

      <div className="rect-person__projects">
        <p className="rect-person__projects-label">{t("team.directoryProjects")}</p>
        {person.projects.length === 0 ? (
          /*
           * Says "none you can see", not "none". The person may well be on
           * several; the viewer is not entitled to know that, and claiming
           * they are on none would be a lie rather than a redaction.
           */
          <p className="rect-person__projects-empty">{t("team.directoryNoVisibleProjects")}</p>
        ) : (
          <ul className="rect-person__project-list">
            {person.projects.map((project) => (
              <li key={project.id} className="rect-person__project">
                <span className="rect-person__project-name">{project.name}</span>
                <span className="rect-person__project-role">
                  {t(`enums.memberRole.${project.role}`)}
                </span>
                {project.sharedWithViewer ? (
                  <Badge tone="accent">{t("team.directoryWithYou")}</Badge>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </li>
  );
}

export function PeopleDirectory() {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [register, setRegister] = useState<DirectoryRegister | null>(null);

  const registers = useQuery({
    queryKey: ["directory", "registers"],
    queryFn: directoryApi.registers,
  });

  /*
   * The chosen register, or the first one the server offered. Held as null
   * until then rather than defaulting to "company": defaulting would ask for a
   * register most people may not open, and the refusal would arrive before the
   * answer about which they can.
   */
  const available = registers.data?.registers ?? [];
  const active = register && available.includes(register) ? register : available[0];

  const people = useQuery({
    queryKey: ["directory", active],
    queryFn: () => (active === "company" ? directoryApi.company() : directoryApi.colleagues()),
    enabled: Boolean(active),
  });

  const rows = useMemo(
    () =>
      searchRecords(people.data?.people ?? [], search, (person) => [
        person.displayName,
        person.email,
        ...person.projects.flatMap((project) => [project.name, project.code]),
      ]),
    [people.data?.people, search],
  );

  if (registers.isError || people.isError) {
    return (
      <ErrorState
        title={t("team.directoryErrorTitle")}
        message={t("team.directoryErrorMessage")}
        action={
          <Button
            variant="secondary"
            onClick={() => {
              void registers.refetch();
              void people.refetch();
            }}
          >
            {t("team.directoryTryAgain")}
          </Button>
        }
      />
    );
  }

  if (registers.isLoading || !active || people.isLoading) {
    return (
      <LoadingState
        title={t("team.directoryLoadingTitle")}
        message={t("team.directoryLoadingMessage")}
      />
    );
  }

  const isFiltered = search.trim().length > 0;

  return (
    <section className="rect-directory" aria-label={t("team.directoryProjects")}>
      <div className="rect-directory__toolbar">
        <label className="rect-directory__search">
          <span className="rect-visually-hidden">{t("team.directorySearchLabel")}</span>
          <input
            type="search"
            value={search}
            aria-label={t("team.directorySearchLabel")}
            placeholder={t("team.directorySearchPlaceholder")}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>

        {/*
          * Offered only when there is a genuine choice. One register is not a
          * decision, and a toggle with a single option is furniture.
          */}
        {available.length > 1 ? (
          <ViewToggle
            value={active}
            label={t("team.registerCompany")}
            onChange={(next) => setRegister(next)}
            showLabels
            options={[
              { value: "company" as const, label: t("team.registerCompany") },
              { value: "colleagues" as const, label: t("team.registerColleagues") },
            ]}
          />
        ) : null}
      </div>

      <p className="rect-directory__hint">
        {active === "company" ? t("team.registerCompanyHint") : t("team.registerColleaguesHint")}
      </p>

      {rows.length === 0 && isFiltered ? (
        <EmptyState
          title={t("team.directoryNoMatchTitle")}
          message={t("team.directoryNoMatchMessage")}
          action={
            <Button variant="secondary" onClick={() => setSearch("")}>
              {t("projects.clearFilters")}
            </Button>
          }
        />
      ) : rows.length === 0 ? (
        <EmptyState
          title={
            active === "company"
              ? t("team.directoryEmptyCompanyTitle")
              : t("team.directoryEmptyColleaguesTitle")
          }
          message={
            active === "company"
              ? t("team.directoryEmptyCompanyMessage")
              : t("team.directoryEmptyColleaguesMessage")
          }
        />
      ) : (
        <ul className="rect-directory__list">
          {rows.map((person) => (
            <PersonCard key={person.id} person={person} />
          ))}
        </ul>
      )}
    </section>
  );
}
