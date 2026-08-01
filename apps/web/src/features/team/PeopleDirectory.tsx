/**
 * The people register. One list, not two.
 *
 * There were briefly two: an administrative list of accounts and a separate
 * "Directory" showing the same people with their projects. For anybody holding
 * `users.read` they contained identical rows under two headings, and the owner
 * said plainly that he could not tell what the difference was. There was none
 * worth a tab.
 *
 * So this is the register, and who you see depends on what you may see rather
 * than on which tab you pick:
 *
 *   - holding `users.read` — everyone in the company;
 *   - otherwise — the people you share a project with, which membership
 *     already discloses and which every signed-in person may read.
 *
 * The server decides that; the page just asks which register it was given. The
 * administrative actions appear on a row only for somebody who may perform
 * them, and are absent rather than disabled for everybody else.
 *
 * Search, filtering and the card/table switch belong to the page's toolbar,
 * shared with Projects, Tasks and Risks — this component is handed the rows to
 * draw and does not invent its own controls.
 */
import { Mail } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Avatar, Badge, Button, DataTable, buttonClassName } from "@/shared/ui";
import type { DirectoryPerson } from "./directory-api";
import "./PeopleDirectory.css";

export interface PeopleDirectoryProps {
  people: DirectoryPerson[];
  view: "cards" | "table";
  /** Administrative actions, each shown only when the viewer holds it. */
  canEdit: boolean;
  canDisable: boolean;
  onEdit: (person: DirectoryPerson) => void;
  onDisable: (person: DirectoryPerson) => void;
  onEnable: (person: DirectoryPerson) => void;
  /** Names a user type for display, honouring the seeded ones' translations. */
  roleName: (type: { id: string; name: string; key: string }) => string;
}

function ContactLink({ person, label }: { person: DirectoryPerson; label: string }) {
  return (
    <a
      className={buttonClassName("secondary", "sm")}
      href={`mailto:${person.email}`}
      aria-label={`${label} ${person.displayName}`}
    >
      <Mail size={16} strokeWidth={2} aria-hidden />
    </a>
  );
}

function PersonActions({
  person,
  canEdit,
  canDisable,
  onEdit,
  onDisable,
  onEnable,
}: Pick<PeopleDirectoryProps, "canEdit" | "canDisable" | "onEdit" | "onDisable" | "onEnable"> & {
  person: DirectoryPerson;
}) {
  const { t } = useTranslation();
  if (!canEdit && !canDisable) return null;

  return (
    <span className="rect-person__actions">
      <ContactLink person={person} label={t("team.directoryEmail")} />
      {canEdit ? (
        <Button size="sm" variant="secondary" onClick={() => onEdit(person)}>
          {t("team.edit")}
        </Button>
      ) : null}
      {canDisable ? (
        person.status === "active" ? (
          <Button size="sm" variant="secondary" onClick={() => onDisable(person)}>
            {t("team.disable")}
          </Button>
        ) : (
          <Button size="sm" variant="secondary" onClick={() => onEnable(person)}>
            {t("team.enableAction")}
          </Button>
        )
      ) : null}
    </span>
  );
}

function ProjectList({ person }: { person: DirectoryPerson }) {
  const { t } = useTranslation();

  if (person.projects.length === 0) {
    /*
     * "None you can see", not "none". The person may well be on several; the
     * viewer is not entitled to know which, and saying they are on none would
     * be a false statement about them rather than a redaction for the reader.
     */
    return <p className="rect-person__projects-empty">{t("team.directoryNoVisibleProjects")}</p>;
  }

  return (
    <ul className="rect-person__project-list">
      {person.projects.map((project) => (
        <li key={project.id} className="rect-person__project">
          <span className="rect-person__project-name">{project.name}</span>
          <span className="rect-person__project-role">{t(`enums.memberRole.${project.role}`)}</span>
          {project.sharedWithViewer ? (
            <Badge tone="accent">{t("team.directoryWithYou")}</Badge>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

export function PeopleDirectory({
  people,
  view,
  canEdit,
  canDisable,
  onEdit,
  onDisable,
  onEnable,
  roleName,
}: PeopleDirectoryProps) {
  const { t } = useTranslation();
  const actions = { canEdit, canDisable, onEdit, onDisable, onEnable };

  if (view === "table") {
    return (
      <DataTable<DirectoryPerson>
        caption={t("team.usersTitle")}
        rows={people}
        getRowKey={(person) => person.id}
        emptyMessage={t("team.noUsers")}
        columns={[
          { id: "name", header: t("team.userName"), accessor: (person) => person.displayName },
          { id: "email", header: t("team.userEmail"), accessor: (person) => person.email },
          {
            id: "standing",
            header: t("team.fieldStanding"),
            accessor: (person) => t(`team.standing_${person.standing}`),
          },
          {
            id: "types",
            header: t("team.userTypes"),
            accessor: (person) =>
              person.userTypes.length === 0
                ? t("team.noRole")
                : person.userTypes.map(roleName).join(t("common.listSeparator")),
          },
          {
            id: "projects",
            header: t("team.directoryProjects"),
            accessor: (person) =>
              person.projects.length === 0
                ? t("team.directoryNoVisibleProjects")
                : person.projects.map((project) => project.code).join(t("common.listSeparator")),
          },
          {
            id: "work",
            header: t("team.directoryWorkColumn"),
            accessor: (person) => t("team.directoryOpenTasks", { count: person.openTaskCount }),
          },
          {
            id: "status",
            header: t("team.userStatus"),
            accessor: (person) => (
              <Badge tone={person.status === "active" ? "success" : "neutral"}>
                {t(`enums.userStatus.${person.status}`)}
              </Badge>
            ),
          },
          {
            id: "action",
            header: t("team.userAction"),
            accessor: (person) => <PersonActions person={person} {...actions} />,
          },
        ]}
      />
    );
  }

  return (
    <ul className="rect-directory__list" aria-label={t("team.usersTitle")}>
      {people.map((person) => (
        <li key={person.id} className="rect-person">
          <div className="rect-person__head">
            <Avatar name={person.displayName} colorKey={person.id} />
            <div className="rect-person__identity">
              <p className="rect-person__name">{person.displayName}</p>
              <p className="rect-person__email">{person.email}</p>
            </div>
            {/* Standing is a different kind of thing from a user type, so it
                reads differently rather than sitting in the same row of tags. */}
            {person.standing !== "member" ? (
              <Badge tone={person.standing === "owner" ? "warning" : "info"}>
                {t(`team.standing_${person.standing}`)}
              </Badge>
            ) : null}
            <Badge tone={person.status === "active" ? "success" : "neutral"}>
              {t(`enums.userStatus.${person.status}`)}
            </Badge>
          </div>

          <div className="rect-person__facts">
            {person.userTypes.length === 0 ? (
              <span className="rect-person__norole">{t("team.noRole")}</span>
            ) : (
              person.userTypes.map((type) => (
                <Badge key={type.id} tone="info">
                  {roleName(type)}
                </Badge>
              ))
            )}
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
            <ProjectList person={person} />
          </div>

          <div className="rect-person__foot">
            <PersonActions person={person} {...actions} />
          </div>
        </li>
      ))}
    </ul>
  );
}
