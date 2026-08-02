/**
 * What one person may do, chosen through stacked windows.
 *
 * This used to ask two questions — a standing, and a set of bundles — and the
 * answer to "what can this person actually do" was the union of two things
 * neither of which was on the screen. Choosing "Project office" for a site
 * engineer handed them every project in the company, because that permission
 * was buried inside a bundle nobody opens.
 *
 * Now the permissions themselves are what is saved, and the main window offers
 * the three ways somebody actually arrives at them: pick a list you saved
 * earlier, build one now and save it for next time, or tick boxes for this
 * person alone. The second and third open a window of their own rather than
 * unfolding in place, because a permission catalogue is far taller than the
 * form around it and pushing the name and email fields off screen loses the
 * person's place in what they were doing.
 *
 * A saved list grants nothing. Choosing one copies its ticks onto the person
 * and the link ends there, so editing a list later cannot silently change
 * somebody's access — which is exactly what the old model did.
 */
import { useState } from "react";
import { Layers, PencilRuler, Plus } from "lucide-react";
import type { UseFormReturn } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { Badge, Button, Field, FormDialog, Input, Overlay, Select } from "@/shared/ui";
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
  /** Lists this company saved earlier. They prefill the ticks and grant nothing. */
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
  /** Saves a new list. Absent when the person may not create one. */
  onCreateBundle?: (input: {
    name: string;
    key: string;
    description?: string;
    permissions: string[];
  }) => Promise<void>;
}

export function AccessFields<TValues extends AccessFormValues>({
  form,
  bundles,
  permissionOptions,
  isOwner,
  grantable,
  onCreateBundle,
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

  const [pickerOpen, setPickerOpen] = useState(false);
  const [bundleOpen, setBundleOpen] = useState(false);

  const offered = permissionOptions.filter((option) => grantable.includes(option.key));
  const labelFor = (key: string) =>
    permissionOptions.find((option) => option.key === key)?.label ?? key;

  function setPermissions(next: string[]): void {
    fields.setValue("permissions", next, { shouldDirty: true, shouldValidate: true });
  }

  function applyBundle(bundleId: string): void {
    const bundle = bundles.find((candidate) => candidate.id === bundleId);
    if (!bundle) return;
    // Filtered to what the granter holds, so applying a list can never ask the
    // server for something it is about to refuse.
    setPermissions(bundle.permissions.filter((permission) => grantable.includes(permission)));
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
        <Field
          label={t("team.permissionsTitle")}
          hint={t("team.permissionsGrantHint")}
          error={fields.formState.errors.permissions?.message}
        >
          <div className="rect-access">
            {bundles.length > 0 ? (
              <label className="rect-access__row">
                <span className="rect-access__label">{t("team.bundleLabel")}</span>
                <Select
                  aria-label={t("team.bundleLabel")}
                  defaultValue=""
                  onChange={(event) => applyBundle(event.currentTarget.value)}
                >
                  <option value="">{t("team.bundleNone")}</option>
                  {bundles.map((bundle) => (
                    <option key={bundle.id} value={bundle.id}>
                      {bundle.name}
                    </option>
                  ))}
                </Select>
              </label>
            ) : null}

            <div className="rect-access__actions">
              {/*
                * Both open a window rather than expanding here. The catalogue
                * is taller than this form, and unfolding it in place pushes
                * the name and email out of sight mid-task.
                */}
              <Button type="button" variant="secondary" onClick={() => setPickerOpen(true)}>
                <PencilRuler size={16} strokeWidth={2} aria-hidden />
                {permissions.length === 0 ? t("team.chooseFromScratch") : t("team.changeChosen")}
              </Button>
              {onCreateBundle ? (
                <Button type="button" variant="ghost" onClick={() => setBundleOpen(true)}>
                  <Plus size={16} strokeWidth={2} aria-hidden />
                  {t("team.bundleCreate")}
                </Button>
              ) : null}
            </div>

            {/*
              * What is actually about to be saved, in the main window. Sending
              * somebody into a second window to find out what they chose in it
              * would make the summary useless.
              */}
            <div className="rect-access__chosen" aria-live="polite">
              {permissions.length === 0 ? (
                <p className="rect-panel-note">{t("team.permissionsNone")}</p>
              ) : (
                permissions.map((permission) => (
                  <Badge key={permission} tone="info">
                    {labelFor(permission)}
                  </Badge>
                ))
              )}
            </div>
          </div>
        </Field>
      )}

      {/*
        * Ticking for this person only. Its own window, stacked above the form,
        * with the form frozen behind it until this one is finished.
        */}
      <Overlay
        open={pickerOpen}
        title={t("team.permissionsTitle")}
        description={t("team.permissionsGrantHint")}
        size="lg"
        onClose={() => setPickerOpen(false)}
        footer={
          <Button variant="primary" onClick={() => setPickerOpen(false)}>
            {t("team.permissionsDone")}
          </Button>
        }
      >
        <PermissionPicker options={offered} value={permissions} onChange={setPermissions} />
      </Overlay>

      {onCreateBundle ? (
        <BundleWindow
          open={bundleOpen}
          options={offered}
          onClose={() => setBundleOpen(false)}
          onSave={async (input) => {
            await onCreateBundle(input);
            /*
             * The list is saved and its ticks are applied to the person in one
             * action, because somebody who just described a role is describing
             * the person in front of them. Then this window closes and the
             * form behind it shows the result — which is the whole point of
             * stacking rather than navigating away.
             */
            setPermissions(input.permissions);
            setBundleOpen(false);
          }}
        />
      ) : null}
    </>
  );
}

