/**
 * Standing, user types, and what the two add up to.
 *
 * The same three fields appeared in the create-person dialog and the
 * edit-person dialog, written out twice, and the copies had already drifted:
 * the edit form had lost the hint explaining that owners and administrators do
 * not need a user type. Nobody would notice, because you have to open two
 * dialogs side by side to see it.
 *
 * Extracted so there is one answer to "how is access chosen for a person". Both
 * dialogs render this; a change to the rule is a change in one place.
 */
import type { TFunction } from "i18next";
import type { UseFormReturn } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { Checkbox, Field, Select } from "@/shared/ui";
import type { PermissionOption, UserTypeRecord } from "./admin-api";

/** Owners and administrators hold everything by standing, whatever else says. */
export function standingGrantsEverything(standing: string): boolean {
  return standing === "owner" || standing === "admin";
}

export interface EffectiveEntry {
  key: string;
  from: string[];
}

/** The shape both dialogs' forms share, which is all this component touches. */
interface AccessForm {
  standing: string;
  userTypeIds: string[];
}

export interface AccessFieldsProps {
  /*
   * Typed loosely on purpose. The create form carries an email and a password
   * and the edit form does not, so demanding one exact form type here would
   * force one of them to pretend to have fields it has no business holding.
   * Only the two fields above are read.
   */
  form: UseFormReturn<never> | UseFormReturn<AccessForm & Record<string, unknown>>;
  types: UserTypeRecord[];
  permissionOptions: PermissionOption[];
  /** Only an owner may mint another owner. The API refuses it as well. */
  isOwner: boolean;
  effectivePermissions: (selectedIds: string[], types: UserTypeRecord[]) => EffectiveEntry[];
  roleName: (type: { name: string; key: string; systemType?: boolean }, t: TFunction) => string;
}

export function AccessFields({
  form,
  types,
  permissionOptions,
  isOwner,
  effectivePermissions,
  roleName,
}: AccessFieldsProps) {
  const { t } = useTranslation();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- see the note on `form`.
  const anyForm = form as any;

  const standing: string = anyForm.watch("standing") ?? "member";
  const selectedTypeIds: string[] = anyForm.watch("userTypeIds") ?? [];
  const everything = standingGrantsEverything(standing);
  const effective = effectivePermissions(selectedTypeIds, types);

  return (
    <>
      <Field
        label={t("team.fieldStanding")}
        hint={t("team.standingHint")}
        error={anyForm.formState.errors.standing?.message}
        required
      >
        <Select {...anyForm.register("standing")}>
          {(isOwner ? ["owner", "admin", "member", "guest"] : ["admin", "member", "guest"]).map(
            (value) => (
              <option key={value} value={value}>
                {t(`team.standing_${value}`)}
              </option>
            ),
          )}
        </Select>
      </Field>

      {/*
        * Hidden for owners and administrators, and this is the confusion the
        * owner reported. Their standing already carries every permission, so
        * the form was demanding a second choice that changed nothing and then
        * reporting, truthfully, that the choice had changed nothing. The
        * question is only asked of the people whose access depends on it.
        */}
      {everything ? null : (
        <Field
          label={t("team.userTypes")}
          hint={t("team.userTypesHint")}
          error={anyForm.formState.errors.userTypeIds?.message}
          required
        >
          <div className="rect-team-permissions">
            {types.map((type) => (
              <Checkbox
                key={type.id}
                label={roleName(type, t)}
                {...(type.description ? { description: type.description } : {})}
                value={type.id}
                {...anyForm.register("userTypeIds")}
              />
            ))}
          </div>
        </Field>
      )}

      <Field label={t("team.effectiveTitle")} hint={t("team.effectiveHint")}>
        <div className="rect-team-effective">
          {everything ? (
            <p className="rect-panel-note">{t("team.effectiveEverything")}</p>
          ) : effective.length === 0 ? (
            <p className="rect-panel-note">{t("team.effectiveNone")}</p>
          ) : (
            <ul className="rect-team-effective__list">
              {effective.map((entry) => (
                <li key={entry.key} className="rect-team-effective__item">
                  <span className="rect-team-effective__name">
                    {permissionOptions.find((option) => option.key === entry.key)?.label ?? entry.key}
                  </span>
                  {/* Naming the source is what makes an unexpected grant traceable. */}
                  <span className="rect-team-effective__source">
                    {entry.from.join(t("common.listSeparator"))}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Field>
    </>
  );
}
