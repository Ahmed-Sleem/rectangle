/**
 * What one person may do, chosen directly.
 *
 * This used to ask two questions — a standing, and a set of bundles — and the
 * answer to "what can this person actually do" was the union of two things
 * neither of which was on the screen. Choosing "Project office" for a site
 * engineer handed them every project in the company, because that permission
 * was buried inside a bundle nobody opens.
 *
 * Now the permissions themselves are the field. A saved bundle is offered
 * above them purely to fill the boxes in, and the moment it does its job the
 * ticks are the person's own: changing one does not "leave" the bundle,
 * because the bundle was never holding anything.
 *
 * Both the create dialog and the edit dialog render this, so the rule for
 * granting access is written once.
 */
import { useState } from "react";
import type { UseFormReturn } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { Button, Field, Select } from "@/shared/ui";
import { PermissionPicker } from "./PermissionPicker";
import type { CompanyStanding, PermissionOption, UserTypeRecord } from "./admin-api";

/** The owner holds everything by standing, so nothing else needs asking. */
export function standingGrantsEverything(standing: string): boolean {
  return standing === "owner";
}

/**
 * The fields this component reads. Both dialogs' forms contain these; the
 * create form contains more, which is why the prop is written as "a form whose
 * values include these" rather than as one exact form type.
 */
export interface AccessFormValues {
  standing: CompanyStanding;
  permissions: string[];
}

export interface AccessFieldsProps<TValues extends AccessFormValues> {
  /*
   * Generic rather than cast to `any`.
   *
   * The first version took `UseFormReturn<never>` and cast, which silently
   * turned off checking on the field names this component depends on — a typo
   * in `watch("standing")` compiled cleanly, verified. Constraining the generic
   * to a form whose values include those fields keeps both dialogs assignable
   * while the names stay checked.
   */
  form: UseFormReturn<TValues>;
  /** Saved lists, offered as a starting point. They grant nothing themselves. */
  bundles: UserTypeRecord[];
  permissionOptions: PermissionOption[];
  /** Only an owner may make another owner. The API refuses it as well. */
  isOwner: boolean;
  /**
   * What the person filling the form holds.
   *
   * Nobody may grant what they were never given, and the server refuses it, so
   * the permissions beyond the granter's own are not offered. Showing them
   * would be offering a choice that always ends in a refusal.
   */
  grantable: string[];
}

export function AccessFields<TValues extends AccessFormValues>({
  form,
  bundles,
  permissionOptions,
  isOwner,
  grantable,
}: AccessFieldsProps<TValues>) {
  const { t } = useTranslation();
  /*
   * `react-hook-form` types `watch` and `setValue` against the exact form
   * shape, and a generic constrained to a supertype cannot prove to the
   * compiler that a literal key belongs to it. This one narrowing is the whole
   * concession, and it is made once here rather than at every call — the field
   * names below are still checked against `AccessFormValues`.
   */
  const fields = form as unknown as UseFormReturn<AccessFormValues>;

  const standing = fields.watch("standing") ?? "none";
  const permissions = fields.watch("permissions") ?? [];
  const everything = standingGrantsEverything(standing);

  /*
   * Which bundle was last applied, remembered only so the control can say so.
   * Deliberately not part of the form: the saved value is the permissions, and
   * keeping a bundle id alongside them would invite somebody to treat it as
   * the source of truth again.
   */
  const [appliedBundle, setAppliedBundle] = useState("");

  const offered = permissionOptions.filter((option) => grantable.includes(option.key));

  function applyBundle(bundleId: string): void {
    setAppliedBundle(bundleId);
    const bundle = bundles.find((candidate) => candidate.id === bundleId);
    if (!bundle) return;
    // Filtered to what the granter holds, so applying a bundle can never ask
    // the server for something it is about to refuse.
    fields.setValue(
      "permissions",
      bundle.permissions.filter((permission) => grantable.includes(permission)),
      { shouldDirty: true, shouldValidate: true },
    );
  }

  return (
    <>
      <Field
        label={t("team.fieldStanding")}
        hint={t("team.standingHint")}
        error={fields.formState.errors.standing?.message}
        required
      >
        {/*
          * Only an owner is offered the owner option. Everybody else sees a
          * single value, which reads as the statement it is: this person's
          * access is the list below and nothing more.
          */}
        <Select {...fields.register("standing")}>
          {(isOwner ? ["none", "owner"] : ["none"]).map((value) => (
            <option key={value} value={value}>
              {t(`team.standing_${value}`)}
            </option>
          ))}
        </Select>
      </Field>

      {everything ? (
        /*
         * The ticks are hidden rather than shown and ignored. An owner holds
         * every permission by standing, so a list of boxes beside that
         * statement would be a second answer to a question already answered.
         */
        <Field label={t("team.permissionsTitle")}>
          <p className="rect-panel-note">{t("team.effectiveEverything")}</p>
        </Field>
      ) : (
        <>
          {bundles.length > 0 ? (
            <Field label={t("team.bundleLabel")} hint={t("team.bundleHint")}>
              <div className="rect-team-bundle">
                {/*
                  * Named directly rather than by the surrounding Field, whose
                  * label points at the wrapper holding both this and the clear
                  * button — a wrapper is not a labellable control, so without
                  * this the select has no accessible name at all.
                  */}
                <Select
                  aria-label={t("team.bundleLabel")}
                  value={appliedBundle}
                  onChange={(event) => applyBundle(event.currentTarget.value)}
                >
                  <option value="">{t("team.bundleNone")}</option>
                  {bundles.map((bundle) => (
                    <option key={bundle.id} value={bundle.id}>
                      {bundle.name}
                    </option>
                  ))}
                </Select>
                {/*
                  * Clearing is its own action rather than a bundle called
                  * "nothing", because starting from scratch is a thing people
                  * do deliberately and it should not look like a saved list.
                  */}
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setAppliedBundle("");
                    fields.setValue("permissions", [], {
                      shouldDirty: true,
                      shouldValidate: true,
                    });
                  }}
                >
                  {t("team.bundleClear")}
                </Button>
              </div>
            </Field>
          ) : null}

          <Field
            label={t("team.permissionsTitle")}
            hint={t("team.permissionsGrantHint")}
            error={fields.formState.errors.permissions?.message}
          >
            <PermissionPicker
              options={offered}
              value={permissions}
              onChange={(next) =>
                fields.setValue("permissions", next, {
                  shouldDirty: true,
                  shouldValidate: true,
                })
              }
            />
          </Field>
        </>
      )}
    </>
  );
}
