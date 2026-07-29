/**
 * Declares which pairs of permissions one person may never hold at once.
 *
 * The enforcement has always been here; the rules could only be entered by
 * hand in the database, which meant the control existed and no company could
 * use it. This is the screen that makes it real.
 *
 * The shape of the flow is set by what a mistake here costs. Declaring a pair
 * can take access away from people who already hold both, so the screen asks
 * what the rule would cost, shows exactly who loses which user type, and only
 * writes anything once that has been read and confirmed. A control that
 * silently changes people's access is the kind of feature administrators learn
 * to be frightened of.
 */
import { ShieldAlert, Trash2 } from "lucide-react";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ApiClientError } from "@/shared/api/client";
import { useOptionalAuth } from "@/shared/auth";
import { hasPermission } from "@/shared/auth/authority";
import {
  Badge,
  Button,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Field,
  Input,
  LoadingState,
  NoPermissionState,
  Select,
} from "@/shared/ui";
import {
  adminApi,
  type PermissionOption,
  type SeparationRuleRecord,
  type SeparationViolatorRecord,
} from "@/features/team/admin-api";
import "./SeparationRules.css";

/** The pair being composed, before it is worth asking the server anything. */
interface Draft {
  a: string;
  b: string;
  reason: string;
}

const EMPTY_DRAFT: Draft = { a: "", b: "", reason: "" };

