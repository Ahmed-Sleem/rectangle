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

/**
 * How many permission names a row shows before collapsing into a count.
 *
 * Three fits one line at the narrowest supported width, which is the point of
 * the limit: a row that wraps to four lines stops being scannable.
 */
const PERMISSIONS_SHOWN = 3;

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
  /** Turns a permission key into the label the catalogue gives it. */
  permissionLabel: (key: string) => string;
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
  permissionLabel,
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
            id: "permissions",
            header: t("team.permissionsColumn"),
            /*
             * A count, not the list. Somebody scanning the register wants to
             * know who has a lot of access and who has none; twenty permission
             * names in a table cell answers neither question and makes every
             * row a different height.
             */
            accessor: (person) =>
              person.standing === "owner"
                ? t("team.permissionsEverything")
                : t("team.permissionCount", { count: person.permissions.length }),
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
            {/* Only ownership is a standing worth announcing; everybody else
                is described by what they may do, just below. */}
            {person.standing === "owner" ? (
              <Badge tone="warning">{t("team.standing_owner")}</Badge>
            ) : null}
            <Badge tone={person.status === "active" ? "success" : "neutral"}>
              {t(`enums.userStatus.${person.status}`)}
            </Badge>
          </div>

          <div className="rect-person__facts">
            {/*
              * The first few by name, then a count. The names are what make an
              * unexpected grant noticeable at a glance; listing all of them
              * would bury that in a wall of tags nobody reads.
              */}
            {person.standing === "owner" ? (
              <Badge tone="warning">{t("team.permissionsEverything")}</Badge>
            ) : person.permissions.length === 0 ? (
              <span className="rect-person__norole">{t("team.permissionsNone")}</span>
            ) : (
              <>
                {person.permissions.slice(0, PERMISSIONS_SHOWN).map((permission) => (
                  <Badge key={permission} tone="info">
                    {permissionLabel(permission)}
                  </Badge>
                ))}
                {person.permissions.length > PERMISSIONS_SHOWN ? (
                  <Badge tone="neutral">
                    {t("team.permissionsMore", {
                      count: person.permissions.length - PERMISSIONS_SHOWN,
                    })}
                  </Badge>
                ) : null}
              </>
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
