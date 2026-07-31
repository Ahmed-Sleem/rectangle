/**
 * What every permission allows, and who currently holds it.
 *
 * The product has twenty-seven atomic permissions, four company standings, five
 * project roles and a separation-of-duties table. Each is defensible on its own
 * and together they are more than anybody holds in their head, which is how a
 * company ends up granting more than it meant to — not through carelessness but
 * because nowhere shows the whole picture at once.
 *
 * The rules come before the table deliberately. A matrix of permissions against
 * user types answers "who holds what" and silently omits four things that decide
 * access just as much: an owner holds everything with no user type at all, a
 * guest is refused every company-wide permission whatever they hold, per-project
 * actions need reach as well as capability, and deleting a project is stricter
 * than any permission. A reader who takes the matrix at face value without those
 * would draw the wrong conclusion, and a page that looks authoritative while
 * being wrong is worse than no page.
 *
 * Everything is composed on the server from the same modules the guards read, so
 * this cannot drift into describing a system that no longer exists.
 */
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useOptionalAuth } from "@/shared/auth";
import { hasPermission } from "@/shared/auth/authority";
import { Badge, Button, ErrorState, LoadingState, NoPermissionState } from "@/shared/ui";
import { adminApi } from "@/features/team/admin-api";
import "./PermissionReference.css";

/** Groups in the order the server declares them, so areas stay together. */
function groupOrder(permissions: Array<{ group: string }>): string[] {
  const seen: string[] = [];
  for (const permission of permissions) {
    if (!seen.includes(permission.group)) seen.push(permission.group);
  }
  return seen;
}