export function SeparationRules() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const auth = useOptionalAuth();

  /*
   * Asked here rather than left to the section that hosts it.
   *
   * The host does hide this today, but a component that only behaves when its
   * parent remembers to gate it is one refactor away from being reachable. The
   * server decides either way; this is about not putting controls in front of
   * somebody whose every request would be refused.
   */
  const mayManage = hasPermission(auth?.user, "settings.manage");

  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  /** Which half existing violators give up. Only asked once there are any. */
  const [losing, setLosing] = useState<string>("");
  const [violators, setViolators] = useState<SeparationViolatorRecord[] | null>(null);
  const [pendingDelete, setPendingDelete] = useState<SeparationRuleRecord | null>(null);

  const permissions = useQuery({
    queryKey: ["admin", "permissions"],
    queryFn: adminApi.permissions,
    enabled: mayManage,
  });
  const rules = useQuery({
    queryKey: ["admin", "separation-rules"],
    queryFn: adminApi.separationRules,
    enabled: mayManage,
  });

  const options: PermissionOption[] = permissions.data?.permissions ?? [];
  const labelFor = (key: string) =>
    options.find((option) => option.key === key)?.label ?? key;

  function resetForm() {
    setDraft(EMPTY_DRAFT);
    setLosing("");
    setViolators(null);
  }

  const preview = useMutation({
    mutationFn: () => adminApi.previewSeparationRule({ a: draft.a, b: draft.b }),
    onSuccess: (result) => {
      setViolators(result.violators);
      /*
       * Nothing is preselected. Which permission a company gives up is the
       * decision this screen exists to make, and a default would be answering
       * it for them.
       */
      setLosing("");
    },
  });

  const create = useMutation({
    mutationFn: () =>
      adminApi.createSeparationRule({
        a: draft.a,
        b: draft.b,
        reason: draft.reason.trim(),
        // Irrelevant when nobody is in violation, but the server still expects
        // one of the pair, so the first is sent rather than an empty string.
        losing: losing || draft.a,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin", "separation-rules"] });
      // People's user types may have changed, so anything showing them is stale.
      await queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
      resetForm();
    },
  });

  const remove = useMutation({
    mutationFn: (ruleId: string) => adminApi.deleteSeparationRule(ruleId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin", "separation-rules"] });
      setPendingDelete(null);
    },
  });

  const bothChosen = draft.a !== "" && draft.b !== "" && draft.a !== draft.b;
  const reasonLongEnough = draft.reason.trim().length >= 10;
  /* Once a preview has run, a choice is only needed if somebody is affected. */
  const needsChoice = (violators?.length ?? 0) > 0 && losing === "";
  const canSave = bothChosen && reasonLongEnough && violators !== null && !needsChoice;

  function messageFor(error: unknown, fallback: string): string | null {
    if (!error) return null;
    return error instanceof ApiClientError ? error.message : fallback;
  }

  /** Names the people a rule cannot be applied to, from the server's refusal. */
  function blockedNames(error: unknown): string[] {
    if (!(error instanceof ApiClientError)) return [];
    const details = error.details as { wouldEmpty?: unknown } | undefined;
    return Array.isArray(details?.wouldEmpty) ? details.wouldEmpty.map(String) : [];
  }

  if (!mayManage) {
    return (
      <NoPermissionState
        title={t("common.noPermissionTitle")}
        message={t("common.noPermissionMessage")}
      />
    );
  }

  if (rules.isError || permissions.isError) {
    return (
      <ErrorState
        title={t("separation.loadErrorTitle")}
        message={t("separation.loadErrorMessage")}
        action={
          <Button variant="secondary" onClick={() => void rules.refetch()}>
            {t("separation.tryAgain")}
          </Button>
        }
      />
    );
  }

  if (rules.isLoading || permissions.isLoading) {
    return <LoadingState title={t("separation.loadingTitle")} message={t("separation.loadingMessage")} />;
  }

  const existing = rules.data?.rules ?? [];

  return (
    <div className="rect-separation">
      {existing.length === 0 ? (
        /*
         * The empty state carries the explanation rather than a heading above
         * the form, because almost nobody knows what "separation of duties"
         * means and the first time they see this is when they need telling.
         */
        <EmptyState
          title={t("separation.emptyTitle")}
          message={t("separation.emptyMessage")}
        />
      ) : (
        <ul className="rect-separation__list" aria-label={t("separation.listLabel")}>
          {existing.map((rule) => (
            <li key={rule.id} className="rect-separation__rule">
              <div className="rect-separation__pair">
                <Badge tone="neutral">{labelFor(rule.a)}</Badge>
                <span className="rect-separation__conjunction">{t("separation.and")}</span>
                <Badge tone="neutral">{labelFor(rule.b)}</Badge>
              </div>
              <p className="rect-separation__reason">{rule.reason}</p>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setPendingDelete(rule)}
                aria-label={t("separation.removeLabel", {
                  a: labelFor(rule.a),
                  b: labelFor(rule.b),
                })}
              >
                <Trash2 size={14} strokeWidth={2} aria-hidden />
                {t("separation.remove")}
              </Button>
            </li>
          ))}
        </ul>
      )}

      <form
        className="rect-separation__form"
        onSubmit={(event) => {
          event.preventDefault();
          if (canSave) create.mutate();
        }}
      >
        <div className="rect-separation__pickers">
          <Field label={t("separation.firstPermission")} required>
            <Select
              value={draft.a}
              onChange={(event) => {
                /*
                 * Read before the updater runs. React pools nothing these days,
                 * but `currentTarget` is only meaningful while the handler is on
                 * the stack, and a state updater is invoked later — by which
                 * time it is null.
                 */
                const value = event.currentTarget.value;
                setDraft((current) => ({ ...current, a: value }));
                // The previous answer described a different pair.
                setViolators(null);
                setLosing("");
              }}
            >
              <option value="">{t("separation.choosePermission")}</option>
              {options.map((option) => (
                <option key={option.key} value={option.key}>{option.label}</option>
              ))}
            </Select>
          </Field>

          <Field label={t("separation.secondPermission")} required>
            <Select
              value={draft.b}
              onChange={(event) => {
                const value = event.currentTarget.value;
                setDraft((current) => ({ ...current, b: value }));
                setViolators(null);
                setLosing("");
              }}
            >
              <option value="">{t("separation.choosePermission")}</option>
              {/* The one already chosen is absent: a permission cannot conflict
                  with itself, and offering it invites an error the server would
                  only refuse after the fact. */}
              {options
                .filter((option) => option.key !== draft.a)
                .map((option) => (
                  <option key={option.key} value={option.key}>{option.label}</option>
                ))}
            </Select>
          </Field>
        </div>

        <Field
          label={t("separation.reason")}
          hint={t("separation.reasonHint")}
          required
        >
          <Input
            value={draft.reason}
            onChange={(event) => {
              const value = event.currentTarget.value;
              setDraft((current) => ({ ...current, reason: value }));
            }}
            placeholder={t("separation.reasonPlaceholder")}
          />
        </Field>

        {violators === null ? (
          <div className="rect-separation__actions">
            <Button
              type="button"
              variant="secondary"
              disabled={!bothChosen || preview.isPending}
              onClick={() => preview.mutate()}
            >
              {preview.isPending ? t("separation.checking") : t("separation.check")}
            </Button>
          </div>
        ) : (
          <div className="rect-separation__outcome">
            {violators.length === 0 ? (
              <p className="rect-separation__clear">{t("separation.nobodyAffected")}</p>
            ) : (
              <>
                <p className="rect-separation__warning">
                  <ShieldAlert size={16} strokeWidth={2} aria-hidden />
                  {t("separation.affectedCount", { count: violators.length })}
                </p>

                <Field label={t("separation.whichToGiveUp")} hint={t("separation.whichToGiveUpHint")} required>
                  <Select value={losing} onChange={(event) => setLosing(event.currentTarget.value)}>
                    <option value="">{t("separation.chooseSide")}</option>
                    {/*
                      A side that would empty somebody is offered but disabled,
                      with the reason attached. Hiding it would leave the
                      administrator wondering why a choice they expected is
                      missing.
                    */}
                    <option
                      value={draft.a}
                      disabled={violators.some((violator) => violator.losesEverythingIfA)}
                    >
                      {violators.some((violator) => violator.losesEverythingIfA)
                        ? t("separation.wouldEmptyOption", { permission: labelFor(draft.a) })
                        : labelFor(draft.a)}
                    </option>
                    <option
                      value={draft.b}
                      disabled={violators.some((violator) => violator.losesEverythingIfB)}
                    >
                      {violators.some((violator) => violator.losesEverythingIfB)
                        ? t("separation.wouldEmptyOption", { permission: labelFor(draft.b) })
                        : labelFor(draft.b)}
                    </option>
                  </Select>
                </Field>

                <ul className="rect-separation__violators" aria-label={t("separation.affectedLabel")}>
                  {violators.map((violator) => {
                    const losingTypes =
                      losing === draft.a ? violator.typesGrantingA : violator.typesGrantingB;
                    return (
                      <li key={violator.userId} className="rect-separation__violator">
                        <span className="rect-separation__person">{violator.displayName}</span>
                        {losing === "" ? (
                          <span className="rect-separation__pending">{t("separation.chooseToSee")}</span>
                        ) : (
                          <span className="rect-separation__loses">
                            {t("separation.wouldLose", {
                              types: losingTypes.map((type) => type.name).join(t("common.listSeparator")),
                            })}
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </>
            )}

            <div className="rect-separation__actions">
              <Button type="button" variant="secondary" onClick={resetForm}>
                {t("separation.startOver")}
              </Button>
              <Button type="submit" variant="primary" disabled={!canSave || create.isPending}>
                {create.isPending ? t("separation.saving") : t("separation.declare")}
              </Button>
            </div>
          </div>
        )}

        {blockedNames(create.error).length > 0 ? (
          <p className="rect-separation__error" role="alert">
            {t("separation.wouldEmptyPeople", {
              names: blockedNames(create.error).join(t("common.listSeparator")),
            })}
          </p>
        ) : messageFor(create.error, t("separation.saveFailed")) ? (
          <p className="rect-separation__error" role="alert">
            {messageFor(create.error, t("separation.saveFailed"))}
          </p>
        ) : null}

        {messageFor(preview.error, t("separation.checkFailed")) ? (
          <p className="rect-separation__error" role="alert">
            {messageFor(preview.error, t("separation.checkFailed"))}
          </p>
        ) : null}
      </form>

      <ConfirmDialog
        open={pendingDelete !== null}
        title={t("separation.removeTitle")}
        description={t("separation.removeMessage")}
        confirmLabel={t("separation.remove")}
        tone="danger"
        pending={remove.isPending}
        onConfirm={() => { if (pendingDelete) remove.mutate(pendingDelete.id); }}
        onClose={() => setPendingDelete(null)}
      />
    </div>
  );
}