/**
 * Creating a saved list, from inside the person form.
 *
 * Deliberately the same window whether it is reached from here or from the
 * Roles register: one definition of "what a saved list is", so the two cannot
 * drift into asking for different things.
 */
function BundleWindow({
  open,
  options,
  onClose,
  onSave,
}: {
  open: boolean;
  options: PermissionOption[];
  onClose: () => void;
  onSave: (input: {
    name: string;
    key: string;
    description?: string;
    permissions: string[];
  }) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [permissions, setPermissions] = useState<string[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /*
   * Derived from the name rather than asked for. The key is what audit entries
   * reference, so it has to exist, but making somebody invent a second
   * identifier for the same thing is a question with no useful answer.
   */
  const key = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "_")
    .replace(/^_+|_+$/gu, "");

  const valid = name.trim().length >= 2 && key.length >= 2 && permissions.length > 0;

  return (
    <FormDialog
      open={open}
      title={t("team.bundleCreate")}
      description={t("team.bundleCreateDescription")}
      size="lg"
      onClose={onClose}
      submitLabel={t("team.bundleSave")}
      pending={pending}
      submitDisabled={!valid}
      error={error}
      onSubmit={(event) => {
        event.preventDefault();
        if (!valid) return;
        setPending(true);
        setError(null);
        void onSave({ name: name.trim(), key, permissions })
          .then(() => {
            setName("");
            setPermissions([]);
          })
          .catch((cause: unknown) => {
            setError(cause instanceof Error ? cause.message : t("team.createUserTypeFailed"));
          })
          .finally(() => setPending(false));
      }}
    >
      <Field label={t("team.fieldName")} hint={t("team.bundleNameHint")} required>
        <Input
          data-autofocus="true"
          value={name}
          onChange={(event) => setName(event.currentTarget.value)}
        />
      </Field>
      <Field label={t("team.fieldPermissions")} hint={t("team.permissionsHint")} required>
        <PermissionPicker options={options} value={permissions} onChange={setPermissions} />
      </Field>
      <p className="rect-panel-note">
        <Layers size={14} strokeWidth={2} aria-hidden /> {t("team.bundleGrantsNothing")}
      </p>
    </FormDialog>
  );
}