export function PermissionReference() {
  const { t } = useTranslation();
  const auth = useOptionalAuth();

  /*
   * Asked here rather than left to the section hosting it. The host hides this
   * today, but a component that only behaves while its parent remembers to gate
   * it is one refactor from being reachable.
   */
  const mayRead = hasPermission(auth?.user, "settings.manage");

  const reference = useQuery({
    queryKey: ["admin", "permission-reference"],
    queryFn: adminApi.permissionReference,
    enabled: mayRead,
  });

  if (!mayRead) {
    return (
      <NoPermissionState
        title={t("common.noPermissionTitle")}
        message={t("common.noPermissionMessage")}
      />
    );
  }

  if (reference.isError) {
    return (
      <ErrorState
        title={t("permissionReference.errorTitle")}
        message={t("permissionReference.errorMessage")}
        action={
          <Button variant="secondary" onClick={() => void reference.refetch()}>
            {t("permissionReference.tryAgain")}
          </Button>
        }
      />
    );
  }

  /*
   * `permissions` is checked rather than only `data`, because a response that
   * arrives without it is as unusable as no response at all — and rendering
   * from it throws inside React, which takes the whole Settings page down
   * rather than this one section.
   */
  if (reference.isLoading || !reference.data?.permissions) {
    return (
      <LoadingState
        title={t("permissionReference.loadingTitle")}
        message={t("permissionReference.loadingMessage")}
      />
    );
  }

  const { permissions, projectRoles, standings } = reference.data;
  const labelFor = (key: string) =>
    permissions.find((permission) => permission.key === key)?.label ?? key;

  return (
    <div className="rect-permref">
      {/*
        Read first. Each of these changes how the table below should be
        understood, and a reader who skips them will draw the wrong conclusion
        from a table that looks complete.
      */}
      <section className="rect-permref__rules" aria-label={t("permissionReference.rulesLabel")}>
        <h3 className="rect-permref__heading">{t("permissionReference.rulesTitle")}</h3>
        <ol className="rect-permref__rule-list">
          <li>{t("permissionReference.ruleStanding")}</li>
          <li>{t("permissionReference.ruleGuest")}</li>
          <li>{t("permissionReference.ruleReach")}</li>
          <li>{t("permissionReference.ruleDeletion")}</li>
          <li>{t("permissionReference.ruleSeparation")}</li>
        </ol>
      </section>

      {/* ── What a standing means, before the types that sit inside one ── */}
      <section className="rect-permref__block" aria-label={t("permissionReference.standingsTitle")}>
        <h3 className="rect-permref__heading">{t("permissionReference.standingsTitle")}</h3>
        <p className="rect-permref__note">{t("permissionReference.standingsNote")}</p>
        <ul className="rect-permref__standings">
          {standings.map((standing) => (
            <li key={standing.standing} className="rect-permref__standing">
              <span className="rect-permref__standing-name">
                {t(`team.standing_${standing.standing}`)}
              </span>
              <span className="rect-permref__standing-effect">
                {standing.holdsEverything
                  ? t("permissionReference.standingEverything")
                  : standing.refusedCompanyWide
                    ? t("permissionReference.standingGuest")
                    : t("permissionReference.standingFromTypes")}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {/* ── The permissions themselves, grouped so 27 rows stay readable ── */}
      <section className="rect-permref__block" aria-label={t("permissionReference.matrixTitle")}>
        <h3 className="rect-permref__heading">{t("permissionReference.matrixTitle")}</h3>
        <p className="rect-permref__note">{t("permissionReference.matrixNote")}</p>

        {groupOrder(permissions).map((group) => (
          <div className="rect-permref__group" key={group}>
            <h4 className="rect-permref__group-name">{t(`team.permissionGroup_${group}`)}</h4>
            <ul className="rect-permref__rows">
              {permissions
                .filter((permission) => permission.group === group)
                .map((permission) => (
                  <li className="rect-permref__row" key={permission.key}>
                    <div className="rect-permref__what">
                      <span className="rect-permref__label">{permission.label}</span>
                      <span className="rect-permref__description">{permission.description}</span>
                      {permission.implies && permission.implies.length > 0 ? (
                        // Stated because it is the reason a granted set is
                        // sometimes larger than the boxes that were ticked.
                        <span className="rect-permref__implies">
                          {t("permissionReference.alsoGrants", {
                            permissions: permission.implies.map(labelFor).join(
                              t("common.listSeparator"),
                            ),
                          })}
                        </span>
                      ) : null}
                    </div>
                    <div className="rect-permref__holders">
                      {permission.heldBy.length === 0 ? (
                        /* Not an error. A permission no type grants is one only
                           owners and administrators have, which is worth seeing. */
                        <span className="rect-permref__nobody">
                          {t("permissionReference.nobodyHolds")}
                        </span>
                      ) : (
                        permission.heldBy.map((type) => (
                          <Badge key={type.id} tone="neutral">{type.name}</Badge>
                        ))
                      )}
                    </div>
                  </li>
                ))}
            </ul>
          </div>
        ))}
      </section>

      {/* ── What being on a project grants, which no company-wide table shows ── */}
      <section className="rect-permref__block" aria-label={t("permissionReference.projectRolesTitle")}>
        <h3 className="rect-permref__heading">{t("permissionReference.projectRolesTitle")}</h3>
        <p className="rect-permref__note">{t("permissionReference.projectRolesNote")}</p>
        <ul className="rect-permref__rows">
          {projectRoles.map((role) => (
            <li className="rect-permref__row" key={role.role}>
              <div className="rect-permref__what">
                <span className="rect-permref__label">
                  {/* The same namespace the project team table uses, so a role
                      is named identically wherever it appears. No defaultValue:
                      a missing translation should be a visible gap, not a raw
                      key rendered as though it were prose. */}
                  {t(`enums.memberRole.${role.role}`)}
                </span>
              </div>
              <div className="rect-permref__holders">
                {role.grants.length === 0 ? (
                  <span className="rect-permref__nobody">
                    {t("permissionReference.grantsNothing")}
                  </span>
                ) : (
                  role.grants.map((grant) => (
                    <Badge key={grant} tone="neutral">{labelFor(grant)}</Badge>
                  ))
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
